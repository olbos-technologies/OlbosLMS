import { describe, expect, it } from 'vitest';
import { hashPassword, needsUpgrade, parsePhc, verifyPassword } from './password.js';
import {
  generateApiKey,
  generateNumericCode,
  generateToken,
  hashToken,
  splitApiKey,
  tokenMatches,
} from './tokens.js';
import {
  assessPassword,
  clearFailedAttempts,
  evaluateSession,
  isLockedOut,
  normaliseEmail,
  registerFailedAttempt,
  sessionExpiry,
} from './policy.js';

describe('password hashing', () => {
  it('produces an argon2id PHC string and never the password itself', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
  });

  it('salts each hash, so equal passwords hash differently', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password-1'),
      hashPassword('same-password-1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('treats a missing or malformed hash as a failed login, not an error', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
    expect(await verifyPassword(undefined, 'anything')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('$argon2id$broken', 'anything')).toBe(false);
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty password/);
  });

  it('parses the PHC parameters it wrote', async () => {
    const parsed = parsePhc(await hashPassword('a-long-enough-password'));
    expect(parsed).toMatchObject({
      algorithm: 'argon2id',
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it('flags weaker or foreign hashes for upgrade', async () => {
    expect(needsUpgrade(await hashPassword('a-long-enough-password'))).toBe(false);
    expect(needsUpgrade('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsUpgrade('$argon2i$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA')).toBe(true);
    expect(needsUpgrade('$2b$12$legacybcrypthash')).toBe(true);
    expect(needsUpgrade(null)).toBe(true);
  });
});

describe('opaque tokens', () => {
  it('returns a token with its digest, and stores only the digest', () => {
    const { token, tokenHash } = generateToken();
    expect(token).toHaveLength(43);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken().token));
    expect(tokens.size).toBe(500);
  });

  it('matches only the issued token', () => {
    const { token, tokenHash } = generateToken();
    expect(tokenMatches(token, tokenHash)).toBe(true);
    expect(tokenMatches(`${token}x`, tokenHash)).toBe(false);
    expect(tokenMatches(token, 'deadbeef')).toBe(false);
    expect(tokenMatches(token, '')).toBe(false);
  });
});

describe('api keys', () => {
  it('splits into a public prefix and a secret', () => {
    const { key, prefix, secret } = generateApiKey();
    expect(key).toBe(`${prefix}.${secret}`);
    expect(prefix).toMatch(/^olb_live_[0-9a-f]{12}$/);
    expect(splitApiKey(key)).toEqual({ prefix, secret });
  });

  it('round-trips every generated key, including base64url secrets with _ and -', () => {
    // base64url contains '_' and '-', so an underscore separator would split
    // in the wrong place. Generate enough keys to hit both characters.
    for (let i = 0; i < 200; i += 1) {
      const { key, prefix, secret } = generateApiKey();
      expect(splitApiKey(key)).toEqual({ prefix, secret });
    }
  });

  it('supports a test environment prefix', () => {
    expect(generateApiKey('test').prefix.startsWith('olb_test_')).toBe(true);
  });

  it('rejects malformed keys', () => {
    expect(splitApiKey('nonsense')).toBeNull();
    expect(splitApiKey('other_live_0123456789ab.secret')).toBeNull();
    expect(splitApiKey('olb_live_0123456789ab.')).toBeNull();
    expect(splitApiKey('olb_live_short.secret')).toBeNull();
    expect(splitApiKey('.secret')).toBeNull();
  });
});

describe('numeric codes', () => {
  it('produces zero-padded codes of the requested length', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateNumericCode()).toMatch(/^\d{6}$/);
    }
    expect(generateNumericCode(8)).toMatch(/^\d{8}$/);
  });
});

describe('email normalisation', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  John.Smith@Example.COM ')).toBe('john.smith@example.com');
  });

  it('preserves dots and plus addressing', () => {
    expect(normaliseEmail('john.smith+safety@example.com')).toBe('john.smith+safety@example.com');
  });
});

describe('password policy', () => {
  it('accepts a long passphrase', () => {
    const result = assessPassword('rivers-hollow-basket-lantern');
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it('rejects a short password', () => {
    expect(assessPassword('short1!').problems).toContain('Use at least 12 characters');
  });

  it('bounds the length so hashing cannot be abused', () => {
    expect(assessPassword('a'.repeat(500)).ok).toBe(false);
  });

  it('rejects well-known breached passwords', () => {
    expect(assessPassword('password123').problems).toContain(
      'This password appears on well-known breach lists',
    );
  });

  it('rejects repeated and sequential runs', () => {
    expect(assessPassword('aaaabbbbccccdddd').problems).toContain(
      'Avoid repeating the same character four or more times',
    );
    expect(assessPassword('qwertyabcdefghij').problems).toContain(
      'Avoid sequences such as "abcd" or "4321"',
    );
  });

  it('rejects a password built from the user own details', () => {
    const result = assessPassword('JohnSmithOlbos2026', {
      email: 'john.smith@acme.test',
      firstName: 'John',
      lastName: 'Smith',
      organizationName: 'Olbos',
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(
      'Do not use your name, email or organization name in your password',
    );
  });

  it('can enforce composition rules when an organization requires them', () => {
    const strict = {
      minLength: 12,
      maxLength: 200,
      requireMixedCase: true,
      requireNumber: true,
      requireSymbol: true,
    };
    // No upper case, no digit and no symbol (hyphens would count as one).
    const result = assessPassword('rivershollowbasket', {}, strict);
    expect(result.problems).toEqual([
      'Use both upper and lower case letters',
      'Include at least one number',
      'Include at least one symbol',
    ]);
  });
});

describe('login throttling', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('does not lock before the threshold', () => {
    const state = registerFailedAttempt({ failedLoginCount: 3 }, now);
    expect(state.failedLoginCount).toBe(4);
    expect(state.lockedUntil).toBeNull();
  });

  it('locks at the threshold', () => {
    const state = registerFailedAttempt({ failedLoginCount: 9 }, now);
    expect(state.failedLoginCount).toBe(10);
    expect(state.lockedUntil).toEqual(new Date('2026-06-01T12:15:00Z'));
  });

  it('backs off exponentially across repeated lockouts', () => {
    expect(registerFailedAttempt({ failedLoginCount: 19 }, now).lockedUntil).toEqual(
      new Date('2026-06-01T12:30:00Z'),
    );
    expect(registerFailedAttempt({ failedLoginCount: 29 }, now).lockedUntil).toEqual(
      new Date('2026-06-01T13:00:00Z'),
    );
  });

  it('reports lockout state against the clock', () => {
    expect(
      isLockedOut({ failedLoginCount: 10, lockedUntil: new Date('2026-06-01T12:10:00Z') }, now),
    ).toBe(true);
    expect(
      isLockedOut({ failedLoginCount: 10, lockedUntil: new Date('2026-06-01T11:50:00Z') }, now),
    ).toBe(false);
    expect(isLockedOut({ failedLoginCount: 0 }, now)).toBe(false);
  });

  it('clears the counter after a successful login', () => {
    expect(clearFailedAttempts()).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });
});

describe('sessions', () => {
  const policy = { ttlHours: 12, idleTimeoutMinutes: 60 };
  const now = new Date('2026-06-01T12:00:00Z');

  it('computes the absolute expiry', () => {
    expect(sessionExpiry(policy, now)).toEqual(new Date('2026-06-02T00:00:00Z'));
  });

  it('accepts a fresh session', () => {
    expect(
      evaluateSession(
        { expiresAt: new Date('2026-06-02T00:00:00Z'), lastSeenAt: now },
        policy,
        now,
      ),
    ).toBe('VALID');
  });

  it('rejects a revoked session first', () => {
    expect(
      evaluateSession(
        { expiresAt: new Date('2026-06-02T00:00:00Z'), lastSeenAt: now, revokedAt: now },
        policy,
        now,
      ),
    ).toBe('REVOKED');
  });

  it('rejects an expired session', () => {
    expect(
      evaluateSession(
        { expiresAt: new Date('2026-06-01T11:00:00Z'), lastSeenAt: now },
        policy,
        now,
      ),
    ).toBe('EXPIRED');
  });

  it('rejects an idle session', () => {
    expect(
      evaluateSession(
        {
          expiresAt: new Date('2026-06-02T00:00:00Z'),
          lastSeenAt: new Date('2026-06-01T10:30:00Z'),
        },
        policy,
        now,
      ),
    ).toBe('IDLE_TIMEOUT');
  });
});
