import type { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '@olbos/database';

/**
 * Liveness, readiness and health (§50).
 *
 * `/healthz` answers "is this process running" and must never touch a
 * dependency — a slow database should not cause an orchestrator to restart a
 * perfectly healthy process. `/readyz` answers "should traffic be routed here"
 * and does check dependencies.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  const startedAt = Date.now();

  app.get('/healthz', async () => ({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get('/readyz', async (_request, reply) => {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    const began = Date.now();
    try {
      await getPrismaClient().$queryRaw`SELECT 1`;
      checks.database = { ok: true, latencyMs: Date.now() - began };
    } catch (error) {
      checks.database = {
        ok: false,
        latencyMs: Date.now() - began,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }

    const ready = Object.values(checks).every((check) => check.ok);
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not-ready', checks });
  });
};
