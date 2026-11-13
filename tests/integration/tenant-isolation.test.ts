import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantIsolationError } from '@olbos/database';
import { createTenant, db, disconnect, resetDatabase, type TenantFixture } from './helpers.js';

/**
 * §52 — mandatory tenant security tests.
 *
 * Two organizations are populated with an equivalent data set. Every assertion
 * below is the same shape: tenant B must not be able to read, count, update or
 * delete anything belonging to tenant A, through any Prisma entry point.
 */

let a: TenantFixture;
let b: TenantFixture;

interface Seeded {
  userId: string;
  employeeId: string;
  courseId: string;
  courseVersionId: string;
  requirementId: string;
  assignmentId: string;
  recordId: string;
  certificateId: string;
  fileId: string;
  conversationId: string;
  auditId: string;
  reportRunId: string;
}

const seedTenant = async (fixture: TenantFixture, tag: string): Promise<Seeded> => {
  const { tenant } = fixture;

  const user = await tenant.user.create({
    data: {
      email: `${tag}@example.test`,
      emailNormalized: `${tag}@example.test`,
      firstName: 'Test',
      lastName: tag,
      status: 'ACTIVE',
    },
  });

  const employee = await tenant.employee.create({
    data: { firstName: 'Test', lastName: tag, userId: user.id, employeeNumber: `E-${tag}` },
  });

  const course = await tenant.course.create({
    data: {
      title: `Lockout/Tagout (${tag})`,
      slug: `loto-${tag}`,
      type: 'SAFETY',
      status: 'PUBLISHED',
      versions: {
        create: {
          version: 1,
          title: `Lockout/Tagout (${tag})`,
          trainingType: 'SAFETY_AWARENESS_TRAINING',
          renewalIntervalDays: 365,
          modules: { create: [{ title: 'Energy sources', position: 1 }] },
        },
      },
    },
    include: { versions: true },
  });
  const version = course.versions[0]!;

  const requirement = await tenant.trainingRequirement.create({
    data: { name: `LOTO for all (${tag})`, courseId: course.id, scopeType: 'ORGANIZATION' },
  });

  const assignment = await tenant.trainingAssignment.create({
    data: {
      employeeId: employee.id,
      courseId: course.id,
      courseVersionId: version.id,
      requirementId: requirement.id,
      origin: 'REQUIREMENT_ENGINE',
    },
  });

  const record = await tenant.trainingRecord.create({
    data: {
      employeeId: employee.id,
      courseId: course.id,
      courseVersionId: version.id,
      requirementId: requirement.id,
      assignmentId: assignment.id,
      courseTitle: course.title,
      courseVersionNumber: 1,
      trainingType: 'SAFETY_AWARENESS_TRAINING',
      deliveryMethod: 'ONLINE_SELF_PACED',
      trainingDate: new Date('2026-01-15T09:00:00Z'),
      completedAt: new Date('2026-01-15T10:00:00Z'),
      score: 92,
      passed: true,
    },
  });

  const certificate = await tenant.certificate.create({
    data: {
      certificateNumber: `CERT-${tag}-0001`,
      publicId: `pub-${tag}-0001`,
      integrityHash: 'hash',
      employeeId: employee.id,
      trainingRecordId: record.id,
      courseId: course.id,
      courseVersionId: version.id,
      learnerName: `Test ${tag}`,
      organizationName: `Org ${tag}`,
      courseTitle: course.title,
      trainingType: 'SAFETY_AWARENESS_TRAINING',
      deliveryMethod: 'ONLINE_SELF_PACED',
      completedAt: new Date('2026-01-15T10:00:00Z'),
    },
  });

  const file = await tenant.storedFile.create({
    data: {
      storageKey: `tenants/${fixture.organizationId}/${tag}.pdf`,
      fileName: `${tag}.pdf`,
      contentType: 'application/pdf',
      byteSize: 1024,
    },
  });

  const conversation = await tenant.aiConversation.create({
    data: { userId: user.id, feature: 'TUTOR', title: `Tutor chat ${tag}` },
  });

  const audit = await tenant.auditLog.create({
    data: { action: 'TRAINING_COMPLETED', entityType: 'training_record', entityId: record.id },
  });

  const reportRun = await tenant.reportRun.create({
    data: { reportKey: 'training_compliance', format: 'csv', requestedById: user.id },
  });

  return {
    userId: user.id,
    employeeId: employee.id,
    courseId: course.id,
    courseVersionId: version.id,
    requirementId: requirement.id,
    assignmentId: assignment.id,
    recordId: record.id,
    certificateId: certificate.id,
    fileId: file.id,
    conversationId: conversation.id,
    auditId: audit.id,
    reportRunId: reportRun.id,
  };
};

let seedA: Seeded;
let seedB: Seeded;

beforeAll(async () => {
  await resetDatabase();
  a = await createTenant('alpha');
  b = await createTenant('bravo');
  seedA = await seedTenant(a, 'alpha');
  seedB = await seedTenant(b, 'bravo');
}, 120_000);

afterAll(async () => {
  await resetDatabase();
  await disconnect();
});

describe('tenant A data is invisible to tenant B', () => {
  // [delegate name, model accessor, id from tenant A]
  const cases: [string, () => any, () => string][] = [
    ['users', () => b.tenant.user, () => seedA.userId],
    ['employees', () => b.tenant.employee, () => seedA.employeeId],
    ['courses', () => b.tenant.course, () => seedA.courseId],
    ['course versions', () => b.tenant.courseVersion, () => seedA.courseVersionId],
    ['training requirements', () => b.tenant.trainingRequirement, () => seedA.requirementId],
    ['training assignments', () => b.tenant.trainingAssignment, () => seedA.assignmentId],
    ['training records', () => b.tenant.trainingRecord, () => seedA.recordId],
    ['certificates', () => b.tenant.certificate, () => seedA.certificateId],
    ['files', () => b.tenant.storedFile, () => seedA.fileId],
    ['AI conversations', () => b.tenant.aiConversation, () => seedA.conversationId],
    ['audit logs', () => b.tenant.auditLog, () => seedA.auditId],
    ['report runs', () => b.tenant.reportRun, () => seedA.reportRunId],
  ];

  for (const [label, model, id] of cases) {
    it(`hides ${label} from findUnique`, async () => {
      expect(await model().findUnique({ where: { id: id() } })).toBeNull();
    });

    it(`hides ${label} from findFirst`, async () => {
      expect(await model().findFirst({ where: { id: id() } })).toBeNull();
    });

    it(`excludes ${label} from findMany and count`, async () => {
      const rows = await model().findMany();
      expect(
        rows.every((row: { organizationId: string }) => row.organizationId === b.organizationId),
      ).toBe(true);
      expect(await model().count()).toBe(rows.length);
      expect(rows.some((row: { id: string }) => row.id === id())).toBe(false);
    });

    it(`cannot update ${label} belonging to another tenant`, async () => {
      const result = await model().updateMany({ where: { id: id() }, data: {} });
      expect(result.count).toBe(0);
    });

    it(`cannot delete ${label} belonging to another tenant`, async () => {
      const result = await model().deleteMany({ where: { id: id() } });
      expect(result.count).toBe(0);
    });
  }
});

describe('cross-tenant writes are refused', () => {
  it('rejects a create that names another organization', async () => {
    await expect(
      b.tenant.course.create({
        data: { title: 'x', slug: 'x', organizationId: a.organizationId },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('rejects a filter that names another organization', async () => {
    await expect(
      b.tenant.trainingRecord.findMany({ where: { organizationId: a.organizationId } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('cannot widen a tenant filter with an IN list', async () => {
    const rows = await b.tenant.course.findMany({
      where: { organizationId: { in: [a.organizationId, b.organizationId] } },
    });
    expect(rows.every((row) => row.organizationId === b.organizationId)).toBe(true);
  });

  it('stamps nested creates with the caller tenant', async () => {
    const course = await b.tenant.course.create({
      data: {
        title: 'Nested',
        slug: 'nested',
        versions: {
          create: {
            version: 1,
            title: 'Nested',
            modules: { create: [{ title: 'M1', position: 1 }] },
          },
        },
      },
      include: { versions: { include: { modules: true } } },
    });
    expect(course.organizationId).toBe(b.organizationId);
    expect(course.versions[0]!.organizationId).toBe(b.organizationId);
    expect(course.versions[0]!.modules[0]!.organizationId).toBe(b.organizationId);
  });

  it('findUniqueOrThrow raises not-found rather than leaking existence', async () => {
    await expect(
      b.tenant.course.findUniqueOrThrow({ where: { id: seedA.courseId } }),
    ).rejects.toThrow(/No record found/);
  });
});

describe('aggregates and analytics respect the tenant boundary', () => {
  it('counts only the caller tenant in aggregate()', async () => {
    const aggregate = await b.tenant.trainingRecord.aggregate({ _count: { _all: true } });
    const rows = await b.tenant.trainingRecord.findMany();
    expect(aggregate._count._all).toBe(rows.length);
  });

  it('groups only the caller tenant in groupBy()', async () => {
    const grouped = await b.tenant.trainingRecord.groupBy({
      by: ['courseId'],
      _count: { _all: true },
    });
    expect(grouped.every((row) => row.courseId === seedB.courseId)).toBe(true);
  });

  it('sees the whole picture from the unscoped platform client', async () => {
    // Sanity check: the data really is there, it is the tenant client that hides it.
    expect(await db().trainingRecord.count()).toBe(2);
  });
});

describe('database-level guarantees', () => {
  it('refuses to update an audit log row', async () => {
    await expect(
      db()
        .$executeRaw`UPDATE audit_logs SET summary = 'tampered' WHERE id = ${seedA.auditId}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('refuses to delete an audit log row', async () => {
    await expect(
      db().$executeRaw`DELETE FROM audit_logs WHERE id = ${seedA.auditId}::uuid`,
    ).rejects.toThrow(/append-only/);
  });
});
