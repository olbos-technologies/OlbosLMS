import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { forTenant, getPrismaClient, type TenantClient } from '@olbos/database';
import { assertCan, type Decision, type Permission, type ResourceRef } from '@olbos/permissions';
import { assertEntitled, type EntitlementKey } from '@olbos/billing';
import { ApiError } from '../errors.js';
import { recordAudit, type AuditEvent } from '../services/audit.service.js';
import { buildPrincipal, type RequestPrincipal } from '../services/access-context.js';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  resolveSession,
  SESSION_COOKIE,
} from '../services/auth.service.js';

/**
 * Per-request context: request id, principal, tenant-scoped database client,
 * authorization helpers and audit shorthand.
 *
 * The tenant client is created from the session's organization. There is no
 * code path that takes a tenant id from a header, a query string or a body.
 */

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    principal: RequestPrincipal | null;
    sessionId: string | null;
    /** Tenant-scoped Prisma client. Throws if the request has no tenant. */
    readonly db: TenantClient;
    requireAuth(): RequestPrincipal;
    requireTenant(): { principal: RequestPrincipal; organizationId: string; db: TenantClient };
    authorize(permission: Permission, resource?: ResourceRef): Decision;
    requireEntitlement(key: EntitlementKey): void;
    audit(event: Omit<AuditEvent, 'organizationId' | 'actorUserId' | 'requestId'>): Promise<void>;
  }
}

/** Methods that change state and therefore require a CSRF token. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const timingSafeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const contextPlugin: FastifyPluginAsync = fp(
  async (app) => {
    const prisma = getPrismaClient();

    app.decorateRequest('requestId', '');
    app.decorateRequest('principal', null);
    app.decorateRequest('sessionId', null);

    // One tenant client per request, created lazily from the *session's*
    // organization. There is no setter: nothing in a request body or header can
    // influence which tenant the client is bound to.
    const tenantClientKey = Symbol('tenantClient');

    app.decorateRequest('db', {
      getter(this: FastifyRequest): TenantClient {
        const store = this as unknown as Record<symbol, TenantClient | undefined>;
        const cached = store[tenantClientKey];
        if (cached) return cached;
        const organizationId = this.principal?.organizationId;
        if (!organizationId) {
          throw ApiError.forbidden('This action requires an organization context.');
        }
        const client = forTenant(organizationId, prisma);
        store[tenantClientKey] = client;
        return client;
      },
    });

    app.decorateRequest('requireAuth', function requireAuth(this: FastifyRequest) {
      if (!this.principal) throw ApiError.unauthenticated();
      return this.principal;
    });

    app.decorateRequest('requireTenant', function requireTenant(this: FastifyRequest) {
      const principal = this.requireAuth();
      if (!principal.organizationId) {
        throw ApiError.forbidden(
          'This endpoint serves organization members. Platform staff must act through an organization.',
        );
      }
      return { principal, organizationId: principal.organizationId, db: this.db };
    });

    app.decorateRequest(
      'authorize',
      function authorize(this: FastifyRequest, permission: Permission, resource?: ResourceRef) {
        const principal = this.requireAuth();
        return assertCan(principal.access, permission, resource);
      },
    );

    app.decorateRequest(
      'requireEntitlement',
      function requireEntitlement(this: FastifyRequest, key: EntitlementKey) {
        const principal = this.requireAuth();
        assertEntitled(principal.entitlements, key);
      },
    );

    app.decorateRequest(
      'audit',
      async function audit(
        this: FastifyRequest,
        event: Omit<AuditEvent, 'organizationId' | 'actorUserId' | 'requestId'>,
      ) {
        const principal = this.principal;
        const result = await recordAudit(
          {
            ...event,
            organizationId: principal?.organizationId ?? null,
            actorUserId: principal?.userId ?? null,
            actorLabel:
              event.actorLabel ??
              (principal ? `${principal.firstName} ${principal.lastName}` : null),
            ipAddress: event.ipAddress ?? this.ip,
            userAgent: event.userAgent ?? this.headers['user-agent'] ?? null,
            requestId: this.requestId,
          },
          prisma,
        );
        if (!result.recorded) {
          // An audit write failing is itself an incident: log loudly, but do
          // not fail the user's request.
          this.log.error(
            { err: result.error, action: event.action, entityType: event.entityType },
            'audit write failed',
          );
        }
      },
    );

    // --- request id -------------------------------------------------------
    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const inbound = request.headers['x-request-id'];
      request.requestId =
        typeof inbound === 'string' && /^[\w-]{8,128}$/.test(inbound) ? inbound : randomUUID();
      reply.header('x-request-id', request.requestId);
    });

    // --- authentication ---------------------------------------------------
    app.addHook('onRequest', async (request: FastifyRequest) => {
      const token = request.cookies?.[SESSION_COOKIE];
      if (!token) return;

      const session = await resolveSession(token, prisma);
      if (!session) return;

      const principal = await buildPrincipal(session.userId, prisma);
      if (!principal) return;

      request.sessionId = session.sessionId;
      request.principal = principal;
    });

    // --- CSRF -------------------------------------------------------------
    // Double-submit: the cookie is readable by the SPA, the header is not
    // settable cross-origin, so a forged cross-site POST cannot produce both.
    app.addHook('onRequest', async (request: FastifyRequest) => {
      if (!MUTATING_METHODS.has(request.method)) return;
      if (!request.principal) return;
      if (request.routeOptions?.config?.skipCsrf === true) return;

      const cookie = request.cookies?.[CSRF_COOKIE];
      const header = request.headers[CSRF_HEADER];

      if (!cookie || typeof header !== 'string' || !timingSafeEquals(cookie, header)) {
        throw new ApiError(
          'FORBIDDEN',
          'Your session could not be verified. Please reload and try again.',
        );
      }
    });
  },
  { name: 'olbos-context' },
);

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Set on endpoints authenticated by something other than the session cookie. */
    skipCsrf?: boolean;
  }
}
