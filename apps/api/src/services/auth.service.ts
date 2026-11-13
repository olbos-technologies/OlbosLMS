import { getEnv } from '@olbos/config';
import { getPrismaClient, type PrismaClient } from '@olbos/database';
import {
  clearFailedAttempts,
  evaluateSession,
  generateToken,
  hashPassword,
  hashToken,
  isLockedOut,
  needsUpgrade,
  normaliseEmail,
  registerFailedAttempt,
  sessionExpiry,
  verifyPassword,
  type SessionPolicy,
} from '@olbos/auth';
import { recordAudit } from './audit.service.js';

/**
 * Authentication (§6).
 *
 * Design points worth stating:
 *   * Login answers identically for an unknown email, a wrong password and a
 *     disabled account, and always pays the Argon2 cost, so the endpoint is not
 *     a user-enumeration oracle or a timing oracle.
 *   * Sessions are server-side records. The cookie carries an opaque token; the
 *     database stores only its SHA-256, so a database leak does not hand out
 *     live sessions, and revocation is immediate.
 *   * A successful login rotates the session token, which closes session
 *     fixation.
 */

export const SESSION_COOKIE = 'olbos_session';
export const CSRF_COOKIE = 'olbos_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const sessionPolicy = (): SessionPolicy => {
  const env = getEnv();
  return {
    ttlHours: env.SESSION_TTL_HOURS,
    idleTimeoutMinutes: env.SESSION_IDLE_TIMEOUT_MINUTES,
  };
};

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
  /** Restricts the login to one tenant, e.g. from a per-organization sign-in page. */
  readonly organizationSlug?: string | null;
}

export type LoginFailureReason =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_INACTIVE'
  | 'ORGANIZATION_INACTIVE';

export type LoginResult =
  | {
      readonly ok: true;
      readonly userId: string;
      readonly organizationId: string | null;
      readonly sessionToken: string;
      readonly csrfToken: string;
      readonly expiresAt: Date;
    }
  | { readonly ok: false; readonly reason: LoginFailureReason; readonly retryAfter?: Date };

/**
 * A dummy hash with the current parameters. Verifying against it when no user
 * matches keeps the response time of an unknown email indistinguishable from a
 * wrong password.
 */
let dummyHash: string | null = null;
const getDummyHash = async (): Promise<string> => {
  dummyHash ??= await hashPassword(`no-such-user-${Math.random()}`);
  return dummyHash;
};

export const login = async (
  input: LoginInput,
  prisma: PrismaClient = getPrismaClient(),
): Promise<LoginResult> => {
  const emailNormalized = normaliseEmail(input.email);

  const user = await prisma.user.findFirst({
    where: {
      emailNormalized,
      deletedAt: null,
      ...(input.organizationSlug ? { organization: { slug: input.organizationSlug } } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      passwordHash: true,
      status: true,
      failedLoginCount: true,
      lockedUntil: true,
      firstName: true,
      lastName: true,
      organization: { select: { status: true } },
    },
  });

  // Always do the work, even when there is no user.
  const storedHash = user?.passwordHash ?? (await getDummyHash());
  const passwordMatches = await verifyPassword(storedHash, input.password);

  const failAudit = async (reason: LoginFailureReason): Promise<void> => {
    await recordAudit(
      {
        organizationId: user?.organizationId ?? null,
        actorUserId: user?.id ?? null,
        actorLabel: emailNormalized,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id ?? null,
        summary: `Failed sign-in (${reason})`,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
      prisma,
    );
  };

  if (!user || !user.passwordHash) {
    await failAudit('INVALID_CREDENTIALS');
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (isLockedOut({ failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil })) {
    await failAudit('ACCOUNT_LOCKED');
    return { ok: false, reason: 'ACCOUNT_LOCKED', retryAfter: user.lockedUntil ?? undefined };
  }

  if (!passwordMatches) {
    const next = registerFailedAttempt({
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
    });
    await prisma.user.update({ where: { id: user.id }, data: next });
    await failAudit('INVALID_CREDENTIALS');
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (user.status !== 'ACTIVE') {
    await failAudit('ACCOUNT_INACTIVE');
    return { ok: false, reason: 'ACCOUNT_INACTIVE' };
  }

  if (user.organization && ['SUSPENDED', 'CANCELLED'].includes(user.organization.status)) {
    await failAudit('ORGANIZATION_INACTIVE');
    return { ok: false, reason: 'ORGANIZATION_INACTIVE' };
  }

  const policy = sessionPolicy();
  const now = new Date();
  const expiresAt = sessionExpiry(policy, now);
  const session = generateToken();
  const csrf = generateToken(24);

  await prisma.$transaction(async (tx) => {
    await tx.userSession.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: session.tokenHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        expiresAt,
        lastSeenAt: now,
      },
    });

    const data: Record<string, unknown> = { ...clearFailedAttempts(), lastLoginAt: now };
    // Transparent upgrade when the stored hash predates the current policy.
    if (needsUpgrade(user.passwordHash)) {
      data.passwordHash = await hashPassword(input.password);
      data.passwordUpdatedAt = now;
    }
    await tx.user.update({ where: { id: user.id }, data });
  });

  await recordAudit(
    {
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorLabel: `${user.firstName} ${user.lastName}`,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      summary: 'Signed in',
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
    },
    prisma,
  );

  return {
    ok: true,
    userId: user.id,
    organizationId: user.organizationId,
    sessionToken: session.token,
    csrfToken: csrf.token,
    expiresAt,
  };
};

export interface ResolvedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly organizationId: string | null;
}

/**
 * Validates a session token and refreshes its idle timer.
 *
 * Returns null for anything that is not a live session: unknown token, expired,
 * idle too long, or revoked.
 */
export const resolveSession = async (
  token: string,
  prisma: PrismaClient = getPrismaClient(),
  now: Date = new Date(),
): Promise<ResolvedSession | null> => {
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      expiresAt: true,
      lastSeenAt: true,
      revokedAt: true,
    },
  });

  if (!session) return null;

  const validity = evaluateSession(session, sessionPolicy(), now);
  if (validity !== 'VALID') {
    if (validity === 'IDLE_TIMEOUT' || validity === 'EXPIRED') {
      await prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: validity },
      });
    }
    return null;
  }

  // Touch at most once a minute: a write on every request would make the
  // sessions table the busiest in the system for no benefit.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    organizationId: session.organizationId,
  };
};

export const revokeSession = async (
  token: string,
  reason = 'LOGOUT',
  prisma: PrismaClient = getPrismaClient(),
): Promise<void> => {
  if (!token) return;
  await prisma.userSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
};

/** Revokes every session for a user — used on password change and by support. */
export const revokeAllSessions = async (
  userId: string,
  reason: string,
  prisma: PrismaClient = getPrismaClient(),
  exceptSessionId?: string,
): Promise<number> => {
  const result = await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
};

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Issues a reset token if the email matches an account.
 *
 * The caller always reports the same thing to the user, whether or not an
 * account exists — this function's return value is for the mailer, not the
 * response body.
 */
export const requestPasswordReset = async (
  email: string,
  options: { ipAddress?: string | null; requestId?: string | null } = {},
  prisma: PrismaClient = getPrismaClient(),
): Promise<{ userId: string; token: string; expiresAt: Date } | null> => {
  const user = await prisma.user.findFirst({
    where: { emailNormalized: normaliseEmail(email), deletedAt: null, status: 'ACTIVE' },
    select: { id: true, organizationId: true },
  });
  if (!user) return null;

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt, requestIp: options.ipAddress ?? null },
  });

  await recordAudit(
    {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'user',
      entityId: user.id,
      summary: 'Password reset requested',
      ipAddress: options.ipAddress ?? null,
      requestId: options.requestId ?? null,
    },
    prisma,
  );

  return { userId: user.id, token, expiresAt };
};

export type ResetOutcome = 'OK' | 'INVALID_TOKEN' | 'EXPIRED' | 'ALREADY_USED';

export const completePasswordReset = async (
  token: string,
  newPassword: string,
  options: { ipAddress?: string | null; requestId?: string | null } = {},
  prisma: PrismaClient = getPrismaClient(),
): Promise<ResetOutcome> => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record) return 'INVALID_TOKEN';
  if (record.usedAt) return 'ALREADY_USED';
  if (record.expiresAt <= new Date()) return 'EXPIRED';

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } });
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordUpdatedAt: now, ...clearFailedAttempts() },
    });
    // A password reset invalidates every existing session: if the reset was
    // driven by a compromise, the attacker's session must not survive it.
    await tx.userSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
    });
  });

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { organizationId: true },
  });

  await recordAudit(
    {
      organizationId: user?.organizationId ?? null,
      actorUserId: record.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: record.userId,
      summary: 'Password reset completed',
      ipAddress: options.ipAddress ?? null,
      requestId: options.requestId ?? null,
    },
    prisma,
  );

  return 'OK';
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
  options: { sessionId?: string; ipAddress?: string | null; requestId?: string | null } = {},
  prisma: PrismaClient = getPrismaClient(),
): Promise<{ ok: boolean; reason?: 'INVALID_CURRENT_PASSWORD' }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true, passwordHash: true },
  });
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    return { ok: false, reason: 'INVALID_CURRENT_PASSWORD' };
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordUpdatedAt: now },
    });
    // Other devices are signed out; the current session survives so the user is
    // not thrown out of the page they just used.
    await tx.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.sessionId ? { id: { not: options.sessionId } } : {}),
      },
      data: { revokedAt: now, revokedReason: 'PASSWORD_CHANGED' },
    });
  });

  await recordAudit(
    {
      organizationId: user.organizationId,
      actorUserId: userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userId,
      summary: 'Password changed',
      ipAddress: options.ipAddress ?? null,
      requestId: options.requestId ?? null,
    },
    prisma,
  );

  return { ok: true };
};
