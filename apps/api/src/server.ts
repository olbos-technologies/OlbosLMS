import Fastify, { type FastifyInstance } from 'fastify';
import { getEnv } from '@olbos/config';
import { normaliseError } from './errors.js';
import { contextPlugin } from './plugins/context.js';
import { securityPlugin } from './plugins/security.js';
import { healthRoutes } from './routes/health.js';
import { publicRoutes } from './routes/public.js';
import { registerV1Routes } from './routes/v1/index.js';

/**
 * Builds the Fastify instance.
 *
 * Kept separate from `main.ts` so tests can build a server, drive it with
 * `app.inject()` and never open a socket.
 */
export const buildServer = async (): Promise<FastifyInstance> => {
  const env = getEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url,
          requestId: (request as { requestId?: string }).requestId,
        }),
      },
    },
    // The reverse proxy in front of the API sets these; without it every
    // client would share one rate-limit bucket and every audit row would
    // record the proxy's address.
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    disableRequestLogging: false,
    ajv: { customOptions: { removeAdditional: false } },
  });

  await app.register(securityPlugin);
  await app.register(contextPlugin);

  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `No route for ${request.method} ${request.url}`,
        requestId: request.requestId,
      },
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const normalised = normaliseError(error, request.requestId);

    const logPayload = {
      err: error,
      code: normalised.body.error.code,
      status: normalised.status,
      route: `${request.method} ${request.url}`,
      userId: request.principal?.userId,
      organizationId: request.principal?.organizationId,
      alert: normalised.alert,
    };

    if (normalised.logLevel === 'error') request.log.error(logPayload, 'request failed');
    else request.log.warn(logPayload, 'request rejected');

    return reply.status(normalised.status).send(normalised.body);
  });

  await app.register(healthRoutes);
  await app.register(publicRoutes);
  await app.register(registerV1Routes, { prefix: '/api/v1' });

  return app;
};
