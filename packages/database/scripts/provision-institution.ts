import { hashPassword, passwordSchema, emailSchema } from '@olbos/auth';
import { getPrismaClient } from '../src/client.js';
import { provisionInstitution } from '../src/provision-institution.js';

const required = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
};
const prisma = getPrismaClient();
try {
  const password = passwordSchema.parse(process.env.INSTITUTION_OWNER_PASSWORD);
  const ownerPasswordHash = await hashPassword(password);
  const result = await provisionInstitution(prisma, {
    name: required('INSTITUTION_NAME'),
    slug: required('INSTITUTION_SLUG'),
    ownerEmail: emailSchema.parse(required('INSTITUTION_OWNER_EMAIL')).toLowerCase(),
    ownerFirstName: required('INSTITUTION_OWNER_FIRST_NAME'),
    ownerLastName: required('INSTITUTION_OWNER_LAST_NAME'),
    ownerPasswordHash,
    timezone: process.env.INSTITUTION_TIMEZONE ?? 'UTC',
    planKey: process.env.INSTITUTION_PLAN_KEY ?? 'starter',
  });
  process.stdout.write(
    `Institution ${result.slug} provisioned; trial ends ${result.trialEndsAt.toISOString()}.\n`,
  );
} catch (_error) {
  process.stderr.write(
    'Institution provisioning failed. Check the required inputs, plan configuration, database availability, and whether the workspace code already exists. No existing institution is overwritten.\n',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
