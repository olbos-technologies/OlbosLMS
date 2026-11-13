import { randomUUID } from 'node:crypto';
import { createPrismaClient, forTenant, type PrismaClient } from '@olbos/database';

let client: PrismaClient | undefined;

export const db = (): PrismaClient => {
  client ??= createPrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: ['error'] });
  return client;
};

export const disconnect = async (): Promise<void> => {
  await client?.$disconnect();
  client = undefined;
};

/**
 * Empties every table. TRUNCATE does not fire the row-level append-only
 * triggers, so audit tables are cleared too.
 */
export const resetDatabase = async (): Promise<void> => {
  const prisma = db();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // Test-harness only: the identifiers come from pg_tables, never from input.
  // eslint-disable-next-line no-restricted-syntax
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

export interface TenantFixture {
  organizationId: string;
  slug: string;
  tenant: ReturnType<typeof forTenant>;
}

/** Creates an isolated organization plus a tenant-scoped client for it. */
export const createTenant = async (
  slug = `t-${randomUUID().slice(0, 8)}`,
): Promise<TenantFixture> => {
  const org = await db().organization.create({
    data: { slug, name: `Org ${slug}`, type: 'MANUFACTURING', status: 'ACTIVE' },
  });
  return { organizationId: org.id, slug, tenant: forTenant(org.id, db()) };
};
