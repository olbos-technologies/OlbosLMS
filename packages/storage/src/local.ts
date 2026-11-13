import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  StorageError,
  isInlineSafe,
  type PutOptions,
  type SignedUrl,
  type StorageDriver,
  type StorageObject,
} from './driver.js';

/**
 * Filesystem driver for local development and self-hosted single-node
 * deployments.
 *
 * Signed URLs point back at the API (`/api/v1/files/local/...`) and carry an
 * HMAC over the key, the expiry and the method, so the local driver has the
 * same "short-lived, verifiable link" semantics as S3 rather than a weaker
 * development-only shortcut.
 */
export interface LocalDriverOptions {
  readonly rootPath: string;
  readonly baseUrl: string;
  readonly signingSecret: string;
}

const encode = (value: string): string => encodeURIComponent(value);

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  constructor(private readonly options: LocalDriverOptions) {}

  /** Resolves a key to a path, refusing anything that escapes the root. */
  private resolve(key: string): string {
    const root = path.resolve(this.options.rootPath);
    const resolved = path.resolve(root, key);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new StorageError(`Storage key escapes the storage root: ${key}`, 'REJECTED');
    }
    return resolved;
  }

  async put(key: string, body: Buffer | Uint8Array, options: PutOptions): Promise<StorageObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const buffer = Buffer.from(body);
    await writeFile(target, buffer);
    await writeFile(
      `${target}.meta.json`,
      JSON.stringify({ contentType: options.contentType, cacheControl: options.cacheControl }),
    );
    return {
      key,
      size: buffer.byteLength,
      contentType: options.contentType,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async get(key: string): Promise<Buffer> {
    // Resolve outside the try: a key that escapes the root is a rejected key,
    // not a missing object, and must not be masked as NOT_FOUND.
    const target = this.resolve(key);
    try {
      return await readFile(target);
    } catch {
      throw new StorageError(`No object at ${key}`, 'NOT_FOUND');
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
    await rm(`${target}.meta.json`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolve(key);
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }

  private sign(key: string, method: 'GET' | 'PUT', expiresAtSeconds: number): string {
    return createHmac('sha256', this.options.signingSecret)
      .update(`${method}:${key}:${expiresAtSeconds}`)
      .digest('hex');
  }

  async signedDownloadUrl(
    key: string,
    expiresInSeconds = 300,
    fileName?: string,
  ): Promise<SignedUrl> {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.sign(key, 'GET', expiresAtSeconds);
    const query = new URLSearchParams({
      key,
      expires: String(expiresAtSeconds),
      signature,
    });
    if (fileName) query.set('filename', fileName);

    return {
      url: `${this.options.baseUrl.replace(/\/+$/, '')}/api/v1/files/local?${query.toString()}`,
      expiresAt: new Date(expiresAtSeconds * 1000),
      method: 'GET',
    };
  }

  async signedUploadUrl(
    key: string,
    options: PutOptions,
    expiresInSeconds = 300,
  ): Promise<SignedUrl> {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.sign(key, 'PUT', expiresAtSeconds);
    const query = new URLSearchParams({
      key,
      expires: String(expiresAtSeconds),
      signature,
      contentType: options.contentType,
    });

    return {
      url: `${this.options.baseUrl.replace(/\/+$/, '')}/api/v1/files/local?${query.toString()}`,
      expiresAt: new Date(expiresAtSeconds * 1000),
      method: 'PUT',
      headers: { 'content-type': options.contentType },
    };
  }

  /** Verifies a signature produced by `signedDownloadUrl`/`signedUploadUrl`. */
  verifySignature(input: {
    key: string;
    method: 'GET' | 'PUT';
    expires: number;
    signature: string;
    now?: Date;
  }): { valid: boolean; reason?: string } {
    const now = input.now ?? new Date();
    if (input.expires * 1000 < now.getTime()) {
      return { valid: false, reason: 'This link has expired' };
    }
    const expected = Buffer.from(this.sign(input.key, input.method, input.expires), 'hex');
    const provided = Buffer.from(input.signature ?? '', 'hex');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return { valid: false, reason: 'This link is not valid' };
    }
    return { valid: true };
  }

  /**
   * `Content-Disposition` for a download. Types that a browser would render
   * inline and that can carry script are always forced to attachment.
   */
  static contentDisposition(contentType: string, fileName: string): string {
    const disposition = isInlineSafe(contentType) ? 'inline' : 'attachment';
    return `${disposition}; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encode(fileName)}`;
  }

  async readMetadata(key: string): Promise<{ contentType: string } | null> {
    const target = this.resolve(key);
    try {
      const raw = await readFile(`${target}.meta.json`, 'utf8');
      return JSON.parse(raw) as { contentType: string };
    } catch {
      return null;
    }
  }
}
