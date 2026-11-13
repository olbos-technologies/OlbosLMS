import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { call, seedTenant, signIn, type Session, type TenantFixtures } from './fixtures.js';
import { db, disconnect, resetDatabase } from './helpers.js';

let app: FastifyInstance;
let tenant: TenantFixtures;
let owner: Session;
let learner: Session;
let outsider: Session;
let otherLearner: Session;
let courseId: string;
let enrollmentId: string;
let versionId: string;
let quizId: string;
let lessonIds: string[];
let attemptId: string;

beforeAll(async () => {
  await resetDatabase();
  app = await buildServer();
  await app.ready();
  tenant = await seedTenant({
    slug: 'academy-alpha',
    roles: ['ORG_OWNER', 'LEARNER', 'SUPERVISOR', 'INSTRUCTOR'],
  });
  const second = await seedTenant({ slug: 'academy-beta' });
  owner = await signIn(app, tenant.users.ORG_OWNER!.email);
  learner = await signIn(app, tenant.users.LEARNER!.email);
  otherLearner = await signIn(app, tenant.users.SUPERVISOR!.email);
  outsider = await signIn(app, second.users.ORG_OWNER!.email);
});
afterAll(async () => {
  await app?.close();
  await resetDatabase();
  await disconnect();
});

describe('academy foundation workflow', () => {
  it('requires instructor permissions to import draft content', async () => {
    expect(
      (
        await call(app, {
          method: 'POST',
          url: '/api/v1/academy/import-week-one',
          session: learner,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const response = await call(app, {
      method: 'POST',
      url: '/api/v1/academy/import-week-one',
      session: owner,
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(201);
    courseId = response.json().data.id;
    const version = await db().courseVersion.findFirstOrThrow({ where: { courseId } });
    versionId = version.id;
    quizId = (await db().quiz.findFirstOrThrow({ where: { courseVersionId: versionId } })).id;
    lessonIds = (
      await db().lesson.findMany({
        where: { module: { courseVersionId: versionId } },
        orderBy: { position: 'asc' },
      })
    ).map((l) => l.id);
    expect(lessonIds).toHaveLength(7);
  });
  it('hides drafts, rejects enrollment and blocks the generic publish bypass', async () => {
    const catalog = await call(app, { url: '/api/v1/academy/courses', session: learner });
    expect(catalog.json().data.courses).toHaveLength(0);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: `/api/v1/academy/courses/${courseId}/enroll`,
          session: learner,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: `/api/v1/courses/${courseId}/publish`,
          session: owner,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    expect((await call(app, { url: '/api/v1/academy/review', session: learner })).statusCode).toBe(
      403,
    );
  });
  it('does not expose draft answer keys to an instructor assigned to another course', async () => {
    const user = tenant.users.INSTRUCTOR!;
    await db().userRole.updateMany({
      where: { userId: user.id },
      data: { scopeType: 'COURSE', scopeId: tenant.courseId },
    });
    const scoped = await signIn(app, user.email);
    const review = await call(app, { url: '/api/v1/academy/review', session: scoped });
    expect(review.statusCode, review.body).toBe(200);
    expect(review.json().data).toEqual([]);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: `/api/v1/academy/review/${courseId}/approve`,
          session: scoped,
          payload: { reviewedAllContent: true },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: '/api/v1/academy/import-week-one',
          session: scoped,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it('requires explicit instructor review and records approval provenance', async () => {
    const path = `/api/v1/academy/review/${courseId}/approve`;
    expect(
      (
        await call(app, {
          method: 'POST',
          url: path,
          session: owner,
          payload: { reviewedAllContent: false },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: path,
          session: outsider,
          payload: { reviewedAllContent: true },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: path,
          session: learner,
          payload: { reviewedAllContent: true },
        })
      ).statusCode,
    ).toBe(403);
    const response = await call(app, {
      method: 'POST',
      url: path,
      session: owner,
      payload: { reviewedAllContent: true },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(
      await db().question.count({
        where: {
          organizationId: tenant.organizationId,
          reviewedById: owner.userId,
          reviewStatus: 'APPROVED',
        },
      }),
    ).toBe(20);
  });
  it('enrolls idempotently and prevents cross-tenant enrollment', async () => {
    const path = `/api/v1/academy/courses/${courseId}/enroll`;
    expect(
      (await call(app, { method: 'POST', url: path, session: outsider, payload: {} })).statusCode,
    ).toBe(404);
    const first = await call(app, { method: 'POST', url: path, session: learner, payload: {} });
    expect(first.statusCode, first.body).toBe(200);
    enrollmentId = first.json().data.id;
    expect(
      (await call(app, { method: 'POST', url: path, session: learner, payload: {} })).json().data
        .id,
    ).toBe(enrollmentId);
  });
  it('enforces ownership for reading and changing lesson progress', async () => {
    for (const session of [outsider, otherLearner]) {
      expect(
        (await call(app, { url: `/api/v1/academy/enrollments/${enrollmentId}`, session }))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await call(app, {
            method: 'POST',
            url: `/api/v1/academy/enrollments/${enrollmentId}/complete-lesson`,
            session,
            payload: { lessonId: lessonIds[0] },
          })
        ).statusCode,
      ).toBe(404);
    }
  });
  it('serializes concurrent completion and keeps retries idempotent', async () => {
    const complete = (lessonId: string) =>
      call(app, {
        method: 'POST',
        url: `/api/v1/academy/enrollments/${enrollmentId}/complete-lesson`,
        session: learner,
        payload: { lessonId },
      });
    const responses = await Promise.all([
      complete(lessonIds[0]!),
      complete(lessonIds[1]!),
      complete(lessonIds[0]!),
    ]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    const enrollment = await db().enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.progressPercent).toBe(28);
    expect(await db().lessonProgress.count({ where: { enrollmentId } })).toBe(2);
    expect(
      await db().auditLog.count({
        where: { organizationId: tenant.organizationId, action: 'LESSON_COMPLETED' },
      }),
    ).toBe(2);
    expect(await db().certificate.count({ where: { employeeId: tenant.employees.LEARNER } })).toBe(
      0,
    );
  });
  it('starts one resumable attempt under concurrent requests, with no answer leakage', async () => {
    const start = () =>
      call(app, {
        method: 'POST',
        url: `/api/v1/academy/enrollments/${enrollmentId}/practice`,
        session: learner,
        payload: { quizId },
      });
    const responses = await Promise.all([start(), start()]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    attemptId = responses[0]!.json().data.id;
    expect(responses[1]!.json().data.id).toBe(attemptId);
    const delivered = await call(app, {
      url: `/api/v1/academy/attempts/${attemptId}`,
      session: learner,
    });
    expect(delivered.json().data.questions).toHaveLength(20);
    for (const secret of [
      'isCorrect',
      'feedback',
      'explanation',
      'questionSnapshot',
      'reviewedById',
    ])
      expect(delivered.body).not.toContain(secret);
    expect(
      (await call(app, { url: `/api/v1/academy/attempts/${attemptId}`, session: outsider }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(app, { url: `/api/v1/academy/attempts/${attemptId}`, session: otherLearner }))
        .statusCode,
    ).toBe(404);
  });
  it('rejects malformed answer choices and rolls back the submission claim', async () => {
    const response = await call(app, {
      method: 'POST',
      url: `/api/v1/academy/attempts/${attemptId}/submit`,
      session: learner,
      payload: { answers: [{ questionId: lessonIds[0], optionIds: [] }] },
    });
    expect(response.statusCode, response.body).toBe(400);
    expect((await db().quizAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status).toBe(
      'IN_PROGRESS',
    );
  });
  it('grades once under concurrent submissions and reveals explanations only afterward', async () => {
    const attempt = await db().quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const snapshot = attempt.questionSnapshot as {
      id: string;
      options: { id: string; isCorrect: boolean }[];
    }[];
    const answers = snapshot.map((q) => ({
      questionId: q.id,
      optionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
    }));
    const submit = () =>
      call(app, {
        method: 'POST',
        url: `/api/v1/academy/attempts/${attemptId}/submit`,
        session: learner,
        payload: { answers, scorePercent: 0 },
      });
    for (const response of await Promise.all([submit(), submit()]))
      expect(response.statusCode, response.body).toBe(200);
    expect(
      Number((await db().quizAttempt.findUniqueOrThrow({ where: { id: attemptId } })).scorePercent),
    ).toBe(100);
    expect(await db().quizResponse.count({ where: { attemptId } })).toBe(20);
    const result = await call(app, {
      url: `/api/v1/academy/attempts/${attemptId}`,
      session: learner,
    });
    expect(result.json().data.review).toHaveLength(20);
    expect(result.body).toContain('feedback');
  });
  it('keeps the enrollment pinned when another course version is published', async () => {
    const version = await db().courseVersion.create({
      data: {
        organizationId: tenant.organizationId,
        courseId,
        version: 2,
        title: 'Future version',
        objectives: [],
        warningIntervalDays: [],
      },
    });
    await db().course.update({ where: { id: courseId }, data: { publishedVersionId: version.id } });
    const response = await call(app, {
      url: `/api/v1/academy/enrollments/${enrollmentId}`,
      session: learner,
    });
    expect(response.json().data.courseVersionId).toBe(versionId);
    expect(response.json().data.courseVersion.version).toBe(1);
  });
  it('rejects late answers based on the server deadline', async () => {
    await db().quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 1 } });
    const started = await call(app, {
      method: 'POST',
      url: `/api/v1/academy/enrollments/${enrollmentId}/practice`,
      session: learner,
      payload: { quizId },
    });
    expect(started.statusCode, started.body).toBe(200);
    const id = started.json().data.id;
    await db().quizAttempt.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - 120000) },
    });
    const submitted = await call(app, {
      method: 'POST',
      url: `/api/v1/academy/attempts/${id}/submit`,
      session: learner,
      payload: { answers: [] },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().data).toMatchObject({ expired: true, scorePercent: 0 });
  });
});
