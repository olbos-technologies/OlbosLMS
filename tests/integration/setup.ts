import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * Integration tests run against a real PostgreSQL database.
 *
 * TEST_DATABASE_URL must point at a throwaway database — the suite truncates
 * every table between tests. The guard below refuses to run if the URL looks
 * like a production database.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), override: false });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Integration tests need a throwaway database ' +
      '(see .env.example and `docker compose up -d postgres`).',
  );
}

const databaseName = testUrl.split('/').pop()?.split('?')[0] ?? '';
if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}": ` +
      'the database name must contain "test".',
  );
}

// Every module loaded from here on (including @olbos/config) sees the test URL.
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
// Assigned, not defaulted: `.env` has already been loaded above, so `??=`
// would leave the developer's LOG_LEVEL in place and bury the test output.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
process.env.SESSION_SECRET ??= 'test-session-secret-'.padEnd(48, 'x');
process.env.CERTIFICATE_SIGNING_SECRET ??= 'test-certificate-secret-'.padEnd(48, 'y');

// Bring the schema up to date before any suite connects. `migrate deploy` is
// idempotent, so repeated runs are cheap.
execFileSync(
  path.join(repoRoot, 'packages/database/node_modules/.bin/prisma'),
  ['migrate', 'deploy', '--schema', path.join(repoRoot, 'packages/database/prisma/schema.prisma')],
  { stdio: 'pipe', env: { ...process.env, DATABASE_URL: testUrl } },
);
