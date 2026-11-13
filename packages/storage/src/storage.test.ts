import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertTenantOwnsKey,
  buildStorageKey,
  isInlineSafe,
  NoopScanner,
  sanitiseFileName,
  StorageError,
  validateUpload,
} from './driver.js';
import { LocalStorageDriver } from './local.js';
import { S3StorageDriver } from './s3.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

describe('storage keys', () => {
  it('always begins with the tenant prefix', () => {
    const key = buildStorageKey({
      organizationId: ORG,
      scope: 'submissions',
      id: 'sub-1',
      fileName: 'report.pdf',
    });
    expect(key).toBe('tenants/org-1/submissions/sub-1/report.pdf');
  });

  it('rejects a key that belongs to another tenant', () => {
    const key = buildStorageKey({
      organizationId: OTHER_ORG,
      scope: 'submissions',
      id: 'sub-1',
      fileName: 'report.pdf',
    });
    expect(() => assertTenantOwnsKey(key, ORG)).toThrow(StorageError);
    expect(() => assertTenantOwnsKey(key, OTHER_ORG)).not.toThrow();
  });

  it('is not fooled by a tenant id that is a prefix of another', () => {
    expect(() => assertTenantOwnsKey('tenants/org-10/a/b/c.pdf', 'org-1')).toThrow(StorageError);
  });
});

describe('sanitiseFileName', () => {
  it('strips directory traversal', () => {
    expect(sanitiseFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFileName('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
  });

  it('neutralises characters used to disguise an extension', () => {
    // U+202E (right-to-left override) is the classic spoofing trick: it makes
    // "exe.gnp" render as "png.exe" in a file listing.
    expect(sanitiseFileName('invoice\u202egnp.exe')).toBe('invoice-gnp.exe');
    // ASCII control characters are removed outright.
    expect(sanitiseFileName('report\u0007.pdf')).toBe('report.pdf');
    expect(sanitiseFileName('bad\u0000name.pdf')).toBe('badname.pdf');
  });

  it('collapses unsafe characters', () => {
    expect(sanitiseFileName('my report (final) v2.pdf')).toBe('my-report-final-v2.pdf');
  });

  it('never produces a hidden file or a leading dash', () => {
    expect(sanitiseFileName('.bashrc')).toBe('bashrc');
    expect(sanitiseFileName('--flag.txt')).toBe('flag.txt');
  });

  it('falls back to a placeholder for an unusable name', () => {
    expect(sanitiseFileName('...')).toBe('file');
    expect(sanitiseFileName('')).toBe('file');
  });

  it('bounds the length', () => {
    expect(sanitiseFileName(`${'a'.repeat(500)}.pdf`).length).toBeLessThanOrEqual(180);
  });
});

describe('validateUpload', () => {
  const base = { fileName: 'safety.pdf', contentType: 'application/pdf', maxBytes: 10_485_760 };

  it('accepts an allowed document', () => {
    expect(validateUpload({ ...base, byteSize: 1024 }).ok).toBe(true);
  });

  it('rejects a type that is not on the allowlist', () => {
    const result = validateUpload({
      ...base,
      contentType: 'application/x-msdownload',
      byteSize: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/are not accepted/);
  });

  it('rejects an empty file', () => {
    expect(validateUpload({ ...base, byteSize: 0 }).problems).toContain('The file is empty');
  });

  it('rejects a file over the limit and says by how much', () => {
    const result = validateUpload({ ...base, byteSize: 20_971_520 });
    expect(result.problems[0]).toBe('The file is 20 MB; the limit is 10 MB');
  });

  it('rejects executables even when the declared type looks harmless', () => {
    const result = validateUpload({ ...base, fileName: 'training.pdf.exe', byteSize: 1024 });
    expect(result.problems).toContain('Executable files are not accepted');
  });
});

describe('inline safety', () => {
  it('never renders SVG or HTML inline', () => {
    expect(isInlineSafe('image/svg+xml')).toBe(false);
    expect(isInlineSafe('text/html')).toBe(false);
    expect(isInlineSafe('application/pdf')).toBe(true);
    expect(isInlineSafe('image/png')).toBe(true);
  });

  it('forces an attachment disposition for unsafe types', () => {
    expect(LocalStorageDriver.contentDisposition('image/svg+xml', 'logo.svg')).toMatch(
      /^attachment;/,
    );
    expect(LocalStorageDriver.contentDisposition('application/pdf', 'cert.pdf')).toMatch(
      /^inline;/,
    );
  });
});

describe('malware scanning hook', () => {
  it('reports SKIPPED rather than pretending a file is clean', async () => {
    const result = await new NoopScanner().scan();
    expect(result.status).toBe('SKIPPED');
    expect(result.detail).toMatch(/No malware scanner is configured/);
  });
});

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'olbos-storage-'));
    driver = new LocalStorageDriver({
      rootPath: root,
      baseUrl: 'http://localhost:4000',
      signingSecret: 'local-storage-signing-secret-0123456789',
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const key = 'tenants/org-1/documents/doc-1/policy.pdf';

  it('round-trips an object', async () => {
    const stored = await driver.put(key, Buffer.from('hello world'), {
      contentType: 'application/pdf',
    });
    expect(stored.size).toBe(11);
    expect(stored.checksumSha256).toHaveLength(64);
    expect((await driver.get(key)).toString()).toBe('hello world');
    expect(await driver.exists(key)).toBe(true);
  });

  it('reports a missing object as NOT_FOUND', async () => {
    await expect(driver.get('tenants/org-1/nope.pdf')).rejects.toThrow(StorageError);
  });

  it('refuses a key that escapes the storage root, and says so', async () => {
    // A traversal attempt must not be reported as a plain "not found": that
    // would hide a security-relevant condition from the logs.
    await expect(driver.get('../../../etc/passwd')).rejects.toThrow(/escapes the storage root/);
    await expect(
      driver.put('../escape.pdf', Buffer.from('x'), { contentType: 'application/pdf' }),
    ).rejects.toThrow(/escapes the storage root/);
    await expect(driver.exists('../../etc/passwd')).rejects.toThrow(/escapes the storage root/);
  });

  it('deletes without complaining about a missing object', async () => {
    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
    await expect(driver.delete(key)).resolves.toBeUndefined();
  });

  it('signs a download link that verifies', async () => {
    const signed = await driver.signedDownloadUrl(key, 300);
    const url = new URL(signed.url);
    const result = driver.verifySignature({
      key,
      method: 'GET',
      expires: Number(url.searchParams.get('expires')),
      signature: url.searchParams.get('signature') as string,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered key', async () => {
    const signed = await driver.signedDownloadUrl(key, 300);
    const url = new URL(signed.url);
    const result = driver.verifySignature({
      key: 'tenants/org-2/documents/doc-1/policy.pdf',
      method: 'GET',
      expires: Number(url.searchParams.get('expires')),
      signature: url.searchParams.get('signature') as string,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('This link is not valid');
  });

  it('rejects a download signature reused for an upload', async () => {
    const signed = await driver.signedDownloadUrl(key, 300);
    const url = new URL(signed.url);
    expect(
      driver.verifySignature({
        key,
        method: 'PUT',
        expires: Number(url.searchParams.get('expires')),
        signature: url.searchParams.get('signature') as string,
      }).valid,
    ).toBe(false);
  });

  it('rejects an expired link', async () => {
    const signed = await driver.signedDownloadUrl(key, 300);
    const url = new URL(signed.url);
    const result = driver.verifySignature({
      key,
      method: 'GET',
      expires: Number(url.searchParams.get('expires')),
      signature: url.searchParams.get('signature') as string,
      now: new Date(Date.now() + 600_000),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('This link has expired');
  });

  it('rejects a malformed signature without throwing', () => {
    expect(
      driver.verifySignature({ key, method: 'GET', expires: 9_999_999_999, signature: 'zz' }).valid,
    ).toBe(false);
  });
});

describe('S3StorageDriver presigning', () => {
  const driver = new S3StorageDriver({
    bucket: 'olbos-test',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });

  const now = new Date('2026-06-01T12:00:00Z');

  it('builds a virtual-hosted SigV4 URL with all required parameters', () => {
    const signed = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    const url = new URL(signed.url);
    expect(url.host).toBe('olbos-test.s3.us-east-1.amazonaws.com');
    expect(url.pathname).toBe('/tenants/org-1/a.pdf');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260601T120000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'AKIAIOSFODNN7EXAMPLE/20260601/us-east-1/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs and clock', () => {
    const a = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    const b = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    expect(a.url).toBe(b.url);
  });

  it('produces a different signature for a different key, method or expiry', () => {
    const base = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    const otherKey = driver.presignForTesting('GET', 'tenants/org-2/a.pdf', 300, now);
    const otherMethod = driver.presignForTesting('PUT', 'tenants/org-1/a.pdf', 300, now);
    const otherExpiry = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 600, now);
    expect(new Set([base.url, otherKey.url, otherMethod.url, otherExpiry.url]).size).toBe(4);
  });

  it('never leaks the secret key into the URL', () => {
    const signed = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    expect(signed.url).not.toContain('wJalrXUtnFEMI');
  });

  it('encodes reserved characters in the key', () => {
    const signed = driver.presignForTesting('GET', "tenants/org-1/report (final)'s.pdf", 300, now);
    expect(signed.url).toContain('%28final%29%27s.pdf');
    expect(signed.url).toContain('/tenants/org-1/');
  });

  it('uses path-style addressing for MinIO endpoints', () => {
    const minio = new S3StorageDriver({
      bucket: 'olbos-dev',
      region: 'us-east-1',
      accessKeyId: 'olbos',
      secretAccessKey: 'olbos-dev-secret',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
    });
    const url = new URL(minio.presignForTesting('PUT', 'tenants/org-1/a.pdf', 300, now).url);
    expect(url.protocol).toBe('http:');
    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toBe('/olbos-dev/tenants/org-1/a.pdf');
  });

  it('records the expiry it signed for', () => {
    const signed = driver.presignForTesting('GET', 'tenants/org-1/a.pdf', 300, now);
    expect(signed.expiresAt).toEqual(new Date('2026-06-01T12:05:00Z'));
  });

  it('refuses to construct without a bucket', () => {
    expect(
      () =>
        new S3StorageDriver({
          bucket: '',
          region: 'us-east-1',
          accessKeyId: 'a',
          secretAccessKey: 'b',
        }),
    ).toThrow(StorageError);
  });
});
