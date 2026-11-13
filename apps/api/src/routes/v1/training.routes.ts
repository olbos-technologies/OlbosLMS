import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveVisibility, VISIBILITY_LADDERS } from '@olbos/permissions';
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
  uuidSchema,
} from '../../lib/http.js';
import {
  completeTraining,
  loadActiveRequirements,
  markRequirementDirty,
  syncEmployeeRequirements,
} from '../../services/training.service.js';

/**
 * Training requirements, assignments, records and sessions (§13–§15).
 */

const requirementScope = z.enum([
  'ORGANIZATION',
  'DEPARTMENT',
  'LOCATION',
  'JOB_ROLE',
  'EMPLOYMENT_TYPE',
  'HAZARD_EXPOSURE',
  'EQUIPMENT_AUTHORIZATION',
  'SHIFT',
  'INDIVIDUAL',
]);

const requirementFields = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().max(2000).optional(),
  courseId: uuidSchema,
  scopeType: requirementScope,
  departmentId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  jobRoleId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'SEASONAL', 'INTERN', 'VOLUNTEER'])
    .optional(),
  shift: z.string().max(64).optional(),
  hazardExposure: z.string().max(64).optional(),
  equipmentKey: z.string().max(64).optional(),
  dueWithinDays: z.number().int().min(0).max(3650).nullable(),
  renewalIntervalDays: z.number().int().min(0).max(3650).nullable().optional(),
  warningIntervalDays: z.array(z.number().int().min(1).max(3650)).max(10).optional(),
  isMandatory: z.boolean(),
  isActive: z.boolean(),
  basis: z.string().max(1000).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveUntil: z.coerce.date().optional(),
});

/**
 * Each scope needs its own target; without this a JOB_ROLE requirement with no
 * job role would silently apply to nobody.
 */
const requirementBody = requirementFields
  .extend({
    dueWithinDays: requirementFields.shape.dueWithinDays.default(30),
    isMandatory: requirementFields.shape.isMandatory.default(true),
    isActive: requirementFields.shape.isActive.default(true),
  })
  .superRefine((value, ctx) => {
    const required: Partial<Record<z.infer<typeof requirementScope>, keyof typeof value>> = {
      DEPARTMENT: 'departmentId',
      LOCATION: 'locationId',
      JOB_ROLE: 'jobRoleId',
      EMPLOYMENT_TYPE: 'employmentType',
      SHIFT: 'shift',
      HAZARD_EXPOSURE: 'hazardExposure',
      EQUIPMENT_AUTHORIZATION: 'equipmentKey',
      INDIVIDUAL: 'employeeId',
    };
    const field = required[value.scopeType];
    if (field && !value[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `A ${value.scopeType.toLowerCase().replace('_', ' ')} requirement needs this field.`,
      });
    }
  });

export const trainingRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // Requirements
  // -------------------------------------------------------------------------

  app.get('/training/requirements', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('training_requirement:read');
    const pagination = parseQuery(request, paginationSchema);
    const { skip, take } = toSkipTake(pagination);

    const [items, total] = await Promise.all([
      db.trainingRequirement.findMany({
        skip,
        take,
        orderBy: toOrderBy(pagination, ['name', 'createdAt', 'scopeType'], 'name'),
        select: {
          id: true,
          name: true,
          description: true,
          scopeType: true,
          dueWithinDays: true,
          renewalIntervalDays: true,
          isMandatory: true,
          isActive: true,
          basis: true,
          course: { select: { id: true, title: true, type: true } },
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          jobRole: { select: { id: true, title: true } },
          hazardExposure: true,
          equipmentKey: true,
          shift: true,
          employmentType: true,
          _count: { select: { complianceStates: true } },
        },
      }),
      db.trainingRequirement.count(),
    ]);

    return paginated(items, total, pagination);
  });

  app.post('/training/requirements', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('training_requirement:manage');
    const body = parseBody(request, requirementBody);

    const course = await db.course.findFirst({
      where: { id: body.courseId },
      select: { id: true, title: true },
    });
    if (!course) throw ApiError.notFound('Course');

    const requirement = await db.trainingRequirement.create({
      data: {
        organizationId,
        name: body.name,
        description: body.description ?? null,
        courseId: body.courseId,
        scopeType: body.scopeType,
        departmentId: body.departmentId ?? null,
        locationId: body.locationId ?? null,
        jobRoleId: body.jobRoleId ?? null,
        employeeId: body.employeeId ?? null,
        employmentType: body.employmentType ?? null,
        shift: body.shift ?? null,
        hazardExposure: body.hazardExposure ?? null,
        equipmentKey: body.equipmentKey ?? null,
        dueWithinDays: body.dueWithinDays,
        renewalIntervalDays: body.renewalIntervalDays ?? null,
        warningIntervalDays: body.warningIntervalDays ?? [],
        isMandatory: body.isMandatory,
        isActive: body.isActive,
        basis: body.basis ?? null,
        effectiveFrom: body.effectiveFrom ?? null,
        effectiveUntil: body.effectiveUntil ?? null,
        createdById: request.principal?.userId ?? null,
      },
    });

    // Everyone's obligations may have changed; the sweep does the work.
    const affected = await markRequirementDirty(db);

    await request.audit({
      action: 'TRAINING_REQUIREMENT_CREATED',
      entityType: 'training_requirement',
      entityId: requirement.id,
      summary: `Created requirement "${body.name}" for ${course.title}`,
      changes: { scopeType: body.scopeType, courseId: body.courseId },
    });

    return reply.status(201).send(ok(requirement, { employeesQueuedForRecalculation: affected }));
  });

  app.patch('/training/requirements/:id', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('training_requirement:manage');
    const { id } = parseParams(request, idParams);
    const body = parseBody(request, requirementFields.partial());

    const before = await db.trainingRequirement.findFirst({ where: { id } });
    if (!before) throw ApiError.notFound('Training requirement');

    const requirement = await db.trainingRequirement.update({
      where: { id },
      data: { ...body },
    });

    const affected = await markRequirementDirty(db);

    await request.audit({
      action: 'TRAINING_REQUIREMENT_UPDATED',
      entityType: 'training_requirement',
      entityId: id,
      summary: `Updated requirement "${requirement.name}"`,
      changes: body as Record<string, unknown>,
    });

    return ok(requirement, { employeesQueuedForRecalculation: affected });
  });

  /** Recomputes one employee's obligations immediately. */
  app.post('/training/requirements/evaluate/:id', async (request) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.authorize('training_requirement:manage');
    const { id } = parseParams(request, idParams);

    const result = await syncEmployeeRequirements(db, organizationId, id, {
      actorUserId: principal.userId,
      timezone: principal.organization?.timezone,
    });

    return ok(result);
  });

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  app.get('/training/assignments', async (request) => {
    const { principal, db } = request.requireTenant();
    const { permission, filter } = resolveVisibility(
      principal.access,
      VISIBILITY_LADDERS.trainingAssignments,
    );
    if (!permission) throw ApiError.forbidden('You cannot view training assignments.');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        status: z
          .enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED', 'CANCELLED'])
          .optional(),
        employeeId: uuidSchema.optional(),
        courseId: uuidSchema.optional(),
        overdue: booleanQuery.optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where: Record<string, unknown> = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.overdue
        ? { dueAt: { lt: new Date() }, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }
        : {}),
    };

    if (filter.selfOnly) {
      where.employeeId = principal.access.employeeId ?? '00000000-0000-0000-0000-000000000000';
    } else if (filter.teamOnly) {
      where.employeeId = {
        in: [...(principal.access.supervisedEmployeeIds ?? []), principal.access.employeeId].filter(
          Boolean,
        ) as string[],
      };
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    const [items, total] = await Promise.all([
      db.trainingAssignment.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(pagination, ['dueAt', 'assignedAt', 'status'], 'dueAt'),
        select: {
          id: true,
          status: true,
          origin: true,
          assignedAt: true,
          dueAt: true,
          startedAt: true,
          completedAt: true,
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
          course: { select: { id: true, title: true, type: true } },
          requirement: { select: { id: true, name: true } },
        },
      }),
      db.trainingAssignment.count({ where }),
    ]);

    return paginated(items, total, pagination, { scope: permission });
  });

  app.post('/training/assignments', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();
    const body = parseBody(
      request,
      z.object({
        employeeIds: z.array(uuidSchema).min(1).max(500),
        courseId: uuidSchema,
        dueAt: z.coerce.date().optional(),
        notes: z.string().max(1000).optional(),
      }),
    );

    const course = await db.course.findFirst({
      where: { id: body.courseId, status: 'PUBLISHED' },
      select: { id: true, title: true, publishedVersionId: true },
    });
    if (!course) throw ApiError.notFound('Published course');

    const employees = await db.employee.findMany({
      where: { id: { in: body.employeeIds }, deletedAt: null },
      select: { id: true, departmentId: true, locationId: true },
    });

    // Authorize per employee: a department-scoped supervisor may assign within
    // their department and nowhere else.
    for (const employee of employees) {
      request.authorize('training_assignment:create', {
        organizationId,
        departmentId: employee.departmentId,
        locationId: employee.locationId,
        subjectEmployeeId: employee.id,
      });
    }

    const created: string[] = [];
    for (const employee of employees) {
      const existing = await db.trainingAssignment.findFirst({
        where: {
          employeeId: employee.id,
          courseId: body.courseId,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const assignment = await db.trainingAssignment.create({
        data: {
          organizationId,
          employeeId: employee.id,
          courseId: body.courseId,
          courseVersionId: course.publishedVersionId,
          status: 'ASSIGNED',
          origin: 'MANUAL',
          assignedById: principal.userId,
          dueAt: body.dueAt ?? null,
          notes: body.notes ?? null,
        },
      });
      created.push(assignment.id);
    }

    await request.audit({
      action: 'TRAINING_ASSIGNED',
      entityType: 'training_assignment',
      summary: `Assigned ${course.title} to ${created.length} employee(s)`,
      changes: { courseId: body.courseId, employeeCount: created.length },
    });

    return reply.status(201).send(
      ok({
        created: created.length,
        skipped: employees.length - created.length,
        assignmentIds: created,
      }),
    );
  });

  app.post('/training/assignments/:id/waive', async (request) => {
    const { db } = request.requireTenant();
    const { id } = parseParams(request, idParams);
    const body = parseBody(request, z.object({ reason: z.string().trim().min(5).max(1000) }));

    const assignment = await db.trainingAssignment.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        employee: { select: { id: true, departmentId: true, locationId: true } },
        course: { select: { title: true } },
      },
    });
    if (!assignment) throw ApiError.notFound('Training assignment');

    request.authorize('training_assignment:waive', {
      departmentId: assignment.employee.departmentId,
      locationId: assignment.employee.locationId,
      subjectEmployeeId: assignment.employee.id,
    });

    if (assignment.status === 'COMPLETED') {
      throw ApiError.conflict('Completed training cannot be waived.');
    }

    const updated = await db.trainingAssignment.update({
      where: { id },
      data: {
        status: 'WAIVED',
        waivedAt: new Date(),
        waivedById: request.principal?.userId ?? null,
        waiverReason: body.reason,
      },
    });

    // The waiver changes this employee's compliance position immediately.
    await db.employee.updateMany({
      where: { id: assignment.employee.id },
      data: { requirementsStaleAt: new Date() },
    });

    await request.audit({
      action: 'TRAINING_WAIVED',
      entityType: 'training_assignment',
      entityId: id,
      summary: `Waived ${assignment.course.title}`,
      changes: { reason: body.reason },
    });

    return ok(updated);
  });

  // -------------------------------------------------------------------------
  // Records
  // -------------------------------------------------------------------------

  app.get('/training/records', async (request) => {
    const { principal, db } = request.requireTenant();
    const { permission, filter } = resolveVisibility(
      principal.access,
      VISIBILITY_LADDERS.trainingRecords,
    );
    if (!permission) throw ApiError.forbidden('You cannot view training records.');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        employeeId: uuidSchema.optional(),
        courseId: uuidSchema.optional(),
        includeSuperseded: booleanQuery.default(false),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where: Record<string, unknown> = {
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.includeSuperseded ? {} : { supersededAt: null, voidedAt: null }),
    };

    if (filter.selfOnly) {
      where.employeeId = principal.access.employeeId ?? '00000000-0000-0000-0000-000000000000';
    } else if (filter.teamOnly) {
      where.employeeId = {
        in: [...(principal.access.supervisedEmployeeIds ?? []), principal.access.employeeId].filter(
          Boolean,
        ) as string[],
      };
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    const [items, total] = await Promise.all([
      db.trainingRecord.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(pagination, ['completedAt', 'expiresAt', 'courseTitle'], 'completedAt'),
        select: {
          id: true,
          courseTitle: true,
          courseVersionNumber: true,
          trainingType: true,
          deliveryMethod: true,
          instructorName: true,
          trainingDate: true,
          completedAt: true,
          durationMinutes: true,
          creditHours: true,
          score: true,
          passed: true,
          expiresAt: true,
          supersededAt: true,
          voidedAt: true,
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
          certificates: { select: { id: true, certificateNumber: true, publicId: true } },
        },
      }),
      db.trainingRecord.count({ where }),
    ]);

    return paginated(items, total, pagination, { scope: permission });
  });

  /** Records a completion and issues the certificate in one transaction. */
  app.post('/training/records', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();
    const body = parseBody(
      request,
      z.object({
        employeeId: uuidSchema,
        courseId: uuidSchema,
        assignmentId: uuidSchema.optional(),
        requirementId: uuidSchema.optional(),
        sessionId: uuidSchema.optional(),
        completedAt: z.coerce.date().optional(),
        score: z.number().min(0).max(100).optional(),
        durationMinutes: z.number().int().min(0).max(10_000).optional(),
        instructorName: z.string().max(200).optional(),
        practicalAssessmentId: uuidSchema.optional(),
        notes: z.string().max(2000).optional(),
      }),
    );

    const employee = await db.employee.findFirst({
      where: { id: body.employeeId, deletedAt: null },
      select: { id: true, departmentId: true, locationId: true },
    });
    if (!employee) throw ApiError.notFound('Employee');

    request.authorize('training_record:create', {
      organizationId,
      departmentId: employee.departmentId,
      locationId: employee.locationId,
      subjectEmployeeId: employee.id,
    });

    const result = await completeTraining(db, {
      organizationId,
      employeeId: body.employeeId,
      courseId: body.courseId,
      assignmentId: body.assignmentId ?? null,
      requirementId: body.requirementId ?? null,
      sessionId: body.sessionId ?? null,
      completedAt: body.completedAt,
      score: body.score ?? null,
      durationMinutes: body.durationMinutes ?? null,
      instructorName: body.instructorName ?? null,
      practicalAssessmentId: body.practicalAssessmentId ?? null,
      notes: body.notes ?? null,
      actorUserId: principal.userId,
      actorLabel: `${principal.firstName} ${principal.lastName}`,
      requestId: request.requestId,
    });

    // Recompute this employee's compliance so the matrix reflects it at once.
    const requirements = await loadActiveRequirements(db);
    await syncEmployeeRequirements(db, organizationId, body.employeeId, {
      actorUserId: principal.userId,
      timezone: principal.organization?.timezone,
    });
    void requirements;

    return reply.status(201).send(ok(result));
  });

  app.post('/training/records/:id/void', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('training_record:void');
    const { id } = parseParams(request, idParams);
    const body = parseBody(request, z.object({ reason: z.string().trim().min(5).max(1000) }));

    const record = await db.trainingRecord.findFirst({
      where: { id },
      select: { id: true, courseTitle: true, employeeId: true, voidedAt: true },
    });
    if (!record) throw ApiError.notFound('Training record');
    if (record.voidedAt) throw ApiError.conflict('That record is already void.');

    // The row is marked void, never deleted: a compliance audit must still be
    // able to see that it existed and why it was withdrawn.
    const updated = await db.trainingRecord.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: body.reason },
    });

    await db.certificate.updateMany({
      where: { trainingRecordId: id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: body.reason },
    });

    await db.employee.updateMany({
      where: { id: record.employeeId },
      data: { requirementsStaleAt: new Date() },
    });

    await request.audit({
      action: 'TRAINING_RECORD_UPDATED',
      entityType: 'training_record',
      entityId: id,
      summary: `Voided the training record for ${record.courseTitle}`,
      changes: { reason: body.reason },
    });

    return ok(updated);
  });

  // -------------------------------------------------------------------------
  // Sessions and attendance
  // -------------------------------------------------------------------------

  app.get('/training/sessions', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('training_session:read');
    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        status: z.enum(['SCHEDULED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
        upcoming: booleanQuery.optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.upcoming ? { startsAt: { gte: new Date() } } : {}),
    };

    const [items, total] = await Promise.all([
      db.trainingSession.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(pagination, ['startsAt', 'title', 'status'], 'startsAt'),
        select: {
          id: true,
          title: true,
          status: true,
          deliveryMethod: true,
          instructorName: true,
          room: true,
          virtualUrl: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          course: { select: { id: true, title: true } },
          location: { select: { id: true, name: true } },
          _count: { select: { attendance: true } },
        },
      }),
      db.trainingSession.count({ where }),
    ]);

    return paginated(items, total, pagination);
  });

  app.post('/training/sessions/:id/attendance', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('attendance:record');
    const { id } = parseParams(request, idParams);
    const body = parseBody(
      request,
      z.object({
        entries: z
          .array(
            z.object({
              employeeId: uuidSchema,
              status: z.enum(['REGISTERED', 'PRESENT', 'LATE', 'LEFT_EARLY', 'ABSENT', 'EXCUSED']),
              method: z
                .enum(['MANUAL', 'QR_CHECK_IN', 'ONLINE_ACTIVITY', 'IMPORT'])
                .default('MANUAL'),
              minutesAttended: z.number().int().min(0).max(10_000).optional(),
              notes: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
    );

    const session = await db.trainingSession.findFirst({
      where: { id },
      select: { id: true, title: true },
    });
    if (!session) throw ApiError.notFound('Training session');

    let recorded = 0;
    for (const entry of body.entries) {
      await db.attendanceEntry.upsert({
        where: { sessionId_employeeId: { sessionId: id, employeeId: entry.employeeId } },
        create: {
          organizationId,
          sessionId: id,
          employeeId: entry.employeeId,
          status: entry.status,
          method: entry.method,
          minutesAttended: entry.minutesAttended ?? null,
          notes: entry.notes ?? null,
          recordedById: request.principal?.userId ?? null,
          checkInAt: entry.status === 'PRESENT' || entry.status === 'LATE' ? new Date() : null,
        },
        update: {
          status: entry.status,
          method: entry.method,
          minutesAttended: entry.minutesAttended ?? null,
          notes: entry.notes ?? null,
          recordedById: request.principal?.userId ?? null,
        },
      });
      recorded += 1;
    }

    await request.audit({
      action: 'ATTENDANCE_RECORDED',
      entityType: 'training_session',
      entityId: id,
      summary: `Recorded attendance for ${recorded} employee(s) at ${session.title}`,
    });

    return ok({ recorded });
  });
};
