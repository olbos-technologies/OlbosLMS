import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { call, seedTenant, signIn, type Session, type TenantFixtures } from './fixtures.js';
import { db, disconnect, resetDatabase } from './helpers.js';

/**
 * §52 — tenant security tests at the HTTP boundary.
 *
 * The Prisma-level suite proves the tenant client cannot cross a boundary.
 * This suite proves the same thing through the API a customer actually calls:
 * a signed-in user of tenant B, holding a valid session and a valid CSRF token,
 * asking for tenant A's identifiers by id.
 *
 * The expected answer is always 404 — never 403, which would confirm the
 * resource exists somewhere.
 */

let app: FastifyInstance;
let alpha: TenantFixtures;
let bravo: TenantFixtures;
// Deliberately the *most* privileged actor in each tenant: if an organization
// owner cannot reach across the boundary, no weaker role can either.
let alphaOwner: Session;
let bravoOwner: Session;

interface AlphaIds {
  employeeId: string;
  courseId: string;
  requirementId: string;
  assignmentId: string;
  recordId: string;
  certificateId: string;
  certificatePublicId: string;
  userId: string;
  fileId: string;
  conversationId: string;
}

let alphaIds: AlphaIds;

beforeAll(async () => {
  await resetDatabase();
  app = await buildServer();
  await app.ready();

  alpha = await seedTenant({ slug: 'alpha-co' });
  bravo = await seedTenant({ slug: 'bravo-co' });

  alphaOwner = await signIn(app, alpha.users.ORG_OWNER!.email);
  bravoOwner = await signIn(app, bravo.users.ORG_OWNER!.email);

  // Give tenant A a complete record chain to try to reach.
  const learnerEmployeeId = alpha.employees.LEARNER as string;

  const created = await call(app, {
    method: 'POST',
    url: '/api/v1/training/records',
    session: alphaOwner,
    payload: {
      employeeId: learnerEmployeeId,
      courseId: alpha.courseId,
      requirementId: alpha.requirementId,
      score: 95,
    },
  });
  expect(created.statusCode).toBe(201);
  const record = created.json() as {
    data: { trainingRecordId: string; certificateId: string; certificatePublicId: string };
  };

  const assignment = await db().trainingAssignment.findFirst({
    where: { organizationId: alpha.organizationId },
    select: { id: true },
  });

  const file = await db().storedFile.create({
    data: {
      organizationId: alpha.organizationId,
      storageKey: `tenants/${alpha.organizationId}/docs/x/policy.pdf`,
      fileName: 'policy.pdf',
      contentType: 'application/pdf',
      byteSize: 100,
    },
  });

  const conversation = await db().aiConversation.create({
    data: {
      organizationId: alpha.organizationId,
      userId: alpha.users.LEARNER!.id,
      feature: 'TUTOR',
      title: 'Alpha private conversation',
    },
  });

  alphaIds = {
    employeeId: learnerEmployeeId,
    courseId: alpha.courseId,
    requirementId: alpha.requirementId,
    assignmentId: assignment?.id ?? '00000000-0000-0000-0000-000000000000',
    recordId: record.data.trainingRecordId,
    certificateId: record.data.certificateId,
    certificatePublicId: record.data.certificatePublicId,
    userId: alpha.users.LEARNER!.id,
    fileId: file.id,
    conversationId: conversation.id,
  };
}, 180_000);

afterAll(async () => {
  await app?.close();
  await resetDatabase();
  await disconnect();
});

describe('tenant B cannot read tenant A resources by id', () => {
  const cases = (): [string, string][] => [
    ['employee', `/api/v1/employees/${alphaIds.employeeId}`],
    ['course', `/api/v1/courses/${alphaIds.courseId}`],
    ['certificate', `/api/v1/certificates/${alphaIds.certificateId}`],
  ];

  it('returns 404, not 403, for each', async () => {
    for (const [label, url] of cases()) {
      const response = await call(app, { url, session: bravoOwner });
      expect(`${label}:${response.statusCode}`).toBe(`${label}:404`);
      // A 403 would confirm the resource exists in another tenant.
      expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });

  it('never leaks tenant A identifiers in the body', async () => {
    for (const [, url] of cases()) {
      const response = await call(app, { url, session: bravoOwner });
      expect(response.body).not.toContain(alpha.organizationId);
      expect(response.body).not.toContain(alphaIds.employeeId);
    }
  });
});

describe('tenant B list endpoints contain only tenant B data', () => {
  const listCases: [string, string][] = [
    ['employees', '/api/v1/employees'],
    ['courses', '/api/v1/courses'],
    ['certificates', '/api/v1/certificates'],
    ['training records', '/api/v1/training/records'],
    ['training assignments', '/api/v1/training/assignments'],
    ['training requirements', '/api/v1/training/requirements'],
    ['users', '/api/v1/users'],
    ['departments', '/api/v1/departments'],
    ['locations', '/api/v1/locations'],
    ['job roles', '/api/v1/job-roles'],
    ['audit log', '/api/v1/audit'],
  ];

  for (const [label, url] of listCases) {
    it(`excludes tenant A from ${label}`, async () => {
      const response = await call(app, { url, session: bravoOwner });
      expect(response.statusCode).toBe(200);
      // The whole serialised response is checked, not just ids we thought to
      // look at: any leak of tenant A's organization id fails the test.
      expect(response.body).not.toContain(alpha.organizationId);
      expect(response.body).not.toContain(alphaIds.employeeId);
      expect(response.body).not.toContain(alphaIds.recordId);
    });
  }

  it('reports zero training records for the fresh tenant', async () => {
    const response = await call(app, { url: '/api/v1/training/records', session: bravoOwner });
    expect((response.json() as { meta: { total: number } }).meta.total).toBe(0);
  });
});

describe('tenant B analytics and dashboards exclude tenant A', () => {
  const analyticsCases: [string, string][] = [
    ['compliance dashboard', '/api/v1/compliance/dashboard'],
    ['training matrix', '/api/v1/compliance/matrix'],
    ['safety dashboard', '/api/v1/safety/dashboard'],
    ['training analytics', '/api/v1/analytics/training'],
    ['safety analytics', '/api/v1/analytics/safety'],
    ['learning analytics', '/api/v1/analytics/learning'],
  ];

  for (const [label, url] of analyticsCases) {
    it(`computes ${label} from tenant B data only`, async () => {
      const response = await call(app, { url, session: bravoOwner });
      expect(`${label}:${response.statusCode}`).toBe(`${label}:200`);
      expect(response.body).not.toContain(alpha.organizationId);
      expect(response.body).not.toContain(alphaIds.employeeId);
    });
  }

  it('counts only tenant B completions in training analytics', async () => {
    const response = await call(app, { url: '/api/v1/analytics/training', session: bravoOwner });
    const body = response.json() as { data: { totals: { completions: number } } };
    expect(body.data.totals.completions).toBe(0);

    const alphaResponse = await call(app, {
      url: '/api/v1/analytics/training',
      session: alphaOwner,
    });
    const alphaBody = alphaResponse.json() as { data: { totals: { completions: number } } };
    expect(alphaBody.data.totals.completions).toBe(1);
  });
});

describe('tenant B cannot write into tenant A', () => {
  it('cannot assign training to a tenant A employee', async () => {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/training/assignments',
      session: bravoOwner,
      payload: { employeeIds: [alphaIds.employeeId], courseId: bravo.courseId },
    });
    // The employee simply is not visible, so nothing is created.
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { created: 0 } });
  });

  it('cannot record training against a tenant A employee', async () => {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/training/records',
      session: bravoOwner,
      payload: {
        employeeId: alphaIds.employeeId,
        courseId: bravo.courseId,
        score: 100,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('cannot revoke a tenant A certificate', async () => {
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/certificates/${alphaIds.certificateId}/revoke`,
      session: bravoOwner,
      payload: { reason: 'Attempting a cross-tenant revocation' },
    });
    expect(response.statusCode).toBe(404);

    const certificate = await db().certificate.findUnique({
      where: { id: alphaIds.certificateId },
      select: { status: true },
    });
    expect(certificate?.status).toBe('ACTIVE');
  });

  it('cannot waive a tenant A training assignment', async () => {
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/training/assignments/${alphaIds.assignmentId}/waive`,
      session: bravoOwner,
      payload: { reason: 'Attempting a cross-tenant waiver' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('cannot void a tenant A training record', async () => {
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/training/records/${alphaIds.recordId}/void`,
      session: bravoOwner,
      payload: { reason: 'Attempting a cross-tenant void' },
    });
    expect(response.statusCode).toBe(404);

    const record = await db().trainingRecord.findUnique({
      where: { id: alphaIds.recordId },
      select: { voidedAt: true },
    });
    expect(record?.voidedAt).toBeNull();
  });

  it('cannot grant a tenant A user a role in tenant B', async () => {
    const bravoRole = await db().role.findFirst({
      where: { organizationId: bravo.organizationId, key: 'ORG_OWNER' },
      select: { id: true },
    });
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/users/${alphaIds.userId}/roles`,
      session: bravoOwner,
      payload: { roleId: bravoRole?.id, scopeType: 'ORGANIZATION' },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('the tenant-owned billing and organization surface', () => {
  // Added after a review found /billing/subscription reading through the
  // unscoped client. These endpoints had no coverage at all, which is why the
  // 127 tests around them stayed green while the rule was broken.
  it('returns tenant B its own subscription and never tenant A', async () => {
    const response = await call(app, { url: '/api/v1/billing/subscription', session: bravoOwner });
    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: { subscription: { status: string; plan: { key: string } } | null };
    };
    // Non-null matters: a tenant-scoped read that over-filtered would return
    // null here and the endpoint would look "safe" while being broken.
    expect(body.data.subscription).not.toBeNull();
    expect(body.data.subscription?.status).toBe('ACTIVE');
    expect(response.body).not.toContain(alpha.organizationId);
  });

  it('returns tenant B its own organization and never tenant A', async () => {
    const response = await call(app, { url: '/api/v1/organizations/current', session: bravoOwner });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { data: { id: string; slug: string } };
    expect(body.data.id).toBe(bravo.organizationId);
    expect(body.data.slug).toBe('bravo-co');
    expect(response.body).not.toContain(alpha.organizationId);
  });

  it('excludes tenant A from invoices', async () => {
    const response = await call(app, { url: '/api/v1/billing/invoices', session: bravoOwner });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(alpha.organizationId);
  });

  it("scopes an organization settings update to the caller's own tenant", async () => {
    const response = await call(app, {
      method: 'PATCH',
      url: '/api/v1/organizations/current/settings',
      session: bravoOwner,
      payload: { certificateDisclaimer: 'Bravo policy text' },
    });
    expect(response.statusCode).toBe(200);

    // Tenant A's settings must be untouched by tenant B's write.
    const alphaOrg = await db().organization.findUnique({
      where: { id: alpha.organizationId },
      select: { settings: true },
    });
    expect(JSON.stringify(alphaOrg?.settings ?? {})).not.toContain('Bravo policy text');
  });
});

describe('certificate verification is public but narrow', () => {
  it('verifies a certificate without any session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/verify/certificate/${alphaIds.certificatePublicId}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Record<string, unknown> };
    expect(body.data.result).toBe('VALID');
  });

  it('exposes no internal identifiers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/verify/certificate/${alphaIds.certificatePublicId}`,
    });
    expect(response.body).not.toContain(alpha.organizationId);
    expect(response.body).not.toContain(alphaIds.employeeId);
    expect(response.body).not.toContain(alphaIds.certificateId);
    expect(response.body).not.toContain(alphaIds.recordId);
  });

  it('answers NOT_FOUND for an unknown code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/verify/certificate/ZZZZ9999ZZZZ',
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { data: { result: string } }).data.result).toBe('NOT_FOUND');
  });

  it('reports TAMPERED when the stored row no longer matches its signature', async () => {
    await db().certificate.update({
      where: { id: alphaIds.certificateId },
      data: { learnerName: 'Somebody Else' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/verify/certificate/${alphaIds.certificatePublicId}`,
    });
    const body = response.json() as { data: { result: string; learnerName?: string } };
    expect(body.data.result).toBe('TAMPERED');
    expect(body.data.learnerName).toBeUndefined();

    await db().certificate.update({
      where: { id: alphaIds.certificateId },
      data: { learnerName: 'LEARNER User' },
    });
  });
});

describe('unauthenticated access', () => {
  const protectedUrls = [
    '/api/v1/me',
    '/api/v1/employees',
    '/api/v1/compliance/dashboard',
    '/api/v1/certificates',
    '/api/v1/audit',
  ];

  for (const url of protectedUrls) {
    it(`rejects ${url} without a session`, async () => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
    });
  }

  it('rejects a forged session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: 'olbos_session=not-a-real-token' },
    });
    expect(response.statusCode).toBe(401);
  });
});
