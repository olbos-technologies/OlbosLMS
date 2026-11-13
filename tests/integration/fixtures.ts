import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword } from '@olbos/auth';
import { ROLE_TEMPLATES, type RoleKey } from '@olbos/permissions';
import { PLAN_CATALOGUE } from '@olbos/billing';
import { forTenant } from '@olbos/database';
import { db } from './helpers.js';

/**
 * Fixtures for API integration tests.
 *
 * Builds a complete, minimal tenant — plan, roles, structure, a course with a
 * requirement, and one employee per role — so a test can exercise a real
 * workflow rather than a mock.
 */

export const TEST_PASSWORD = 'integration-test-passphrase-42';

export interface TenantFixtures {
  readonly organizationId: string;
  readonly slug: string;
  readonly departmentId: string;
  readonly locationId: string;
  readonly jobRoleId: string;
  readonly courseId: string;
  readonly courseVersionId: string;
  readonly requirementId: string;
  readonly users: Record<string, { id: string; email: string; employeeId: string | null }>;
  readonly employees: Record<string, string>;
}

const planIdCache = new Map<string, string>();

const ensurePlan = async (key: string): Promise<string> => {
  const cached = planIdCache.get(key);
  if (cached) return cached;

  const definition = PLAN_CATALOGUE.find((plan) => plan.key === key);
  if (!definition) throw new Error(`Unknown plan ${key}`);

  const plan = await db().plan.upsert({
    where: { key },
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

  planIdCache.set(key, plan.id);
  return plan.id;
};

export interface SeedTenantOptions {
  readonly slug?: string;
  readonly plan?: string;
  /** Roles to create users for. */
  readonly roles?: readonly RoleKey[];
}

export const seedTenant = async (options: SeedTenantOptions = {}): Promise<TenantFixtures> => {
  const slug = options.slug ?? `t-${randomUUID().slice(0, 8)}`;
  const planId = await ensurePlan(options.plan ?? 'professional');
  const prisma = db();

  const organization = await prisma.organization.create({
    data: {
      slug,
      name: `Org ${slug}`,
      type: 'MANUFACTURING',
      status: 'ACTIVE',
      timezone: 'UTC',
      subscription: {
        create: {
          planId,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      },
    },
  });

  const tenant = forTenant(organization.id, prisma);
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const roleIds = new Map<RoleKey, string>();
  for (const template of Object.values(ROLE_TEMPLATES)) {
    const role = await tenant.role.create({
      data: {
        organizationId: organization.id,
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
        permissions: [...template.permissions],
      },
    });
    roleIds.set(template.key, role.id);
  }

  const department = await tenant.department.create({
    data: { organizationId: organization.id, name: 'Maintenance' },
  });
  const location = await tenant.location.create({
    data: { organizationId: organization.id, name: 'Plant 1' },
  });
  const jobRole = await tenant.jobRole.create({
    data: {
      organizationId: organization.id,
      title: 'Maintenance Technician',
      hazardExposures: ['hazardous-energy'],
    },
  });

  const course = await tenant.course.create({
    data: {
      organizationId: organization.id,
      title: 'Lockout/Tagout',
      slug: 'lockout-tagout',
      type: 'SAFETY',
      status: 'PUBLISHED',
      versions: {
        create: {
          organizationId: organization.id,
          version: 1,
          title: 'Lockout/Tagout',
          trainingType: 'SAFETY_AWARENESS_TRAINING',
          deliveryMethod: 'ONLINE_SELF_PACED',
          estimatedMinutes: 60,
          passingScore: 80,
          renewalIntervalDays: 365,
          warningIntervalDays: [30, 7],
          issuesCertificate: true,
          publishedAt: new Date(),
        },
      },
    },
    include: { versions: true },
  });
  const courseVersion = course.versions[0]!;
  await tenant.course.update({
    where: { id: course.id },
    data: { publishedVersionId: courseVersion.id },
  });

  const requirement = await tenant.trainingRequirement.create({
    data: {
      organizationId: organization.id,
      name: 'LOTO for maintenance technicians',
      courseId: course.id,
      scopeType: 'JOB_ROLE',
      jobRoleId: jobRole.id,
      dueWithinDays: 30,
    },
  });

  const roles: readonly RoleKey[] = options.roles ?? [
    'ORG_OWNER',
    'EHS_ADMINISTRATOR',
    'SUPERVISOR',
    'LEARNER',
  ];

  const users: Record<string, { id: string; email: string; employeeId: string | null }> = {};
  const employees: Record<string, string> = {};

  for (const roleKey of roles) {
    const email = `${roleKey.toLowerCase()}@${slug}.test`;
    const user = await tenant.user.create({
      data: {
        organizationId: organization.id,
        email,
        emailNormalized: email,
        emailVerifiedAt: new Date(),
        passwordHash,
        firstName: roleKey,
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await tenant.userRole.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        roleId: roleIds.get(roleKey) as string,
        scopeType: 'ORGANIZATION',
      },
    });

    const employee = await tenant.employee.create({
      data: {
        organizationId: organization.id,
        firstName: roleKey,
        lastName: 'User',
        employeeNumber: `E-${roleKey}`,
        userId: user.id,
        departmentId: department.id,
        locationId: location.id,
        jobRoleId: roleKey === 'LEARNER' ? jobRole.id : null,
        status: 'ACTIVE',
      },
    });

    users[roleKey] = { id: user.id, email, employeeId: employee.id };
    employees[roleKey] = employee.id;
  }

  // The supervisor supervises the learner, so team-scoped checks have something
  // to resolve.
  if (employees.SUPERVISOR && employees.LEARNER) {
    await tenant.employee.update({
      where: { id: employees.LEARNER },
      data: { supervisorId: employees.SUPERVISOR },
    });
  }

  return {
    organizationId: organization.id,
    slug,
    departmentId: department.id,
    locationId: location.id,
    jobRoleId: jobRole.id,
    courseId: course.id,
    courseVersionId: courseVersion.id,
    requirementId: requirement.id,
    users,
    employees,
  };
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export interface Session {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly userId: string;
}

const parseCookies = (setCookie: string | string[] | undefined): Record<string, string> => {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar: Record<string, string> = {};
  for (const value of values) {
    const [pair] = value.split(';');
    const [name, ...rest] = (pair ?? '').split('=');
    if (name) jar[name] = rest.join('=');
  }
  return jar;
};

export const signIn = async (
  app: FastifyInstance,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<Session> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Sign-in failed for ${email}: ${response.statusCode} ${response.body}`);
  }

  const jar = parseCookies(response.headers['set-cookie']);
  const body = response.json() as { data: { userId: string; csrfToken: string } };

  return {
    cookie: Object.entries(jar)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    csrfToken: body.data.csrfToken,
    userId: body.data.userId,
  };
};

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly url: string;
  readonly session?: Session;
  readonly payload?: unknown;
  readonly headers?: Record<string, string>;
}

export const call = async (app: FastifyInstance, options: RequestOptions) => {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { ...options.headers };

  if (options.session) {
    headers.cookie = options.session.cookie;
    if (method !== 'GET') headers['x-csrf-token'] = options.session.csrfToken;
  }

  return app.inject({
    method,
    url: options.url,
    headers,
    ...(options.payload !== undefined ? { payload: options.payload as object } : {}),
  });
};
