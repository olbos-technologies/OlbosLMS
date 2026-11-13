import { getEnv } from '@olbos/config';
import { getPrismaClient } from '@olbos/database';
import { buildServer } from './server.js';

/**
 * API entry point.
 *
 * Configuration is validated before anything else, so a misconfigured
 * deployment fails at start rather than at the first request.
 */
const main = async (): Promise<void> => {
  const env = getEnv();
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      // Stop accepting connections, finish in-flight requests, then release
      // the database pool. Doing it in that order avoids failing a request
      // that was already being served.
      await app.close();
      await getPrismaClient().$disconnect();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled promise rejection');
  });

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(
    { port: env.API_PORT, env: env.NODE_ENV, publicUrl: env.API_PUBLIC_URL },
    'OLBOS API listening',
  );
};

main().catch((error) => {
  // The logger may not exist yet if config validation failed.
  console.error('Failed to start the OLBOS API:', error);
  process.exit(1);
});
