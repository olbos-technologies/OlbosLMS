import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { call, seedTenant, signIn, type Session, type TenantFixtures } from './fixtures.js';
import { db, disconnect, resetDatabase } from './helpers.js';

let app: FastifyInstance;
let alpha: TenantFixtures;
let bravo: TenantFixtures;
let owner: Session;
let otherOwner: Session;
let learner: Session;
let programId: string;
let courseId: string;
let termId: string;

beforeAll(async () => {
  await resetDatabase();
  app = await buildServer();
  await app.ready();
  alpha = await seedTenant({ slug: 'campus-alpha' });
  bravo = await seedTenant({ slug: 'campus-bravo' });
  owner = await signIn(app, alpha.users.ORG_OWNER!.email);
  otherOwner = await signIn(app, bravo.users.ORG_OWNER!.email);
  learner = await signIn(app, alpha.users.LEARNER!.email);
}, 180000);
afterAll(async () => {
  await app?.close();
  await disconnect();
});

const post = (path: string, payload: unknown, session = owner) =>
  call(app, { method: 'POST', url: `/api/v1/campus/${path}`, payload, session });

describe('College academic foundation', () => {
  it('creates an academic structure and paginates the institution catalog', async () => {
    const program = await post('programs', {
      code: 'cs',
      name: 'Computer Science',
      award: 'BACHELOR',
      requiredCredits: 120,
    });
    expect(program.statusCode).toBe(201);
    programId = program.json().data.id as string;
    expect(program.json().data.code).toBe('CS');
    const term = await post('terms', {
      code: 'FALL-2027',
      name: 'Fall 2027',
      startsOn: '2027-08-15',
      endsOn: '2027-12-20',
    });
    expect(term.statusCode).toBe(201);
    termId = term.json().data.id as string;
    const course = await post('courses', {
      code: 'CS101',
      title: 'Introduction to Computing',
      credits: 3,
      programId,
    });
    expect(course.statusCode).toBe(201);
    courseId = course.json().data.id as string;
    const section = await post('sections', {
      code: '001',
      academicCourseId: courseId,
      termId,
      capacity: 30,
    });
    expect(section.statusCode).toBe(201);
    for (const resource of ['programs', 'terms', 'courses', 'sections']) {
      const list = await call(app, {
        url: `/api/v1/campus/${resource}?pageSize=1`,
        session: owner,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().meta.total).toBe(1);
      expect(list.json().data).toHaveLength(1);
      const hidden = await call(app, { url: `/api/v1/campus/${resource}`, session: otherOwner });
      expect(hidden.json().data).toEqual([]);
    }
    const audit = await db().auditLog.findMany({
      where: { organizationId: alpha.organizationId, entityType: { startsWith: 'academic_' } },
    });
    expect(audit).toHaveLength(4);
  });

  it('rejects unauthenticated requests and learners at every endpoint', async () => {
    for (const resource of ['programs', 'terms', 'courses', 'sections']) {
      expect((await call(app, { url: `/api/v1/campus/${resource}` })).statusCode).toBe(401);
      expect(
        (await call(app, { url: `/api/v1/campus/${resource}`, session: learner })).statusCode,
      ).toBe(403);
      expect((await post(resource, {}, learner)).statusCode).toBe(403);
    }
  });

  it('returns 404 for cross-institution parents and LMS content', async () => {
    expect(
      (
        await post(
          'courses',
          { code: 'FOREIGN', title: 'Foreign program', credits: 3, programId },
          otherOwner,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          'sections',
          { code: '002', academicCourseId: courseId, termId, capacity: 20 },
          otherOwner,
        )
      ).statusCode,
    ).toBe(404);
    const foreignTerm = await db().academicTerm.create({
      data: {
        organizationId: bravo.organizationId,
        code: 'X',
        name: 'Other term',
        startsOn: new Date('2027-01-01'),
        endsOn: new Date('2027-05-01'),
      },
    });
    expect(
      (
        await post('sections', {
          code: '002',
          academicCourseId: courseId,
          termId: foreignTerm.id,
          capacity: 20,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post('sections', {
          code: '002',
          academicCourseId: courseId,
          termId,
          capacity: 20,
          lmsCourseId: bravo.courseId,
        })
      ).statusCode,
    ).toBe(404);
    // Even an unscoped client cannot create a cross-institution relationship.
    await expect(
      db().academicCourse.create({
        data: {
          organizationId: bravo.organizationId,
          programId,
          code: 'FORGED',
          title: 'Forged',
          credits: 3,
        },
      }),
    ).rejects.toThrow();
  });

  it('validates dates, credits, capacity, duplicate codes, and tenant injection', async () => {
    expect(
      (
        await post('terms', {
          code: 'BAD',
          name: 'Bad dates',
          startsOn: '2027-12-01',
          endsOn: '2027-01-01',
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await post('terms', {
          code: 'BAD',
          name: 'Invalid date',
          startsOn: '2027-02-30',
          endsOn: '2027-05-01',
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await post('courses', { code: 'BAD', title: 'Bad credits', credits: -1, programId }))
        .statusCode,
    ).toBe(422);
    expect(
      (await post('sections', { code: '002', academicCourseId: courseId, termId, capacity: 0 }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await post('programs', {
          code: 'CS',
          name: 'Duplicate',
          award: 'BACHELOR',
          requiredCredits: 120,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post('programs', {
          code: 'INJECT',
          name: 'Injected',
          award: 'BACHELOR',
          requiredCredits: 120,
          organizationId: bravo.organizationId,
        })
      ).statusCode,
    ).toBe(422);
  });

  it('links academic LMS content without creating enrollment', async () => {
    const lms = await db().course.create({
      data: {
        organizationId: alpha.organizationId,
        title: 'Academic content',
        slug: 'academic-content',
        type: 'ACADEMIC',
        tags: [],
      },
    });
    const result = await post('sections', {
      code: 'ONLINE',
      academicCourseId: courseId,
      termId,
      capacity: 20,
      lmsCourseId: lms.id,
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().data.lmsCourseId).toBe(lms.id);
    expect(await db().enrollment.count({ where: { courseId: lms.id } })).toBe(0);
    expect(
      (
        await post('sections', {
          code: 'SAFETY',
          academicCourseId: courseId,
          termId,
          capacity: 20,
          lmsCourseId: alpha.courseId,
        })
      ).statusCode,
    ).toBe(422);
  });
});
