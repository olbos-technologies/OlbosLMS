/**
 * Object storage (§31).
 *
 * Bytes never live in PostgreSQL. The database holds metadata plus a
 * `storageKey`; the key itself is never returned to a client — downloads go
 * through short-lived signed URLs so that access control is re-evaluated on
 * every request rather than baked into a permanent link.
 */

export interface StorageObject {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly checksumSha256?: string;
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
  readonly method: 'GET' | 'PUT';
  readonly headers?: Record<string, string>;
}

export interface PutOptions {
  readonly contentType: string;
  readonly contentLength?: number;
  readonly cacheControl?: string;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer | Uint8Array, options: PutOptions): Promise<StorageObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** A short-lived URL a browser can use to download the object. */
  signedDownloadUrl(key: string, expiresInSeconds?: number, fileName?: string): Promise<SignedUrl>;
  /** A short-lived URL a browser can PUT to, so bytes bypass the API. */
  signedUploadUrl(key: string, options: PutOptions, expiresInSeconds?: number): Promise<SignedUrl>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'TOO_LARGE' | 'REJECTED' | 'DRIVER_ERROR',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// ---------------------------------------------------------------------------
// Key construction and upload validation
// ---------------------------------------------------------------------------

/**
 * Every object key starts with the tenant id. Even if an authorization bug let
 * a caller name an arbitrary key, the prefix keeps tenants in separate
 * namespaces and makes a per-tenant lifecycle rule or export trivial.
 */
export const buildStorageKey = (parts: {
  organizationId: string;
  scope: string;
  id: string;
  fileName: string;
}): string => {
  const safeName = sanitiseFileName(parts.fileName);
  return `tenants/${parts.organizationId}/${parts.scope}/${parts.id}/${safeName}`;
};

/** Strips path traversal and control characters from a user-supplied name. */
export const sanitiseFileName = (fileName: string): string => {
  const base = fileName.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    // Control characters first: they can hide an extension from a human eye.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    // A leading dot or dash produces a hidden file or a stray CLI flag.
    .replace(/^[.-]+/, '')
    .slice(0, 180);
  return cleaned.length > 0 ? cleaned : 'file';
};

export const assertTenantOwnsKey = (key: string, organizationId: string): void => {
  if (!key.startsWith(`tenants/${organizationId}/`)) {
    throw new StorageError('Storage key does not belong to the calling organization', 'REJECTED');
  }
};

/**
 * Content types accepted for upload (§31). Anything not listed is rejected:
 * an allowlist is the only durable defence against a user-supplied type.
 */
export const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'application/zip',
]);

/**
 * Types that are rendered inline in a browser and can therefore execute script
 * in the storage origin. They are always served as an attachment.
 */
const NEVER_INLINE = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml']);

export const isInlineSafe = (contentType: string): boolean => !NEVER_INLINE.has(contentType);

export interface UploadValidation {
  readonly ok: boolean;
  readonly problems: string[];
}

export const validateUpload = (input: {
  fileName: string;
  contentType: string;
  byteSize: number;
  maxBytes: number;
}): UploadValidation => {
  const problems: string[] = [];

  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    problems.push(`Files of type ${input.contentType} are not accepted`);
  }
  if (input.byteSize <= 0) {
    problems.push('The file is empty');
  }
  if (input.byteSize > input.maxBytes) {
    problems.push(
      `The file is ${Math.round(input.byteSize / 1_048_576)} MB; the limit is ${Math.round(
        input.maxBytes / 1_048_576,
      )} MB`,
    );
  }
  // Double extensions are the classic way to smuggle an executable past a
  // name-based check.
  if (/\.(exe|bat|cmd|sh|ps1|jar|com|scr|msi|dll)$/i.test(input.fileName)) {
    problems.push('Executable files are not accepted');
  }

  return { ok: problems.length === 0, problems };
};

/**
 * Malware scanning hook. Uploads land with `scanStatus = PENDING` and are not
 * downloadable until a scanner marks them CLEAN. The default implementation
 * below is explicit that no scanning is configured, rather than pretending a
 * file is safe.
 */
export interface MalwareScanner {
  readonly name: string;
  scan(
    object: StorageObject,
  ): Promise<{ status: 'CLEAN' | 'INFECTED' | 'SKIPPED'; detail?: string }>;
}

export class NoopScanner implements MalwareScanner {
  readonly name = 'noop';
  async scan(): Promise<{ status: 'SKIPPED'; detail: string }> {
    return {
      status: 'SKIPPED',
      detail: 'No malware scanner is configured for this deployment.',
    };
  }
}
