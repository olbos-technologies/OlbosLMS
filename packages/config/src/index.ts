import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Env, EnvValidationError, envSchema, parseEnv } from './env.js';

export { envSchema, parseEnv, EnvValidationError };
export type { Env };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Repository root, resolved from this file's location. Works from both `src`
 * (dev/test via the `development` export condition) and `dist` (built output).
 */
export const repoRoot = path.resolve(moduleDir, '../../..');

let cached: Env | undefined;

/**
 * Loads `.env` from the repository root (without overriding values already
 * present in the process environment) and returns the validated config.
 *
 * The result is memoised: the environment is read once per process.
 */
export const getEnv = (): Env => {
  if (cached) return cached;
  loadDotenv({ path: path.join(repoRoot, '.env'), override: false });
  cached = parseEnv(process.env);
  return cached;
};

/** Test-only escape hatch so suites can install a fixture environment. */
export const __setEnvForTesting = (env: Env | undefined): void => {
  cached = env;
};

export const isProduction = (env: Env = getEnv()): boolean => env.NODE_ENV === 'production';
export const isTest = (env: Env = getEnv()): boolean => env.NODE_ENV === 'test';
