import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (§6).
 *
 * Argon2id at the OWASP-recommended parameter floor. The parameters are encoded
 * in the PHC string that gets stored, so raising them later is safe: an old
 * hash still verifies, and `needsUpgrade()` tells the login flow to re-hash the
 * password transparently on the user's next successful sign-in.
 */

/**
 * Argon2id. The library exposes this as an ambient const enum, which cannot be
 * referenced under `isolatedModules`, so the numeric value is inlined. The test
 * suite asserts that hashes really do carry the `$argon2id$` identifier.
 */
const ARGON2ID = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  /** 19 MiB, expressed in KiB as the library expects. */
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const hashPassword = async (password: string): Promise<string> => {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Cannot hash an empty password');
  }
  return hash(password, ARGON2_OPTIONS);
};

/**
 * Verifies a password against a stored PHC string.
 *
 * Never throws: a malformed or truncated stored hash must read as "wrong
 * password" rather than as an error that distinguishes one account from another.
 */
export const verifyPassword = async (
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> => {
  if (!storedHash || typeof password !== 'string' || password.length === 0) return false;
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
};

export interface Argon2Parameters {
  readonly algorithm: string;
  readonly version: number;
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

/**
 * Parses a PHC string such as
 * `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.
 * Returns null when the string is not a recognisable Argon2 hash.
 */
export const parsePhc = (storedHash: string): Argon2Parameters | null => {
  const parts = storedHash.split('$');
  // ['', 'argon2id', 'v=19', 'm=...,t=...,p=...', salt, hash]
  if (parts.length < 5) return null;

  const algorithm = parts[1];
  if (!algorithm?.startsWith('argon2')) return null;

  const version = Number(parts[2]?.replace('v=', ''));
  const params = new Map(
    (parts[3] ?? '').split(',').map((pair) => {
      const [key, value] = pair.split('=');
      return [key ?? '', Number(value)];
    }),
  );

  const memoryCost = params.get('m');
  const timeCost = params.get('t');
  const parallelism = params.get('p');
  if (
    !Number.isFinite(version) ||
    !Number.isFinite(memoryCost) ||
    !Number.isFinite(timeCost) ||
    !Number.isFinite(parallelism)
  ) {
    return null;
  }

  return {
    algorithm,
    version,
    memoryCost: memoryCost as number,
    timeCost: timeCost as number,
    parallelism: parallelism as number,
  };
};

/**
 * True when a stored hash was produced with weaker settings than current policy,
 * or is not Argon2id at all (for example an imported legacy hash).
 */
export const needsUpgrade = (storedHash: string | null | undefined): boolean => {
  if (!storedHash) return true;
  const parsed = parsePhc(storedHash);
  if (!parsed) return true;
  return (
    parsed.algorithm !== 'argon2id' ||
    parsed.memoryCost < ARGON2_OPTIONS.memoryCost ||
    parsed.timeCost < ARGON2_OPTIONS.timeCost ||
    parsed.parallelism < ARGON2_OPTIONS.parallelism
  );
};
