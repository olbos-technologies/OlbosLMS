import { z } from 'zod';

/**
 * Environment schema for every OLBOS process.
 *
 * Rules:
 *  - Secrets are never given a default. A missing secret must fail the boot,
 *    not silently fall back to a well-known value.
 *  - Validation happens once, at process start, so a misconfigured deployment
 *    fails fast instead of at the first request.
 */

const nonEmpty = z.string().trim().min(1);

/** A secret must carry real entropy; 32 characters is the floor we enforce. */
const secret = z
  .string()
  .min(32, 'secret must be at least 32 characters of entropy')
  .refine((v) => !/^replace-me/i.test(v), 'placeholder secret from .env.example is not allowed');

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const port = z.coerce.number().int().min(1).max(65_535);

const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()).min(1));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: nonEmpty,
  TEST_DATABASE_URL: nonEmpty.optional(),
  REDIS_URL: nonEmpty.optional(),

  API_PORT: port.default(4000),
  API_HOST: nonEmpty.default('0.0.0.0'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_ORIGIN: csv.default('http://localhost:3000'),

  SESSION_SECRET: secret,
  CERTIFICATE_SIGNING_SECRET: secret,
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(10_080).default(60),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: nonEmpty.default('./.storage'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: nonEmpty.default('us-east-1'),
  S3_BUCKET: nonEmpty.optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(100 * 1024 * 1024),

  MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: port.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: nonEmpty.default('OLBOS LMS <no-reply@olbos.local>'),

  AI_DRIVER: z.enum(['null', 'anthropic']).default('null'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: nonEmpty.default('claude-sonnet-5'),

  BILLING_DRIVER: z.enum(['manual', 'stripe']).default('manual'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  BILLING_RETURN_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Cross-field rules that a flat schema cannot express. */
const crossFieldChecks = (env: Env): string[] => {
  const problems: string[] = [];

  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET) problems.push('S3_BUCKET is required when STORAGE_DRIVER=s3');
    if (!env.S3_ACCESS_KEY_ID) problems.push('S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3');
    if (!env.S3_SECRET_ACCESS_KEY) {
      problems.push('S3_SECRET_ACCESS_KEY is required when STORAGE_DRIVER=s3');
    }
  }

  if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
    problems.push('SMTP_HOST is required when MAIL_DRIVER=smtp');
  }

  if (env.AI_DRIVER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    problems.push('ANTHROPIC_API_KEY is required when AI_DRIVER=anthropic');
  }

  if (env.BILLING_DRIVER === 'stripe') {
    if (!env.BILLING_RETURN_URL)
      problems.push('BILLING_RETURN_URL is required when BILLING_DRIVER=stripe');
    if (env.BILLING_RETURN_URL && !env.WEB_ORIGIN.includes(new URL(env.BILLING_RETURN_URL).origin))
      problems.push('BILLING_RETURN_URL must use a configured WEB_ORIGIN');
    if (!env.STRIPE_SECRET_KEY)
      problems.push('STRIPE_SECRET_KEY is required when BILLING_DRIVER=stripe');
    if (!env.STRIPE_WEBHOOK_SECRET) {
      problems.push('STRIPE_WEBHOOK_SECRET is required when BILLING_DRIVER=stripe');
    }
  }

  if (env.NODE_ENV === 'production') {
    if (env.SESSION_SECRET === env.CERTIFICATE_SIGNING_SECRET) {
      problems.push('SESSION_SECRET and CERTIFICATE_SIGNING_SECRET must differ in production');
    }
    if (env.WEB_ORIGIN.some((origin) => origin.startsWith('http://'))) {
      problems.push('WEB_ORIGIN must use https in production');
    }
  }

  return problems;
};

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvValidationError(problems);
  }

  const problems = crossFieldChecks(parsed.data);
  if (problems.length > 0) throw new EnvValidationError(problems);

  return parsed.data;
};
