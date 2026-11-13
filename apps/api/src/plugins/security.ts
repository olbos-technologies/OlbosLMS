import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import { getEnv } from '@olbos/config';

/**
 * Transport-level security (§37, §38).
 *
 * CORS is an allowlist, never a reflection of the Origin header, and
 * credentials are enabled — which makes a permissive origin policy actively
 * dangerous, so it is not offered even in development.
 */

export const securityPlugin: FastifyPluginAsync = fp(
  async (app) => {
    const env = getEnv();
    const isProduction = env.NODE_ENV === 'production';

    await app.register(cookie, {
      secret: env.SESSION_SECRET,
      parseOptions: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      },
    });

    await app.register(helmet, {
      // The API serves JSON, not documents, but the headers still matter for
      // the verification page and for any content served through it.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    });

    await app.register(cors, {
      origin: (origin, callback) => {
        // Same-origin and server-to-server requests carry no Origin header.
        if (!origin) return callback(null, true);
        callback(null, env.WEB_ORIGIN.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id', 'authorization'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    });

    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      // Authenticated callers are bucketed per user; anonymous ones per IP.
      keyGenerator: (request) => request.principal?.userId ?? request.ip,
      addHeadersOnExceeding: { 'x-ratelimit-remaining': true },
    });

    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('x-content-type-options', 'nosniff');
      reply.header('x-frame-options', 'DENY');
      reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
      // Responses carry tenant data; no shared cache should keep them.
      if (!reply.hasHeader('cache-control')) {
        reply.header('cache-control', 'no-store');
      }
      return payload;
    });
  },
  { name: 'olbos-security' },
);
