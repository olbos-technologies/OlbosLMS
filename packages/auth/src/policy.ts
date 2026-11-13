import { z } from 'zod';

/**
 * Account policy: password strength, email normalisation, login throttling and
 * session lifetime (§6, §38).
 */

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Canonical form used for uniqueness and lookup. Lower-casing only — the local
 * part of an address is case-sensitive per RFC 5321, but every mail provider in
 * practice treats it case-insensitively, and treating `A@x.com` and `a@x.com`
 * as different accounts is a well-known source of duplicate-account confusion.
 *
 * Dots and plus-addressing are deliberately preserved: stripping them would
 * merge addresses that some providers genuinely treat as distinct.
 */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export const emailSchema = z.string().trim().min(3).max(320).email('Enter a valid email address');

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  readonly requireMixedCase: boolean;
  readonly requireNumber: boolean;
  readonly requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  // Length is the strongest single lever; composition rules are secondary.
  minLength: 12,
  // Bounded so a very long input cannot become an Argon2 denial-of-service.
  maxLength: 200,
  requireMixedCase: false,
  requireNumber: false,
  requireSymbol: false,
};

/**
 * Passwords seen so often in breach corpora that they are rejected outright.
 * A production deployment should additionally check a breached-password
 * service; this list is the offline floor.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'welcome1',
  'admin',
  'administrator',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'changeme',
  'changeme123',
  'trustno1',
  'olbos',
  'olbos123',
  'training',
  'safety123',
]);

export interface PasswordAssessment {
  readonly ok: boolean;
  readonly problems: string[];
  /** 0–4, in the manner of a strength meter. Advisory only. */
  readonly score: number;
}

const hasRepeatedRun = (value: string): boolean => /(.)\1{3,}/.test(value);

const hasSequentialRun = (value: string): boolean => {
  const lower = value.toLowerCase();
  for (let i = 0; i + 3 < lower.length + 1 && i + 3 <= lower.length; i += 1) {
    const window = lower.slice(i, i + 4);
    if (window.length < 4) break;
    let ascending = true;
    let descending = true;
    for (let j = 1; j < window.length; j += 1) {
      const delta = window.charCodeAt(j) - window.charCodeAt(j - 1);
      if (delta !== 1) ascending = false;
      if (delta !== -1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
};

export interface PasswordContext {
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly organizationName?: string;
}

export const assessPassword = (
  password: string,
  context: PasswordContext = {},
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordAssessment => {
  const problems: string[] = [];

  if (password.length < policy.minLength) {
    problems.push(`Use at least ${policy.minLength} characters`);
  }
  if (password.length > policy.maxLength) {
    problems.push(`Use at most ${policy.maxLength} characters`);
  }
  if (policy.requireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) {
    problems.push('Use both upper and lower case letters');
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    problems.push('Include at least one number');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    problems.push('Include at least one symbol');
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    problems.push('This password appears on well-known breach lists');
  }
  if (hasRepeatedRun(password)) {
    problems.push('Avoid repeating the same character four or more times');
  }
  if (hasSequentialRun(password)) {
    problems.push('Avoid sequences such as "abcd" or "4321"');
  }

  // Personal details are the first thing an attacker tries.
  const personal = [
    context.email?.split('@')[0],
    context.firstName,
    context.lastName,
    context.organizationName,
  ]
    .filter((value): value is string => !!value && value.length >= 3)
    .map((value) => value.toLowerCase());

  if (personal.some((value) => lower.includes(value))) {
    problems.push('Do not use your name, email or organization name in your password');
  }

  const variety =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/\d/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  const lengthScore = password.length >= 20 ? 2 : password.length >= 14 ? 1 : 0;
  const score = problems.length > 0 ? 0 : Math.min(4, 1 + lengthScore + Math.max(0, variety - 1));

  return { ok: problems.length === 0, problems, score };
};

export const passwordSchema = z
  .string()
  .min(1, 'Enter a password')
  .superRefine((value, ctx) => {
    for (const problem of assessPassword(value).problems) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }
  });

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

export interface LockoutPolicy {
  readonly maxFailedAttempts: number;
  readonly lockoutMinutes: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 10,
  lockoutMinutes: 15,
};

export interface LockoutState {
  readonly failedLoginCount: number;
  readonly lockedUntil?: Date | null;
}

export const isLockedOut = (state: LockoutState, now: Date = new Date()): boolean =>
  !!state.lockedUntil && state.lockedUntil > now;

/**
 * The next lockout state after a failed attempt. Locking is exponential in the
 * number of lockouts already served, so credential stuffing gets slower while a
 * legitimate user who mistypes once is barely inconvenienced.
 */
export const registerFailedAttempt = (
  state: LockoutState,
  now: Date = new Date(),
  policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY,
): { failedLoginCount: number; lockedUntil: Date | null } => {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount < policy.maxFailedAttempts) {
    return { failedLoginCount, lockedUntil: state.lockedUntil ?? null };
  }

  const lockoutNumber = Math.floor(failedLoginCount / policy.maxFailedAttempts);
  const minutes = policy.lockoutMinutes * 2 ** Math.min(lockoutNumber - 1, 5);
  return { failedLoginCount, lockedUntil: new Date(now.getTime() + minutes * 60_000) };
};

export const clearFailedAttempts = (): { failedLoginCount: number; lockedUntil: null } => ({
  failedLoginCount: 0,
  lockedUntil: null,
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionPolicy {
  readonly ttlHours: number;
  readonly idleTimeoutMinutes: number;
}

export interface SessionState {
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt?: Date | null;
}

export type SessionValidity = 'VALID' | 'EXPIRED' | 'IDLE_TIMEOUT' | 'REVOKED';

export const evaluateSession = (
  session: SessionState,
  policy: SessionPolicy,
  now: Date = new Date(),
): SessionValidity => {
  if (session.revokedAt) return 'REVOKED';
  if (session.expiresAt <= now) return 'EXPIRED';
  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  if (idleMs > policy.idleTimeoutMinutes * 60_000) return 'IDLE_TIMEOUT';
  return 'VALID';
};

export const sessionExpiry = (policy: SessionPolicy, now: Date = new Date()): Date =>
  new Date(now.getTime() + policy.ttlHours * 3_600_000);
