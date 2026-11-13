import { getPrismaClient, type PrismaClient } from '@olbos/database';
import { resolveEntitlements, type EntitlementSet, type SubscriptionStatus } from '@olbos/billing';
import {
  type AccessContext,
  type PlatformRole,
  type RoleAssignment,
  type RoleKey,
  type RoleScopeType,
} from '@olbos/permissions';

/**
 * Builds the authorization context for a request.
 *
 * Everything here is derived from the authenticated session — never from a
 * header, a query parameter or a request body. That is what makes
 * "never trust a client-supplied tenant id" true rather than aspirational.
 */

export interface RequestPrincipal {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly platformRole: PlatformRole;
  readonly access: AccessContext;
  readonly entitlements: EntitlementSet;
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly timezone: string;
    readonly settings: Record<string, unknown>;
  } | null;
}

/**
 * Every employee beneath `employeeId` in the supervisor tree.
 *
 * Recursive, because a plant manager supervises through their line supervisors;
 * a one-level check would show them an incomplete team.
 */
export const loadSupervisedEmployeeIds = async (
  prisma: PrismaClient,
  organizationId: string,
  employeeId: string,
): Promise<string[]> => {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE reports AS (
      SELECT id FROM employees
       WHERE "organizationId" = ${organizationId}::uuid
         AND "supervisorId" = ${employeeId}::uuid
         AND "deletedAt" IS NULL
      UNION
      SELECT e.id FROM employees e
        JOIN reports r ON e."supervisorId" = r.id
       WHERE e."organizationId" = ${organizationId}::uuid
         AND e."deletedAt" IS NULL
    )
    SELECT id FROM reports
  `;
  return rows.map((row) => row.id);
};

export const buildPrincipal = async (
  userId: string,
  prisma: PrismaClient = getPrismaClient(),
): Promise<RequestPrincipal | null> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      platformRole: true,
      employee: { select: { id: true } },
      roles: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: {
          scopeType: true,
          scopeId: true,
          role: { select: { id: true, key: true, permissions: true } },
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          status: true,
          settings: true,
          subscription: {
            select: {
              status: true,
              plan: { select: { entitlements: true } },
            },
          },
          entitlementOverrides: true,
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') return null;

  const roles: RoleAssignment[] = user.roles.map((assignment) => ({
    roleId: assignment.role.id,
    key: assignment.role.key as RoleKey,
    // Stored permissions are validated on write; an unknown slug simply never
    // matches a check, so a stale grant cannot widen access.
    permissions: assignment.role.permissions as AccessContext['roles'][number]['permissions'],
    scopeType: assignment.scopeType as RoleScopeType,
    scopeId: assignment.scopeId,
  }));

  const employeeId = user.employee?.id ?? null;
  const supervisedEmployeeIds =
    employeeId && user.organizationId
      ? await loadSupervisedEmployeeIds(prisma, user.organizationId, employeeId)
      : [];

  const access: AccessContext = {
    userId: user.id,
    organizationId: user.organizationId,
    platformRole: user.platformRole as PlatformRole,
    roles,
    employeeId,
    supervisedEmployeeIds,
  };

  const subscription = user.organization?.subscription;
  const entitlements = resolveEntitlements({
    planEntitlements: subscription?.plan.entitlements ?? [],
    overrides: user.organization?.entitlementOverrides ?? [],
    subscriptionStatus: (subscription?.status as SubscriptionStatus | undefined) ?? 'ACTIVE',
  });

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    platformRole: user.platformRole as PlatformRole,
    access,
    entitlements,
    organization: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          timezone: user.organization.timezone,
          settings: (user.organization.settings as Record<string, unknown>) ?? {},
        }
      : null,
  };
};
