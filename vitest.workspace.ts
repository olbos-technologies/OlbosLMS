import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Workspace packages are aliased to their TypeScript sources so that unit and
 * integration tests run without a prior build step. Runtime (api/worker/web)
 * still consumes the compiled `dist` output.
 */
const alias = {
  '@olbos/config': path.resolve(root, 'packages/config/src/index.ts'),
  '@olbos/core': path.resolve(root, 'packages/core/src/index.ts'),
  '@olbos/permissions': path.resolve(root, 'packages/permissions/src/index.ts'),
  '@olbos/auth': path.resolve(root, 'packages/auth/src/index.ts'),
  '@olbos/database': path.resolve(root, 'packages/database/src/index.ts'),
  '@olbos/billing': path.resolve(root, 'packages/billing/src/index.ts'),
  '@olbos/notifications': path.resolve(root, 'packages/notifications/src/index.ts'),
  '@olbos/storage': path.resolve(root, 'packages/storage/src/index.ts'),
  '@olbos/ai': path.resolve(root, 'packages/ai/src/index.ts'),
};

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      environment: 'node',
      globals: false,
      include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      environment: 'node',
      globals: false,
      include: ['tests/integration/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      setupFiles: ['tests/integration/setup.ts'],
      hookTimeout: 120_000,
      testTimeout: 60_000,
      // Integration tests share one Postgres database, so they must not run
      // concurrently. `singleFork` is what enforces that: every file runs in
      // one forked process, sequentially. (`fileParallelism` used to be set
      // here too, but it is a root-level option and not valid in a project
      // config — the repaired root tsconfig now catches that.)
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  },
]);
