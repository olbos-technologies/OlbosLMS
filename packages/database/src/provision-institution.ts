import { randomUUID } from 'node:crypto';
import { ROLE_TEMPLATES } from '@olbos/permissions';
import { PLAN_CATALOGUE } from '@olbos/billing';
import { forTenant, type PrismaClient } from './client.js';

export interface ProvisionInstitutionInput {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPasswordHash: string;
  timezone: string;
  planKey: string;
}

/** Operator-only provisioning. Existing institutions are never reseeded or overwritten. */
export const provisionInstitution = async (
  prisma: PrismaClient,
  input: ProvisionInstitutionInput,
) => {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) ||
    input.slug.length > 64 ||
    input.name.trim().length < 2 ||
    !input.ownerPasswordHash.startsWith('$argon2id$')
  )
    throw new Error('Invalid institution provisioning input.');
  new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
  const organizationId = randomUUID();
  const db = forTenant(organizationId, prisma);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 86400000);
  return db.$transaction(
    async (tx) => {
      let plan = await tx.plan.findUnique({ where: { key: input.planKey } });
      if (!plan) {
        const definition = PLAN_CATALOGUE.find((candidate) => candidate.key === input.planKey);
        if (!definition) throw new Error('Configure the requested plan before provisioning.');
        plan = await tx.plan.upsert({
          where: { key: definition.key },
          update: {},
          create: {
            key: definition.key,
            name: definition.name,
            tier: definition.tier,
            description: definition.description,
            priceCents: definition.priceCents,
            currency: definition.currency,
            interval: definition.interval,
            isPublic: definition.isPublic,
            sortOrder: definition.sortOrder,
            entitlements: {
              create: definition.entitlements.map((grant) => ({
                key: grant.key,
                valueType: grant.valueType,
                boolValue: grant.boolValue ?? null,
                numValue: grant.numValue ?? null,
              })),
            },
          },
        });
      }
      await tx.organization.create({
        data: {
          id: organizationId,
          slug: input.slug,
          name: input.name.trim(),
          type: 'COLLEGE',
          status: 'TRIAL',
          timezone: input.timezone,
          contactEmail: input.ownerEmail,
          billingEmail: input.ownerEmail,
        },
      });
      const roles = new Map<string, string>();
      for (const template of Object.values(ROLE_TEMPLATES)) {
        const role = await tx.role.create({
          data: {
            organizationId,
            key: template.key,
            name: template.name,
            description: template.description,
            isSystem: true,
            permissions: [...template.permissions],
          },
        });
        roles.set(template.key, role.id);
      }
      const owner = await tx.user.create({
        data: {
          organizationId,
          email: input.ownerEmail,
          emailNormalized: input.ownerEmail.trim().toLowerCase(),
          firstName: input.ownerFirstName,
          lastName: input.ownerLastName,
          passwordHash: input.ownerPasswordHash,
          passwordUpdatedAt: now,
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({
        data: {
          organizationId,
          userId: owner.id,
          roleId: roles.get('ORG_OWNER')!,
          scopeType: 'ORGANIZATION',
        },
      });
      await tx.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          status: 'TRIALING',
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          trialEndsAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          action: 'ORGANIZATION_CREATED',
          actorLabel: 'Institution provisioning operator',
          entityType: 'organization',
          entityId: organizationId,
          summary: 'Provisioned institution with a 14-day evaluation subscription',
        },
      });
      return { organizationId, slug: input.slug, ownerUserId: owner.id, trialEndsAt };
    },
    { timeout: 30000 },
  );
};
