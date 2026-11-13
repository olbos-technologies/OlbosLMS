import { randomInt } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  gradeAcademy,
  lessonProgressPercent,
  publicAcademyQuestions,
  shuffleAcademy,
  type AcademyQuestion,
} from '@olbos/core';
import { assertWithinLimit } from '@olbos/billing';
import { can } from '@olbos/permissions';
import { type Prisma } from '@olbos/database';
import { ApiError } from '../../errors.js';
import { idParams, ok, parseBody, parseParams } from '../../lib/http.js';
import {
  academyMetadata,
  weekOneLessons,
  weekOneQuestions,
} from '../../services/academy-content.js';

const shuffle = <T>(values: T[]): T[] => {
  return shuffleAcademy(values, randomInt);
};
const snapshotSchema = z.array(
  z.object({
    id: z.string(),
    type: z.enum(['MULTIPLE_CHOICE', 'MULTIPLE_SELECT']),
    prompt: z.string(),
    explanation: z.string(),
    objectiveId: z.string(),
    points: z.number(),
    options: z.array(
      z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean(), feedback: z.string() }),
    ),
  }),
);
const academyTag = 'certification-academy';

export const academyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/academy/courses', async (request) => {
    const { db, principal } = request.requireTenant();
    request.authorize('course:read');
    const courses = await db.course.findMany({
      where: { tags: { has: academyTag }, deletedAt: null, status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        summary: true,
        publishedVersion: {
          select: { id: true, version: true, academyMetadata: true, estimatedMinutes: true },
        },
      },
      orderBy: { title: 'asc' },
    });
    const enrollments = await db.enrollment.findMany({
      where: { userId: principal.userId, course: { tags: { has: academyTag }, deletedAt: null } },
      select: { id: true, courseId: true, courseVersionId: true, progressPercent: true },
    });
    return ok({
      courses: courses.filter((course) =>
        can(principal.access, 'course:read', { courseId: course.id }),
      ),
      enrollments,
    });
  });

  app.post('/academy/import-week-one', async (request, reply) => {
    const { db, principal, organizationId } = request.requireTenant();
    const creation = request.authorize('course:create');
    const bankManagement = request.authorize('question_bank:manage');
    if (creation.constraint || bankManagement.constraint) {
      throw ApiError.forbidden(
        'Organization-wide course and question bank permissions are required to import this package.',
      );
    }
    assertWithinLimit(
      principal.entitlements,
      'MAX_COURSES',
      await db.course.count({ where: { deletedAt: null } }),
    );
    const existing = await db.course.findFirst({ where: { slug: 'aws-saa-c03-foundation' } });
    if (existing)
      throw ApiError.conflict('The Week 1 package is already imported. Review the existing draft.');
    const course = await db.$transaction(
      async (tx) => {
        const created = await tx.course.create({
          data: {
            organizationId,
            ownerId: principal.userId,
            title: 'AWS Solutions Architect – Associate',
            slug: 'aws-saa-c03-foundation',
            code: 'SAA-C03',
            type: 'CERTIFICATION',
            status: 'DRAFT',
            tags: [academyTag, 'cloud', 'associate'],
            summary:
              'Week 1: AWS fundamentals and IAM. Begin a structured certification learning path with seven lessons and twenty original practice questions.',
          },
        });
        const version = await tx.courseVersion.create({
          data: {
            organizationId,
            courseId: created.id,
            version: 1,
            title: created.title,
            academyMetadata,
            objectives: [
              '1.1 Design secure access to AWS resources',
              '2.2 Design highly available and/or fault-tolerant architectures (foundation)',
            ],
            estimatedMinutes: 180,
            passingScore: 80,
            warningIntervalDays: [],
            issuesCertificate: false,
            requiresFinalAssessment: true,
          },
        });
        const module = await tx.courseModule.create({
          data: {
            organizationId,
            courseVersionId: version.id,
            title: 'Week 1 — AWS Fundamentals and IAM',
            position: 1,
          },
        });
        for (const [position, lesson] of weekOneLessons.entries()) {
          await tx.lesson.create({
            data: {
              organizationId,
              moduleId: module.id,
              position,
              title: lesson.title,
              durationSeconds: 1200,
              body: [
                `Learning objectives\n${lesson.objectives.join('\n')}`,
                'Prerequisites\nBasic familiarity with web applications. No AWS account required.',
                `Concept\n${lesson.concept}`,
                `Example\n${lesson.example}`,
                `Architecture considerations and comparisons\n${lesson.comparison}`,
                `Common misconception\n${lesson.misconception}`,
                `Exercise\n${lesson.exercise}`,
                `Knowledge check\n${lesson.check}`,
                `Summary\n${lesson.objectives.join('; ')}. Explain these ideas in your own words before moving on.`,
              ].join('\n\n'),
              metadata: {
                objectiveId: lesson.objectiveId,
                sources: academyMetadata.sources,
                sourceVerifiedAt: academyMetadata.sourceVerifiedAt,
              },
            },
          });
        }
        const bank = await tx.questionBank.create({
          data: {
            organizationId,
            name: 'SAA-C03 / Week 1 / v1',
            tags: ['SAA-C03', 'v1'],
            createdById: principal.userId,
          },
        });
        const quiz = await tx.quiz.create({
          data: {
            organizationId,
            courseId: created.id,
            courseVersionId: version.id,
            title: 'AWS fundamentals and IAM — practice',
            passingScore: 80,
            shuffleQuestions: true,
            shuffleOptions: true,
            description: academyMetadata.disclaimer,
          },
        });
        for (const [position, question] of weekOneQuestions.entries()) {
          const item = await tx.question.create({
            data: {
              organizationId,
              bankId: bank.id,
              type: 'MULTIPLE_CHOICE',
              prompt: question.prompt,
              explanation: question.explanation,
              difficulty: question.difficulty,
              tags: [question.stableId, 'SAA-C03', question.objectiveId],
              payload: {
                stableId: question.stableId,
                objectiveId: question.objectiveId,
                examVersion: 'SAA-C03',
                sources: academyMetadata.sources,
                sourceVerifiedAt: academyMetadata.sourceVerifiedAt,
              },
              options: {
                create: question.options.map((option) => ({ organizationId, ...option })),
              },
            },
          });
          await tx.quizQuestion.create({
            data: { organizationId, quizId: quiz.id, questionId: item.id, position },
          });
        }
        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: principal.userId,
            action: 'COURSE_CREATED',
            entityType: 'course',
            entityId: created.id,
            summary: 'Imported unapproved academy Week 1 draft',
          },
        });
        return created;
      },
      { timeout: 30000 },
    );
    return reply.status(201).send(ok(course));
  });

  app.get('/academy/review', async (request) => {
    const { db, principal } = request.requireTenant();
    request.authorize('question_bank:manage');
    const candidates = await db.course.findMany({
      where: { tags: { has: academyTag }, status: 'DRAFT', deletedAt: null },
      select: { id: true },
    });
    const ids = candidates
      .filter((course) => {
        const resource = { courseId: course.id, departmentId: null, locationId: null };
        return can(principal.access, 'question_bank:manage', resource);
      })
      .map((course) => course.id);
    return ok(
      await db.course.findMany({
        where: { id: { in: ids }, tags: { has: academyTag }, status: 'DRAFT', deletedAt: null },
        include: {
          versions: {
            include: {
              modules: { include: { lessons: { orderBy: { position: 'asc' } } } },
              quizzes: {
                include: { questions: { include: { question: { include: { options: true } } } } },
              },
            },
          },
        },
      }),
    );
  });

  app.post('/academy/review/:id/approve', async (request) => {
    const { db, principal, organizationId } = request.requireTenant();
    const { id } = parseParams(request, idParams);
    parseBody(request, z.object({ reviewedAllContent: z.literal(true) }));
    const course = await db.course.findFirst({
      where: { id, tags: { has: academyTag }, deletedAt: null },
    });
    if (!course) throw ApiError.notFound('Course');
    request.authorize('course:publish', { courseId: id, departmentId: null, locationId: null });
    request.authorize('question_bank:manage', {
      courseId: id,
      departmentId: null,
      locationId: null,
    });
    await db.$transaction(async (tx) => {
      const claimed = await tx.course.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'IN_REVIEW' },
      });
      if (claimed.count !== 1) throw ApiError.conflict('This course is no longer a draft.');
      const version = await tx.courseVersion.findFirst({
        where: { courseId: id },
        orderBy: { version: 'desc' },
        include: {
          quizzes: {
            include: { questions: { include: { question: { include: { options: true } } } } },
          },
        },
      });
      if (!version) throw ApiError.conflict('Missing course version.');
      const ids = version.quizzes.flatMap((q) => q.questions.map((item) => item.questionId));
      if (
        ids.length !== 20 ||
        version.quizzes.some((q) =>
          q.questions.some(
            ({ question }) =>
              question.options.filter((o) => o.isCorrect).length !== 1 ||
              question.options.some((o) => !o.feedback),
          ),
        )
      ) {
        throw ApiError.conflict(
          'The foundation requires twenty valid reviewed single-answer questions with option explanations.',
        );
      }
      const now = new Date();
      await tx.question.updateMany({
        where: { id: { in: ids } },
        data: { reviewStatus: 'APPROVED', reviewedAt: now, reviewedById: principal.userId },
      });
      await tx.courseVersion.update({
        where: { id: version.id },
        data: {
          publishedAt: now,
          publishedById: principal.userId,
          changeSummary: 'Instructor reviewed Week 1 foundation',
        },
      });
      await tx.course.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedVersionId: version.id },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: principal.userId,
          action: 'COURSE_PUBLISHED',
          entityType: 'course_version',
          entityId: version.id,
          summary: 'Instructor attested review of all academy lessons, questions and sources',
        },
      });
    });
    return ok({ published: true });
  });

  app.post('/academy/courses/:id/enroll', async (request) => {
    const { db, principal, organizationId } = request.requireTenant();
    request.authorize('enrollment:enroll_self', { subjectUserId: principal.userId });
    const { id } = parseParams(request, idParams);
    const course = await db.course.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED', tags: { has: academyTag } },
    });
    if (!course?.publishedVersionId) throw ApiError.notFound('Course');
    request.authorize('course:read', { courseId: id, departmentId: null, locationId: null });
    const prerequisites = await db.coursePrerequisite.findMany({
      where: { courseId: id, required: true },
    });
    for (const prerequisite of prerequisites) {
      if (
        !(await db.enrollment.findFirst({
          where: {
            courseId: prerequisite.prerequisiteId,
            userId: principal.userId,
            status: 'COMPLETED',
          },
        }))
      ) {
        throw ApiError.conflict('Complete the required prerequisite course before enrolling.');
      }
    }
    const enrollment = await db.enrollment.upsert({
      where: {
        userId_courseVersionId: {
          userId: principal.userId,
          courseVersionId: course.publishedVersionId,
        },
      },
      create: {
        organizationId,
        userId: principal.userId,
        courseId: id,
        courseVersionId: course.publishedVersionId,
      },
      update: {},
    });
    await request.audit({
      action: 'ENROLLMENT_CREATED',
      entityType: 'enrollment',
      entityId: enrollment.id,
    });
    return ok({ id: enrollment.id });
  });

  app.get('/academy/enrollments/:id', async (request) => {
    const { db, principal } = request.requireTenant();
    request.authorize('enrollment:read');
    const { id } = parseParams(request, idParams);
    const enrollment = await db.enrollment.findFirst({
      where: {
        id,
        userId: principal.userId,
        course: { tags: { has: academyTag }, deletedAt: null },
      },
      select: {
        id: true,
        progressPercent: true,
        courseVersionId: true,
        lessonProgress: { select: { lessonId: true, status: true } },
        courseVersion: {
          select: {
            title: true,
            version: true,
            academyMetadata: true,
            modules: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                lessons: {
                  orderBy: { position: 'asc' },
                  select: { id: true, title: true, body: true, durationSeconds: true },
                },
              },
            },
            quizzes: { select: { id: true, title: true } },
          },
        },
        quizAttempts: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          select: { id: true, status: true, scorePercent: true, startedAt: true },
        },
      },
    });
    if (!enrollment) throw ApiError.notFound('Enrollment');
    return ok(enrollment);
  });

  app.post('/academy/enrollments/:id/complete-lesson', async (request) => {
    const { db, principal, organizationId } = request.requireTenant();
    request.authorize('lesson:complete_own', { subjectUserId: principal.userId });
    const { id } = parseParams(request, idParams);
    const { lessonId } = parseBody(request, z.object({ lessonId: z.string().uuid() }));
    return ok(
      await db.$transaction(async (tx) => {
        // The update locks the enrollment before computing its aggregate progress.
        const locked = await tx.enrollment.updateMany({
          where: {
            id,
            userId: principal.userId,
            course: { tags: { has: academyTag }, deletedAt: null },
            status: { in: ['ENROLLED', 'IN_PROGRESS'] },
          },
          data: { lastAccessedAt: new Date() },
        });
        if (!locked.count) throw ApiError.notFound('Enrollment');
        const enrollment = await tx.enrollment.findFirstOrThrow({
          where: { id, userId: principal.userId },
        });
        const lesson = await tx.lesson.findFirst({
          where: { id: lessonId, module: { courseVersionId: enrollment.courseVersionId } },
        });
        if (!lesson) throw ApiError.notFound('Lesson');
        if (lesson.minimumSeconds)
          throw ApiError.conflict(
            'This lesson requires a verified viewing session, unavailable in the foundation player.',
          );
        const prior = await tx.lessonProgress.findFirst({ where: { enrollmentId: id, lessonId } });
        await tx.lessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId: id, lessonId } },
          create: {
            organizationId,
            enrollmentId: id,
            lessonId,
            userId: principal.userId,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
          update: { status: 'COMPLETED' },
        });
        const required = await tx.lesson.findMany({
          where: { module: { courseVersionId: enrollment.courseVersionId }, isRequired: true },
          select: { id: true },
        });
        const completed = await tx.lessonProgress.findMany({
          where: { enrollmentId: id, userId: principal.userId, status: 'COMPLETED' },
          select: { lessonId: true },
        });
        const progressPercent = lessonProgressPercent(
          required.map((l) => l.id),
          completed.map((l) => l.lessonId),
        );
        await tx.enrollment.update({
          where: { id },
          data: {
            progressPercent,
            status: 'IN_PROGRESS',
            startedAt: enrollment.startedAt ?? new Date(),
          },
        });
        if (prior?.status !== 'COMPLETED') {
          await tx.auditLog.create({
            data: {
              organizationId,
              actorUserId: principal.userId,
              action: 'LESSON_COMPLETED',
              entityType: 'lesson_progress',
              entityId: lessonId,
              summary: 'Learner marked academy lesson complete',
            },
          });
        }
        return { progressPercent };
      }),
    );
  });

  app.post('/academy/enrollments/:id/practice', async (request) => {
    const { db, principal, organizationId } = request.requireTenant();
    request.authorize('quiz:attempt');
    const { id } = parseParams(request, idParams);
    const { quizId } = parseBody(request, z.object({ quizId: z.string().uuid() }));
    return ok(
      await db.$transaction(async (tx) => {
        const locked = await tx.enrollment.updateMany({
          where: {
            id,
            userId: principal.userId,
            course: { tags: { has: academyTag }, deletedAt: null },
            status: { in: ['ENROLLED', 'IN_PROGRESS'] },
          },
          data: { lastAccessedAt: new Date() },
        });
        if (!locked.count) throw ApiError.notFound('Enrollment');
        const enrollment = await tx.enrollment.findFirstOrThrow({
          where: { id, userId: principal.userId },
        });
        const quiz = await tx.quiz.findFirst({
          where: { id: quizId, courseVersionId: enrollment.courseVersionId },
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: { question: { include: { options: { orderBy: { position: 'asc' } } } } },
            },
          },
        });
        if (!quiz) throw ApiError.notFound('Quiz');
        if (
          (quiz.availableFrom && quiz.availableFrom > new Date()) ||
          (quiz.availableUntil && quiz.availableUntil < new Date())
        )
          throw ApiError.conflict('This practice is not currently available.');
        const active = await tx.quizAttempt.findFirst({
          where: { quizId, userId: principal.userId, enrollmentId: id, status: 'IN_PROGRESS' },
        });
        if (active) return { id: active.id };
        const count = await tx.quizAttempt.count({ where: { quizId, userId: principal.userId } });
        if (quiz.maxAttempts && count >= quiz.maxAttempts)
          throw ApiError.conflict('The attempt limit has been reached.');
        if (
          !quiz.questions.length ||
          quiz.questions.some(
            ({ question }) =>
              question.reviewStatus !== 'APPROVED' ||
              !['MULTIPLE_CHOICE', 'MULTIPLE_SELECT'].includes(question.type),
          )
        )
          throw ApiError.conflict('This quiz is not approved for practice.');
        let snapshot: AcademyQuestion[] = quiz.questions.map(({ question, points }) => ({
          id: question.id,
          type: question.type as 'MULTIPLE_CHOICE' | 'MULTIPLE_SELECT',
          prompt: question.prompt,
          points: Number(points ?? question.points),
          explanation: question.explanation ?? '',
          objectiveId: String((question.payload as Record<string, unknown>).objectiveId ?? ''),
          options: question.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            feedback: o.feedback ?? '',
          })),
        }));
        if (quiz.shuffleQuestions) snapshot = shuffle(snapshot);
        if (quiz.shuffleOptions)
          snapshot = snapshot.map((q) => ({ ...q, options: shuffle(q.options) }));
        const attempt = await tx.quizAttempt.create({
          data: {
            organizationId,
            userId: principal.userId,
            enrollmentId: id,
            quizId,
            attemptNumber: count + 1,
            questionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          },
        });
        return { id: attempt.id };
      }),
    );
  });

  app.get('/academy/attempts/:id', async (request) => {
    const { db, principal } = request.requireTenant();
    request.authorize('quiz:attempt');
    const { id } = parseParams(request, idParams);
    const attempt = await db.quizAttempt.findFirst({
      where: { id, userId: principal.userId },
      include: { quiz: true, responses: true },
    });
    if (!attempt) throw ApiError.notFound('Attempt');
    const snapshot = snapshotSchema.parse(attempt.questionSnapshot);
    return ok({
      id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      timeLimitMinutes: attempt.quiz.timeLimitMinutes,
      scorePercent: attempt.scorePercent,
      questions: publicAcademyQuestions(snapshot),
      ...(attempt.status === 'GRADED' && attempt.quiz.showFeedback
        ? {
            review: snapshot,
            responses: attempt.responses.map((r) => ({
              questionId: r.questionId,
              answer: r.answer,
              isCorrect: r.isCorrect,
            })),
          }
        : {}),
    });
  });

  app.post('/academy/attempts/:id/submit', async (request) => {
    const { db, principal, organizationId } = request.requireTenant();
    request.authorize('quiz:attempt');
    const { id } = parseParams(request, idParams);
    const { answers } = parseBody(
      request,
      z.object({
        answers: z
          .array(
            z.object({
              questionId: z.string().uuid(),
              optionIds: z.array(z.string().uuid()).max(10),
            }),
          )
          .max(100),
      }),
    );
    return ok(
      await db.$transaction(async (tx) => {
        const claim = await tx.quizAttempt.updateMany({
          where: { id, userId: principal.userId, status: 'IN_PROGRESS' },
          data: { status: 'SUBMITTED' },
        });
        const attempt = await tx.quizAttempt.findFirst({
          where: { id, userId: principal.userId },
          include: { quiz: true },
        });
        if (!attempt) throw ApiError.notFound('Attempt');
        if (!claim.count) return { id, status: attempt.status, scorePercent: attempt.scorePercent };
        const snapshot = snapshotSchema.parse(attempt.questionSnapshot);
        const now = new Date();
        const expired =
          attempt.quiz.timeLimitMinutes !== null &&
          now.getTime() > attempt.startedAt.getTime() + attempt.quiz.timeLimitMinutes * 60000;
        // Late submissions are graded as unanswered, never accepted after the deadline.
        let result;
        try {
          result = gradeAcademy(snapshot, expired ? [] : answers, attempt.quiz.passingScore);
        } catch {
          throw ApiError.badRequest('The answers contain an invalid or duplicate selection.');
        }
        for (const response of result.responses) {
          const answer = expired
            ? undefined
            : answers.find((a) => a.questionId === response.questionId);
          await tx.quizResponse.create({
            data: {
              organizationId,
              attemptId: id,
              questionId: response.questionId,
              answer: { optionIds: answer?.optionIds ?? [] },
              isCorrect: response.isCorrect,
              pointsEarned: response.pointsEarned,
              gradedAt: now,
            },
          });
        }
        await tx.quizAttempt.update({
          where: { id },
          data: {
            status: 'GRADED',
            submittedAt: now,
            gradedAt: now,
            pointsEarned: result.pointsEarned,
            pointsPossible: result.pointsPossible,
            scorePercent: result.scorePercent,
            passed: result.passed,
            timeSpentSeconds: Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: principal.userId,
            action: 'GRADE_CHANGED',
            entityType: 'quiz_attempt',
            entityId: id,
            summary: 'Server graded academy practice attempt',
          },
        });
        return { id, status: 'GRADED', scorePercent: result.scorePercent, expired };
      }),
    );
  });
};
