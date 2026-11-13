import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import {
  call,
  seedTenant,
  signIn,
  TEST_PASSWORD,
  type Session,
  type TenantFixtures,
} from './fixtures.js';
import { db, disconnect, resetDatabase } from './helpers.js';

/**
 * §51 — the critical workflow, end to end through the API:
 *
 *   create employee -> requirement engine assigns training -> employee completes
 *   -> training record -> certificate -> compliance dashboard reflects it
 *
 * Plus the authorization and representation behaviour that has to hold along
 * the way.
 */

let app: FastifyInstance;
let tenant: TenantFixtures;
let owner: Session;
let supervisor: Session;
let learner: Session;

beforeAll(async () => {
  await resetDatabase();
  app = await buildServer();
  await app.ready();

  tenant = await seedTenant({ slug: 'workflow-co' });
  owner = await signIn(app, tenant.users.ORG_OWNER!.email);
  supervisor = await signIn(app, tenant.users.SUPERVISOR!.email);
  learner = await signIn(app, tenant.users.LEARNER!.email);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await resetDatabase();
  await disconnect();
});

describe('the critical workflow', () => {
  let employeeId: string;

  it('creates an employee and assigns their required training automatically', async () => {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/employees',
      session: owner,
      payload: {
        firstName: 'Nadia',
        lastName: 'Okafor',
        employeeNumber: 'E-9001',
        // The job role carries the LOTO requirement seeded by the fixture.
        jobRoleId: tenant.jobRoleId,
        departmentId: tenant.departmentId,
        locationId: tenant.locationId,
        hireDate: '2026-01-15T00:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      data: { id: string };
      meta: { trainingAssigned: number };
    };
    employeeId = body.data.id;

    // The requirement engine ran on creation, not on some later sweep.
    expect(body.meta.trainingAssigned).toBe(1);
  });

  it('shows the new obligation as PENDING on the training matrix', async () => {
    const response = await call(app, { url: '/api/v1/compliance/matrix', session: owner });
    const body = response.json() as {
      data: { rows: { employee: { id: string }; cells: Record<string, { status: string }> }[] };
    };
    const row = body.data.rows.find((r) => r.employee.id === employeeId);
    expect(row).toBeDefined();
    expect(row!.cells[tenant.courseId]!.status).toBe('PENDING');
  });

  it('records the completion and issues a certificate in one step', async () => {
    const assignment = await db().trainingAssignment.findFirst({
      where: { employeeId },
      select: { id: true },
    });

    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/training/records',
      session: owner,
      payload: {
        employeeId,
        courseId: tenant.courseId,
        requirementId: tenant.requirementId,
        assignmentId: assignment!.id,
        score: 92,
        instructorName: 'Dana Ruiz',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      data: {
        trainingRecordId: string;
        certificateId: string;
        certificatePublicId: string;
        expiresAt: string;
      };
    };

    expect(body.data.trainingRecordId).toBeTruthy();
    expect(body.data.certificateId).toBeTruthy();

    // The course renews every 365 days, so the expiry must be a year out.
    const expires = new Date(body.data.expiresAt);
    const days = Math.round((expires.getTime() - Date.now()) / 86_400_000);
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it('marks the assignment completed', async () => {
    const assignment = await db().trainingAssignment.findFirst({
      where: { employeeId },
      select: { status: true, completedAt: true },
    });
    expect(assignment?.status).toBe('COMPLETED');
    expect(assignment?.completedAt).not.toBeNull();
  });

  it('flips the matrix cell to CURRENT', async () => {
    const response = await call(app, { url: '/api/v1/compliance/matrix', session: owner });
    const body = response.json() as {
      data: {
        rows: {
          employee: { id: string };
          cells: Record<string, { status: string; expiresAt: string | null }>;
        }[];
      };
    };
    const cell = body.data.rows.find((r) => r.employee.id === employeeId)!.cells[tenant.courseId]!;
    expect(cell.status).toBe('CURRENT');
    expect(cell.expiresAt).not.toBeNull();
  });

  it('writes an auditable record with a course snapshot', async () => {
    const record = await db().trainingRecord.findFirst({
      where: { employeeId },
      select: {
        courseTitle: true,
        courseVersionNumber: true,
        trainingType: true,
        score: true,
        passed: true,
        instructorName: true,
      },
    });

    // Snapshot fields, so the record still reads correctly if the course is
    // later edited or archived.
    expect(record).toMatchObject({
      courseTitle: 'Lockout/Tagout',
      courseVersionNumber: 1,
      trainingType: 'SAFETY_AWARENESS_TRAINING',
      passed: true,
      instructorName: 'Dana Ruiz',
    });
    expect(Number(record!.score)).toBe(92);
  });

  it('leaves an audit trail for both the record and the certificate', async () => {
    const response = await call(app, { url: '/api/v1/audit', session: owner });
    const body = response.json() as { data: { action: string; summary: string }[] };
    const actions = body.data.map((entry) => entry.action);
    expect(actions).toContain('TRAINING_RECORD_CREATED');
    expect(actions).toContain('CERTIFICATE_ISSUED');
  });

  it('verifies the certificate publicly, with no session', async () => {
    const certificate = await db().certificate.findFirst({
      where: { employeeId },
      select: { publicId: true },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/verify/certificate/${certificate!.publicId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: { result: string; learnerName: string; disclaimer: string };
    };
    expect(body.data.result).toBe('VALID');
    expect(body.data.learnerName).toBe('Nadia Okafor');
    // §10: awareness training must say plainly that it is not an OSHA course.
    expect(body.data.disclaimer).toMatch(/not an OSHA course/i);
  });

  it('counts the completion on the safety command centre', async () => {
    const response = await call(app, { url: '/api/v1/safety/dashboard', session: owner });
    const body = response.json() as {
      data: { kpis: { completedThisMonth: number; overallCompliancePercent: number } };
    };
    expect(body.data.kpis.completedThisMonth).toBeGreaterThanOrEqual(1);
    expect(body.data.kpis.overallCompliancePercent).toBeGreaterThan(0);
  });

  it('re-evaluates obligations when the employee changes job role', async () => {
    const newRole = await db().jobRole.create({
      data: { organizationId: tenant.organizationId, title: 'Office Clerk', hazardExposures: [] },
    });

    await db().employee.update({
      where: { id: employeeId },
      data: { employmentType: 'PART_TIME' },
    });

    const response = await call(app, {
      method: 'PATCH',
      url: `/api/v1/employees/${employeeId}`,
      session: owner,
      payload: { jobRoleId: newRole.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      meta: { requirementsRecalculated: boolean; trainingWithdrawn: number };
    };
    expect(body.meta.requirementsRecalculated).toBe(true);
    expect(body.meta.trainingWithdrawn).toBe(1);
    const employee = await db().employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(employee.employmentType).toBe('PART_TIME');

    // The obligation is gone, but the historical record is untouched: the
    // person really did complete that training.
    const states = await db().complianceState.count({ where: { employeeId } });
    expect(states).toBe(0);
    const records = await db().trainingRecord.count({ where: { employeeId, voidedAt: null } });
    expect(records).toBe(1);
  });
});

describe('authorization along the workflow', () => {
  it('lets a learner see their own training but not the organization', async () => {
    const own = await call(app, { url: '/api/v1/me/learning', session: learner });
    expect(own.statusCode).toBe(200);

    const org = await call(app, { url: '/api/v1/compliance/dashboard', session: learner });
    expect(org.statusCode).toBe(403);
  });

  it('scopes a supervisor to their own team', async () => {
    const response = await call(app, { url: '/api/v1/employees', session: supervisor });
    const body = response.json() as {
      data: { employeeNumber: string }[];
      meta: { scope: string };
    };
    expect(body.meta.scope).toBe('employee:read_team');
    // Themselves plus their one direct report.
    expect(body.data.map((e) => e.employeeNumber).sort()).toEqual(['E-LEARNER', 'E-SUPERVISOR']);
  });

  it('refuses a learner the ability to record training for anyone', async () => {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/training/records',
      session: learner,
      payload: {
        employeeId: tenant.employees.LEARNER,
        courseId: tenant.courseId,
        score: 100,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a request with a missing CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/safety/observations',
      headers: { cookie: owner.cookie },
      payload: {
        type: 'GOOD_CATCH',
        description: 'A forged cross-site request would look like this.',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a request with the wrong CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/safety/observations',
      headers: { cookie: owner.cookie, 'x-csrf-token': 'not-the-right-token-at-all-000' },
      payload: {
        type: 'GOOD_CATCH',
        description: 'A forged cross-site request would look like this.',
      },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('representation rules block false authorisation claims', () => {
  it('refuses a course title claiming OSHA approval', async () => {
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/courses',
      session: owner,
      payload: { title: 'OSHA Approved Forklift Course', type: 'SAFETY' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toMatch(/does not approve, certify or accredit/);
  });

  it('refuses to publish OSHA Outreach training without trainer authorization', async () => {
    const created = await call(app, {
      method: 'POST',
      url: '/api/v1/courses',
      session: owner,
      payload: {
        title: 'Forklift Operator Awareness',
        type: 'SAFETY',
        version: { trainingType: 'OSHA_OUTREACH_TRAINING' },
      },
    });
    expect(created.statusCode).toBe(201);
    const courseId = (created.json() as { data: { id: string } }).data.id;

    const blocked = await call(app, {
      method: 'POST',
      url: `/api/v1/courses/${courseId}/publish`,
      session: owner,
      payload: {},
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.body).toMatch(/authorised provider, trainer or certifying body/);

    const allowed = await call(app, {
      method: 'POST',
      url: `/api/v1/courses/${courseId}/publish`,
      session: owner,
      payload: { providerName: 'Jordan Reyes', authorizationId: 'OSHA-TRN-44821' },
    });
    expect(allowed.statusCode).toBe(200);
    // The published course carries the disclaimer that OLBOS does not issue
    // Department of Labor cards.
    expect(allowed.body).toMatch(/Department of Labor course completion cards/);
  });
});

describe('login hardening', () => {
  it('answers identically for a wrong password and an unknown account', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: tenant.users.ORG_OWNER!.email, password: 'definitely-not-the-password' },
    });
    const unknownAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@workflow-co.test', password: 'definitely-not-the-password' },
    });

    expect(wrongPassword.statusCode).toBe(unknownAccount.statusCode);
    expect(wrongPassword.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect((wrongPassword.json() as { error: { message: string } }).error.message).toBe(
      (unknownAccount.json() as { error: { message: string } }).error.message,
    );
  });

  it('records both the success and the failure in the audit log', async () => {
    const entries = await db().auditLog.findMany({
      where: { organizationId: tenant.organizationId, action: { in: ['LOGIN', 'LOGIN_FAILED'] } },
      select: { action: true },
    });
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('LOGIN');
    expect(actions).toContain('LOGIN_FAILED');
  });

  it('revokes the session on logout', async () => {
    const session = await signIn(app, tenant.users.LEARNER!.email, TEST_PASSWORD);

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: session.cookie },
    });
    expect(before.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: session.cookie },
    });
    expect(after.statusCode).toBe(401);
  });
});
