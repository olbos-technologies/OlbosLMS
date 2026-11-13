// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/generated/**',
      '**/coverage/**',
      'packages/database/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          // Tenant isolation guard: raw SQL must go through the audited helper.
          selector:
            "MemberExpression[property.name='$queryRawUnsafe'], MemberExpression[property.name='$executeRawUnsafe']",
          message:
            'Unsafe raw SQL is forbidden. Use Prisma query builders or the reviewed $queryRaw tagged template.',
        },
      ],
    },
  },
  {
    // AGENTS.md states that `getPrismaClient()` in a request handler is a review
    // failure, but nothing enforced it, and a Copilot review found the rule
    // already broken in billing.routes.ts. A rule a human has to remember is
    // not a control.
    //
    // Scoped to routes/v1 because that is exactly the authenticated,
    // tenant-scoped surface. routes/health.ts (a `SELECT 1` readiness probe)
    // and routes/public.ts (unauthenticated certificate verification, which is
    // cross-tenant by design) legitimately have no tenant context.
    files: ['apps/api/src/routes/v1/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@olbos/database',
              importNames: ['getPrismaClient'],
              message:
                'Request handlers must query through `request.db` (the tenant-scoped client). If a model genuinely cannot be tenant-scoped, say why in a comment and keep using request.db.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts', '**/seed.ts', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier,
);
