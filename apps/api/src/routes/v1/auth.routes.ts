import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getEnv } from '@olbos/config';
import { emailSchema, passwordSchema } from '@olbos/auth';
import { effectivePermissions } from '@olbos/permissions';
import { ApiError } from '../../errors.js';
import { ok, parseBody } from '../../lib/http.js';
import {
  changePassword,
  completePasswordReset,
  CSRF_COOKIE,
  login,
  requestPasswordReset,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
} from '../../services/auth.service.js';

/**
 * Authentication endpoints.
 *
 * The session cookie is HttpOnly (so script cannot read it) while the CSRF
 * cookie is deliberately readable, because the SPA has to echo it back in a
 * header. That asymmetry is the whole point of the double-submit pattern.
 */

const setSessionCookies = (
  reply: FastifyReply,
  tokens: { sessionToken: string; csrfToken: string; expiresAt: Date },
): void => {
  const env = getEnv();
  const secure = env.NODE_ENV === 'production';

  reply.setCookie(SESSION_COOKIE, tokens.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: tokens.expiresAt,
  });

  reply.setCookie(CSRF_COOKIE, tokens.csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: tokens.expiresAt,
  });
};

const clearSessionCookies = (reply: FastifyReply): void => {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Sign-in is the endpoint credential-stuffing hits, so it gets its own,
  // much tighter budget than the global limit.
  const authRateLimit = { max: 10, timeWindow: '5 minutes' };

  app.post(
    '/auth/login',
    { config: { skipCsrf: true, rateLimit: authRateLimit } },
    async (request, reply) => {
      const body = parseBody(
        request,
        z.object({
          email: emailSchema,
          password: z.string().min(1).max(200),
          organizationSlug: z.string().max(64).optional(),
        }),
      );

      const result = await login({
        email: body.email,
        password: body.password,
        organizationSlug: body.organizationSlug ?? null,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
        requestId: request.requestId,
      });

      if (!result.ok) {
        if (result.reason === 'ACCOUNT_LOCKED') {
          return reply.status(429).send({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.',
              requestId: request.requestId,
            },
          });
        }
        // Every other failure — unknown email, wrong password, disabled
        // account, suspended organization — answers identically, so the
        // endpoint cannot be used to discover which accounts exist.
        throw new ApiError('UNAUTHENTICATED', 'That email and password do not match.');
      }

      setSessionCookies(reply, result);

      return ok({
        userId: result.userId,
        organizationId: result.organizationId,
        expiresAt: result.expiresAt.toISOString(),
        csrfToken: result.csrfToken,
      });
    },
  );

  app.post('/auth/logout', { config: { skipCsrf: true } }, async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) {
      await revokeSession(token, 'LOGOUT');
      if (request.principal) {
        await request.audit({
          action: 'LOGOUT',
          entityType: 'user',
          entityId: request.principal.userId,
          summary: 'Signed out',
        });
      }
    }
    clearSessionCookies(reply);
    return ok({ signedOut: true });
  });

  app.get('/auth/session', async (request) => {
    const principal = request.principal;
    if (!principal) return ok({ authenticated: false });

    return ok({
      authenticated: true,
      user: {
        id: principal.userId,
        email: principal.email,
        firstName: principal.firstName,
        lastName: principal.lastName,
        platformRole: principal.platformRole,
      },
      organization: principal.organization,
      permissions: effectivePermissions(principal.access),
      entitlements: principal.entitlements.enabledKeys(),
    });
  });

  app.post(
    '/auth/password/forgot',
    { config: { skipCsrf: true, rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const body = parseBody(request, z.object({ email: emailSchema }));

      const issued = await requestPasswordReset(body.email, {
        ipAddress: request.ip,
        requestId: request.requestId,
      });

      if (issued) {
        // The mail transport is wired in the worker; the token is logged here
        // in development so the flow is testable without a mailbox.
        request.log.info(
          { userId: issued.userId, expiresAt: issued.expiresAt },
          'password reset token issued',
        );
      }

      // Always the same answer, whether or not the account exists.
      return ok({
        message: 'If that email matches an account, a reset link is on its way.',
      });
    },
  );

  app.post(
    '/auth/password/reset',
    { config: { skipCsrf: true, rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = parseBody(
        request,
        z.object({ token: z.string().min(10).max(200), password: passwordSchema }),
      );

      const outcome = await completePasswordReset(body.token, body.password, {
        ipAddress: request.ip,
        requestId: request.requestId,
      });

      if (outcome !== 'OK') {
        throw ApiError.badRequest('That reset link is no longer valid. Please request a new one.');
      }

      clearSessionCookies(reply);
      return ok({ message: 'Your password has been reset. Please sign in.' });
    },
  );

  app.post('/auth/password/change', async (request) => {
    const principal = request.requireAuth();
    const body = parseBody(
      request,
      z.object({
        currentPassword: z.string().min(1).max(200),
        newPassword: passwordSchema,
      }),
    );

    const result = await changePassword(principal.userId, body.currentPassword, body.newPassword, {
      sessionId: request.sessionId ?? undefined,
      ipAddress: request.ip,
      requestId: request.requestId,
    });

    if (!result.ok) {
      throw ApiError.badRequest('Your current password is not correct.', [
        { field: 'currentPassword', message: 'Incorrect password' },
      ]);
    }

    return ok({ message: 'Password updated. Other devices have been signed out.' });
  });

  app.get('/auth/sessions', async (request) => {
    const principal = request.requireAuth();
    const sessions = await request.db.userSession.findMany({
      where: { userId: principal.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceLabel: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });

    return ok(
      sessions.map((session) => ({
        ...session,
        current: session.id === request.sessionId,
      })),
    );
  });

  app.post('/auth/sessions/revoke-others', async (request) => {
    const principal = request.requireAuth();
    const revoked = await revokeAllSessions(
      principal.userId,
      'USER_REVOKED',
      undefined,
      request.sessionId ?? undefined,
    );

    await request.audit({
      action: 'LOGOUT',
      entityType: 'user_session',
      summary: `Revoked ${revoked} other session(s)`,
    });

    return ok({ revoked });
  });
};
