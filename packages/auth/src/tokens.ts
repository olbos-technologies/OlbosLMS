import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque tokens: sessions, password resets, email verification, API keys.
 *
 * The raw token is shown to the caller exactly once. Only its SHA-256 digest is
 * stored, so a database disclosure does not hand out live sessions. SHA-256 is
 * the right primitive here (unlike for passwords): the token already has 256
 * bits of entropy, so there is nothing to brute-force and no reason to pay
 * Argon2's cost on every request.
 */

export const TOKEN_BYTES = 32;

export interface IssuedToken {
  /** Returned to the caller once, never stored. */
  readonly token: string;
  /** Stored in the database. */
  readonly tokenHash: string;
}

export const generateToken = (bytes: number = TOKEN_BYTES): IssuedToken => {
  const token = randomBytes(bytes).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** Constant-time comparison of two hex digests. */
export const tokenMatches = (candidate: string, storedHash: string): boolean => {
  const a = Buffer.from(hashToken(candidate), 'hex');
  const b = Buffer.from(storedHash ?? '', 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

export interface ApiKeyMaterial {
  /** `olb_<env>_<handle>.<secret>` — shown once at creation. */
  readonly key: string;
  /** Non-secret lookup handle stored in the clear. */
  readonly prefix: string;
  readonly secret: string;
}

/**
 * API keys carry a non-secret prefix so a key can be located by index without
 * scanning every hash, and so the UI can show which key is which.
 *
 * The prefix and the secret are separated by `.` rather than `_`: the secret is
 * base64url, whose alphabet includes `_`, so an underscore separator cannot be
 * parsed back unambiguously.
 */
export const KEY_SEPARATOR = '.';

export const generateApiKey = (environment: 'live' | 'test' = 'live'): ApiKeyMaterial => {
  const prefix = `olb_${environment}_${randomBytes(6).toString('hex')}`;
  const secret = randomBytes(TOKEN_BYTES).toString('base64url');
  return { key: `${prefix}${KEY_SEPARATOR}${secret}`, prefix, secret };
};

export const splitApiKey = (key: string): { prefix: string; secret: string } | null => {
  const separator = key.indexOf(KEY_SEPARATOR);
  if (separator <= 0) return null;
  const prefix = key.slice(0, separator);
  const secret = key.slice(separator + 1);
  if (!/^olb_(live|test)_[0-9a-f]{12}$/.test(prefix) || secret.length === 0) return null;
  return { prefix, secret };
};

/** A short numeric code for MFA/step-up flows. Uniform, no modulo bias. */
export const generateNumericCode = (digits = 6): string => {
  const max = 10 ** digits;
  let value: number;
  do {
    value = randomBytes(4).readUInt32BE(0);
    // Reject the tail that would bias the distribution.
  } while (value >= Math.floor(0xffff_ffff / max) * max);
  return String(value % max).padStart(digits, '0');
};
