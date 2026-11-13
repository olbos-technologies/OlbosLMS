import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SESSION_SECRET: 'a'.repeat(64),
  CERTIFICATE_SIGNING_SECRET: 'b'.repeat(64),
};

describe('parseEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = parseEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:3000']);
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('rejects a missing session secret', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: undefined })).toThrow(EnvValidationError);
  });

  it('rejects the placeholder secret shipped in .env.example', () => {
    expect(() =>
      parseEnv({ ...base, SESSION_SECRET: 'replace-me-with-64-hex-characters-etc-etc' }),
    ).toThrow(/placeholder secret/);
  });

  it('rejects a short secret', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });

  it('parses a comma separated origin list', () => {
    const env = parseEnv({
      ...base,
      WEB_ORIGIN: 'https://a.example.com, https://b.example.com',
    });
    expect(env.WEB_ORIGIN).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('requires S3 credentials when the s3 driver is selected', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET is required/);
  });

  it('requires an API key when the anthropic AI driver is selected', () => {
    expect(() => parseEnv({ ...base, AI_DRIVER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('forbids reusing one secret for two purposes in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://app.example.com',
        CERTIFICATE_SIGNING_SECRET: base.SESSION_SECRET,
      }),
    ).toThrow(/must differ in production/);
  });

  it('forbids plaintext web origins in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'http://app.example.com' }),
    ).toThrow(/must use https in production/);
  });
});
