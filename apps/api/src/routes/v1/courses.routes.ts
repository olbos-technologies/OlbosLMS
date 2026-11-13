import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkRepresentation, TRAINING_TYPES, type TrainingType } from '@olbos/core';
import { assertWithinLimit } from '@olbos/billing';
import { ApiError } from '../../errors.js';
import {
  booleanQuery,
  idParams,
  ok,
  paginated,
  paginationSchema,
  parseBody,
  parseParams,
  parseQuery,
  toOrderBy,
  toSkipTake,
} from '../../lib/http.js';

/**
 * Courses and course versions (§8, §9, §10).
 *
 * Publishing runs the representation check: a course cannot go live claiming an
 * authorisation the organization has not recorded evidence for.
 */

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const trainingTypeEnum = z.enum(Object.keys(TRAINING_TYPES) as [TrainingType, ...TrainingType[]]);

const courseBody = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().max(2000).optional(),
  code: z.string().trim().max(32).optional(),
  type: z
    .enum([
      'ACADEMIC',
      'PROFESSIONAL',
      'SAFETY',
      'COMPLIANCE',
      'CERTIFICATION',
      'ORIENTATION',
      'REFRESHER',
      'MICROLEARNING',
    ])
    .default('SAFETY'),
  tags: z.array(z.string().max(40)).max(20).default([]),
  version: z
    .object({
      description: z.string().max(4000).optional(),
      objectives: z.array(z.string().max(300)).max(20).default([]),
      deliveryMethod: z
        .enum([
          'ONLINE_SELF_PACED',
          'INSTRUCTOR_LED_CLASSROOM',
          'INSTRUCTOR_LED_VIRTUAL',
          'BLENDED',
          'ON_THE_JOB',
          'EXTERNAL',
        ])
        .default('ONLINE_SELF_PACED'),
      trainingType: trainingTypeEnum.default('ORGANIZATION_TRAINING'),
      estimatedMinutes: z.number().int().min(1).max(100_000).optional(),
      passingScore: z.number().int().min(0).max(100).default(80),
      maxAttempts: z.number().int().min(1).max(20).optional(),
      requiresFinalAssessment: z.boolean().default(false),
      requiresPracticalAssessment: z.boolean().default(false),
      requiresAttendance: z.boolean().default(false),
      requiresInstructorSignoff: z.boolean().default(false),
      renewalIntervalDays: z.number().int().min(0).max(3650).nullable().default(null),
      warningIntervalDays: z.array(z.number().int().min(1).max(3650)).max(10).default([]),
      issuesCertificate: z.boolean().default(true),
      safety: z
        .object({
          safetyCategory: z.string().max(120).optional(),
          industry: z.string().max(120).optional(),
          hazardCategories: z.array(z.string().max(64)).max(30).default([]),
          targetAudience: z.array(z.string().max(120)).max(30).default([]),
          regulatoryReferences: z.array(z.string().max(120)).max(30).default([]),
          companyPolicyReferences: z.array(z.string().max(120)).max(30).default([]),
          instructorRequirements: z.string().max(1000).optional(),
          practicalRequirements: z.string().max(1000).optional(),
          disclaimer: z.string().max(2000).optional(),
          revision: z.string().max(50).optional(),
          /** Required for course types that assert an external authorisation. */
          providerName: z.string().max(200).optional(),
          authorizationId: z.string().max(120).optional(),
          authorizationExpiresAt: z.coerce.date().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/courses', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('course:read');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        search: z.string().max(120).optional(),
        type: z.string().max(30).optional(),
        status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
        safetyOnly: booleanQuery.optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.safetyOnly ? { type: { in: ['SAFETY', 'COMPLIANCE', 'CERTIFICATION'] } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.course.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(pagination, ['title', 'createdAt', 'type'], 'title'),
        select: {
          id: true,
          title: true,
          slug: true,
          code: true,
          summary: true,
          type: true,
          status: true,
          tags: true,
          updatedAt: true,
          publishedVersion: {
            select: {
              id: true,
              version: true,
              estimatedMinutes: true,
              deliveryMethod: true,
              trainingType: true,
              renewalIntervalDays: true,
              issuesCertificate: true,
              safetyProfile: {
                select: { safetyCategory: true, hazardCategories: true, disclaimer: true },
              },
            },
          },
          _count: { select: { enrollments: true, requirements: true, trainingRecords: true } },
        },
      }),
      db.course.count({ where }),
    ]);

    return paginated(items, total, pagination);
  });

  app.get('/courses/:id', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('course:read');
    const { id } = parseParams(request, idParams);

    const course = await db.course.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        code: true,
        summary: true,
        type: true,
        status: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        publishedVersion: {
          select: {
            id: true,
            version: true,
            description: true,
            objectives: true,
            deliveryMethod: true,
            trainingType: true,
            estimatedMinutes: true,
            creditHours: true,
            passingScore: true,
            maxAttempts: true,
            requiresFinalAssessment: true,
            requiresPracticalAssessment: true,
            requiresAttendance: true,
            requiresInstructorSignoff: true,
            renewalIntervalDays: true,
            expirationBasis: true,
            warningIntervalDays: true,
            issuesCertificate: true,
            effectiveDate: true,
            reviewDate: true,
            publishedAt: true,
            safetyProfile: true,
            modules: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                position: true,
                isRequired: true,
                lessons: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    position: true,
                    contentType: true,
                    durationSeconds: true,
                    isRequired: true,
                  },
                },
              },
            },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, publishedAt: true, changeSummary: true },
        },
      },
    });

    if (!course) throw ApiError.notFound('Course');
    return ok(course);
  });

  app.post('/courses', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.authorize('course:create');
    const body = parseBody(request, courseBody);

    const currentCount = await db.course.count({ where: { deletedAt: null } });
    assertWithinLimit(principal.entitlements, 'MAX_COURSES', currentCount);

    // Representation is checked at creation as well as at publication, so a
    // problem surfaces while the author is still in the editor.
    const representation = checkRepresentation({
      trainingType: body.version?.trainingType ?? 'ORGANIZATION_TRAINING',
      title: body.title,
      description: body.summary ?? null,
      evidence: body.version?.safety
        ? {
            providerName: body.version.safety.providerName ?? null,
            authorizationId: body.version.safety.authorizationId ?? null,
            authorizationExpiresAt: body.version.safety.authorizationExpiresAt ?? null,
          }
        : null,
    });

    if (representation.problems.some((problem) => problem.includes('OSHA does not approve'))) {
      throw ApiError.unprocessable(
        'This course title claims an authorisation that cannot be represented.',
        representation.problems.map((message) => ({ field: 'title', message })),
      );
    }

    const version = body.version;
    const course = await db.course.create({
      data: {
        organizationId,
        title: body.title,
        slug: slugify(body.title),
        code: body.code ?? null,
        summary: body.summary ?? null,
        type: body.type,
        tags: body.tags,
        status: 'DRAFT',
        ownerId: principal.userId,
        versions: {
          create: {
            organizationId,
            version: 1,
            title: body.title,
            description: version?.description ?? body.summary ?? null,
            objectives: version?.objectives ?? [],
            deliveryMethod: version?.deliveryMethod ?? 'ONLINE_SELF_PACED',
            trainingType: version?.trainingType ?? 'ORGANIZATION_TRAINING',
            estimatedMinutes: version?.estimatedMinutes ?? null,
            passingScore: version?.passingScore ?? 80,
            maxAttempts: version?.maxAttempts ?? null,
            requiresFinalAssessment: version?.requiresFinalAssessment ?? false,
            requiresPracticalAssessment: version?.requiresPracticalAssessment ?? false,
            requiresAttendance: version?.requiresAttendance ?? false,
            requiresInstructorSignoff: version?.requiresInstructorSignoff ?? false,
            renewalIntervalDays: version?.renewalIntervalDays ?? null,
            warningIntervalDays: version?.warningIntervalDays ?? [],
            issuesCertificate: version?.issuesCertificate ?? true,
            ...(version?.safety
              ? {
                  safetyProfile: {
                    create: {
                      organizationId,
                      safetyCategory: version.safety.safetyCategory ?? null,
                      industry: version.safety.industry ?? null,
                      hazardCategories: version.safety.hazardCategories,
                      targetAudience: version.safety.targetAudience,
                      regulatoryReferences: version.safety.regulatoryReferences,
                      companyPolicyReferences: version.safety.companyPolicyReferences,
                      instructorRequirements: version.safety.instructorRequirements ?? null,
                      practicalRequirements: version.safety.practicalRequirements ?? null,
                      disclaimer: representation.disclaimer,
                      revision: version.safety.revision ?? 'Rev 1.0',
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: { versions: true },
    });

    await request.audit({
      action: 'COURSE_CREATED',
      entityType: 'course',
      entityId: course.id,
      summary: `Created course "${body.title}"`,
      changes: { type: body.type, trainingType: version?.trainingType },
    });

    return reply.status(201).send(
      ok(course, {
        representation: {
          ok: representation.ok,
          warnings: representation.problems,
          disclaimer: representation.disclaimer,
        },
      }),
    );
  });

  /**
   * Publishing is the gate. It refuses any course whose declared training type
   * asserts an authorisation without recorded evidence (§10).
   */
  app.post('/courses/:id/publish', async (request) => {
    const { db } = request.requireTenant();
    const { id } = parseParams(request, idParams);

    const course = await db.course.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            trainingType: true,
            safetyProfile: {
              select: { id: true, disclaimer: true, instructorRequirements: true },
            },
          },
        },
      },
    });
    if (!course) throw ApiError.notFound('Course');

    request.authorize('course:publish', { courseId: course.id });

    const version = course.versions[0];
    if (!version) throw ApiError.conflict('This course has no version to publish.');

    const body = parseBody(
      request,
      z.object({
        providerName: z.string().max(200).optional(),
        authorizationId: z.string().max(120).optional(),
        authorizationExpiresAt: z.coerce.date().optional(),
        changeSummary: z.string().max(1000).optional(),
      }),
    );

    const representation = checkRepresentation({
      trainingType: version.trainingType,
      title: course.title,
      description: course.summary,
      evidence: {
        providerName: body.providerName ?? null,
        authorizationId: body.authorizationId ?? null,
        authorizationExpiresAt: body.authorizationExpiresAt ?? null,
      },
    });

    if (!representation.ok) {
      throw ApiError.unprocessable(
        'This course cannot be published as declared.',
        representation.problems.map((message) => ({ message })),
      );
    }

    const now = new Date();
    await db.courseVersion.update({
      where: { id: version.id },
      data: {
        publishedAt: now,
        publishedById: request.principal?.userId ?? null,
        changeSummary: body.changeSummary ?? null,
        effectiveDate: now,
      },
    });

    const updated = await db.course.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedVersionId: version.id },
    });

    if (version.safetyProfile) {
      await db.safetyCourseProfile.update({
        where: { id: version.safetyProfile.id },
        data: { disclaimer: representation.disclaimer },
      });
    }

    await request.audit({
      action: 'COURSE_PUBLISHED',
      entityType: 'course_version',
      entityId: version.id,
      summary: `Published ${course.title} version ${version.version}`,
      changes: { trainingType: version.trainingType, changeSummary: body.changeSummary ?? null },
    });

    return ok(updated, { disclaimer: representation.disclaimer });
  });

  /** The representation rules, so the UI can explain them before publishing. */
  app.get('/courses/training-types', async (request) => {
    request.requireAuth();
    return ok(
      Object.values(TRAINING_TYPES).map((definition) => ({
        type: definition.type,
        label: definition.label,
        description: definition.description,
        requiresAuthorizationEvidence: definition.requiresAuthorizationEvidence,
        defaultDisclaimer: definition.defaultDisclaimer,
      })),
    );
  });
};
