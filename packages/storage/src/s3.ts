import { createHash, createHmac } from 'node:crypto';
import {
  StorageError,
  type PutOptions,
  type SignedUrl,
  type StorageDriver,
  type StorageObject,
} from './driver.js';

/**
 * S3-compatible driver (AWS S3, MinIO, R2, Wasabi...).
 *
 * SigV4 is implemented directly rather than pulling in the AWS SDK: presigning
 * and four REST verbs are the whole surface we need, and the SDK is a large
 * dependency to carry — and to keep patched — for that.
 */

export interface S3DriverOptions {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Required for MinIO and other non-AWS endpoints. */
  readonly endpoint?: string;
  /** MinIO and local setups need path-style addressing. */
  readonly forcePathStyle?: boolean;
  readonly sessionToken?: string;
}

const sha256Hex = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value, 'utf8').digest();

/** RFC 3986 encoding. S3 requires `!'()*` to be escaped, which encodeURIComponent leaves alone. */
const uriEncode = (value: string, encodeSlash = true): string => {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encodeSlash ? encoded : encoded.replace(/%2F/g, '/');
};

const amzDate = (date: Date): { full: string; short: string } => {
  const full = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { full, short: full.slice(0, 8) };
};

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';

  constructor(private readonly options: S3DriverOptions) {
    if (!options.bucket) throw new StorageError('S3 bucket is required', 'DRIVER_ERROR');
  }

  private get host(): string {
    if (this.options.endpoint) {
      const url = new URL(this.options.endpoint);
      return this.options.forcePathStyle ? url.host : `${this.options.bucket}.${url.host}`;
    }
    return this.options.forcePathStyle
      ? `s3.${this.options.region}.amazonaws.com`
      : `${this.options.bucket}.s3.${this.options.region}.amazonaws.com`;
  }

  private get protocol(): string {
    return this.options.endpoint ? new URL(this.options.endpoint).protocol : 'https:';
  }

  private canonicalPath(key: string): string {
    const encodedKey = uriEncode(key, false);
    return this.options.forcePathStyle ? `/${this.options.bucket}/${encodedKey}` : `/${encodedKey}`;
  }

  private signingKey(shortDate: string): Buffer {
    return hmac(
      hmac(hmac(hmac(`AWS4${this.options.secretAccessKey}`, shortDate), this.options.region), 's3'),
      'aws4_request',
    );
  }

  /**
   * Builds a presigned URL using SigV4 query-string authentication, so a
   * browser can GET or PUT the object directly without seeing our credentials.
   */
  private presign(
    method: 'GET' | 'PUT',
    key: string,
    expiresInSeconds: number,
    extraQuery: Record<string, string> = {},
    now: Date = new Date(),
  ): SignedUrl {
    const { full, short } = amzDate(now);
    const credentialScope = `${short}/${this.options.region}/s3/aws4_request`;
    const canonicalUri = this.canonicalPath(key);
    const host = this.host;

    const query: Record<string, string> = {
      ...extraQuery,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.options.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': full,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    if (this.options.sessionToken) query['X-Amz-Security-Token'] = this.options.sessionToken;

    const canonicalQuery = Object.keys(query)
      .sort()
      .map((name) => `${uriEncode(name)}=${uriEncode(query[name] as string)}`)
      .join('&');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      UNSIGNED_PAYLOAD,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      full,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = hmac(this.signingKey(short), stringToSign).toString('hex');

    return {
      url: `${this.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      method,
    };
  }

  /** Signs a request we make ourselves, with the payload hash in the headers. */
  private signRequest(
    method: string,
    key: string,
    payload: Buffer,
    extraHeaders: Record<string, string> = {},
    now: Date = new Date(),
  ): { url: string; headers: Record<string, string> } {
    const { full, short } = amzDate(now);
    const host = this.host;
    const payloadHash = sha256Hex(payload);

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': full,
      ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
    };
    if (this.options.sessionToken) headers['x-amz-security-token'] = this.options.sessionToken;

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${(headers[name] as string).trim()}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');

    const canonicalRequest = [
      method,
      this.canonicalPath(key),
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${short}/${this.options.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      full,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const signature = hmac(this.signingKey(short), stringToSign).toString('hex');

    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { url: `${this.protocol}//${host}${this.canonicalPath(key)}`, headers };
  }

  async put(key: string, body: Buffer | Uint8Array, options: PutOptions): Promise<StorageObject> {
    const payload = Buffer.from(body);
    const { url, headers } = this.signRequest('PUT', key, payload, {
      'content-type': options.contentType,
      'content-length': String(payload.byteLength),
      ...(options.cacheControl ? { 'cache-control': options.cacheControl } : {}),
    });

    const response = await fetch(url, { method: 'PUT', headers, body: payload });
    if (!response.ok) {
      throw new StorageError(
        `S3 PUT failed with ${response.status}: ${await response.text()}`,
        'DRIVER_ERROR',
      );
    }

    return {
      key,
      size: payload.byteLength,
      contentType: options.contentType,
      checksumSha256: sha256Hex(payload),
    };
  }

  async get(key: string): Promise<Buffer> {
    const { url, headers } = this.signRequest('GET', key, Buffer.alloc(0));
    const response = await fetch(url, { method: 'GET', headers });
    if (response.status === 404) throw new StorageError(`No object at ${key}`, 'NOT_FOUND');
    if (!response.ok) {
      throw new StorageError(`S3 GET failed with ${response.status}`, 'DRIVER_ERROR');
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const { url, headers } = this.signRequest('DELETE', key, Buffer.alloc(0));
    const response = await fetch(url, { method: 'DELETE', headers });
    // S3 returns 204 for a successful delete and for a key that never existed.
    if (!response.ok && response.status !== 404) {
      throw new StorageError(`S3 DELETE failed with ${response.status}`, 'DRIVER_ERROR');
    }
  }

  async exists(key: string): Promise<boolean> {
    const { url, headers } = this.signRequest('HEAD', key, Buffer.alloc(0));
    const response = await fetch(url, { method: 'HEAD', headers });
    return response.ok;
  }

  async signedDownloadUrl(
    key: string,
    expiresInSeconds = 300,
    fileName?: string,
  ): Promise<SignedUrl> {
    const extra: Record<string, string> = {};
    if (fileName) {
      extra['response-content-disposition'] =
        `attachment; filename="${fileName.replace(/"/g, '')}"`;
    }
    return this.presign('GET', key, expiresInSeconds, extra);
  }

  async signedUploadUrl(
    key: string,
    _options: PutOptions,
    expiresInSeconds = 300,
  ): Promise<SignedUrl> {
    return this.presign('PUT', key, expiresInSeconds);
  }

  /** Exposed for tests: presigning is deterministic given a clock. */
  presignForTesting(
    method: 'GET' | 'PUT',
    key: string,
    expiresInSeconds: number,
    now: Date,
  ): SignedUrl {
    return this.presign(method, key, expiresInSeconds, {}, now);
  }
}
