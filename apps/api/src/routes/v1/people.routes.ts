import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emailSchema, normaliseEmail } from '@olbos/auth';
import { resolveVisibility, ROLE_TEMPLATES, VISIBILITY_LADDERS } from '@olbos/permissions';
import { assertWithinLimit } from '@olbos/billing';
import { assessRisk } from '@olbos/core';
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
import { syncEmployeeRequirements } from '../../services/training.service.js';
import { diffSnapshots } from '../../services/audit.service.js';

/**
 * People: employees, students, and the organization structure they sit in.
 */

const employeeFields = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: emailSchema.optional(),
  employeeNumber: z.string().trim().max(50).optional(),
  departmentId: uuidSchema.nullable().optional(),
  locationId: uuidSchema.nullable().optional(),
  jobRoleId: uuidSchema.nullable().optional(),
  supervisorId: uuidSchema.nullable().optional(),
  employmentType: z.enum([
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
    'TEMPORARY',
    'SEASONAL',
    'INTERN',
    'VOLUNTEER',
  ]),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']),
  shift: z.string().max(64).nullable().optional(),
  hireDate: z.coerce.date().nullable().optional(),
  equipmentAuthorizations: z.array(z.string().max(64)).max(50).optional(),
  hazardExposures: z.array(z.string().max(64)).max(50).optional(),
  isStudent: z.boolean().optional(),
  studentNumber: z.string().max(50).nullable().optional(),
  programOfStudy: z.string().max(200).nullable().optional(),
});

const employeeBody = employeeFields.extend({
  employmentType: employeeFields.shape.employmentType.default('FULL_TIME'),
  status: employeeFields.shape.status.default('ACTIVE'),
});

/** Attributes that change which training an employee owes. */
const REQUIREMENT_DRIVING_FIELDS = [
  'departmentId',
  'locationId',
  'jobRoleId',
  'employmentType',
  'shift',
  'status',
  'equipmentAuthorizations',
  'hazardExposures',
] as const;

export const peopleRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  app.get('/departments', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('department:read');
    return ok(
      await db.department.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          parentId: true,
          _count: { select: { employees: true } },
        },
      }),
    );
  });

  app.post('/departments', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('department:manage');
    const body = parseBody(
      request,
      z.object({
        name: z.string().trim().min(1).max(120),
        code: z.string().trim().max(32).optional(),
        parentId: uuidSchema.optional(),
      }),
    );

    const department = await db.department.create({ data: { organizationId, ...body } });
    await request.audit({
      action: 'SETTINGS_UPDATED',
      entityType: 'department',
      entityId: department.id,
      summary: `Created department "${body.name}"`,
    });
    return reply.status(201).send(ok(department));
  });

  app.get('/locations', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('location:read');
    return ok(
      await db.location.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          city: true,
          region: true,
          country: true,
          timezone: true,
          _count: { select: { employees: true } },
        },
      }),
    );
  });

  app.post('/locations', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('location:manage');
    const body = parseBody(
      request,
      z.object({
        name: z.string().trim().min(1).max(120),
        code: z.string().trim().max(32).optional(),
        city: z.string().max(120).optional(),
        region: z.string().max(120).optional(),
        country: z.string().max(2).optional(),
        timezone: z.string().max(64).optional(),
      }),
    );

    const location = await db.location.create({ data: { organizationId, ...body } });
    await request.audit({
      action: 'SETTINGS_UPDATED',
      entityType: 'location',
      entityId: location.id,
      summary: `Created location "${body.name}"`,
    });
    return reply.status(201).send(ok(location));
  });

  app.get('/job-roles', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('job_role:read');
    return ok(
      await db.jobRole.findMany({
        where: { deletedAt: null },
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          code: true,
          description: true,
          hazardExposures: true,
          _count: { select: { employees: true, requirements: true } },
        },
      }),
    );
  });

  app.post('/job-roles', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('job_role:manage');
    const body = parseBody(
      request,
      z.object({
        title: z.string().trim().min(1).max(150),
        code: z.string().trim().max(32).optional(),
        description: z.string().max(1000).optional(),
        hazardExposures: z.array(z.string().max(64)).max(50).default([]),
      }),
    );

    const jobRole = await db.jobRole.create({ data: { organizationId, ...body } });
    await request.audit({
      action: 'SETTINGS_UPDATED',
      entityType: 'job_role',
      entityId: jobRole.id,
      summary: `Created job role "${body.title}"`,
    });
    return reply.status(201).send(ok(jobRole));
  });

  // -------------------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------------------

  app.get('/employees', async (request) => {
    const { principal, db } = request.requireTenant();
    const { permission, filter } = resolveVisibility(
      principal.access,
      VISIBILITY_LADDERS.employees,
    );
    if (!permission) throw ApiError.forbidden('You cannot view employees.');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        search: z.string().max(120).optional(),
        departmentId: uuidSchema.optional(),
        locationId: uuidSchema.optional(),
        jobRoleId: uuidSchema.optional(),
        status: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']).optional(),
        isStudent: booleanQuery.optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.jobRoleId ? { jobRoleId: query.jobRoleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isStudent !== undefined ? { isStudent: query.isStudent } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { employeeNumber: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (filter.selfOnly) {
      where.id = principal.access.employeeId ?? '00000000-0000-0000-0000-000000000000';
    } else if (filter.teamOnly) {
      where.id = {
        in: [...(principal.access.supervisedEmployeeIds ?? []), principal.access.employeeId].filter(
          Boolean,
        ) as string[],
      };
    } else if (!filter.unrestricted && filter.departmentIds.length > 0) {
      where.departmentId = { in: filter.departmentIds };
    }

    const [items, total] = await Promise.all([
      db.employee.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(
          pagination,
          ['lastName', 'firstName', 'employeeNumber', 'hireDate'],
          'lastName',
        ),
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeNumber: true,
          status: true,
          employmentType: true,
          shift: true,
          hireDate: true,
          isStudent: true,
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          jobRole: { select: { id: true, title: true } },
          supervisor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      db.employee.count({ where }),
    ]);

    return paginated(items, total, pagination, { scope: permission });
  });

  /** One employee's full training profile — the page a supervisor opens. */
  app.get('/employees/:id', async (request) => {
    const { db } = request.requireTenant();
    const { id } = parseParams(request, idParams);

    const employee = await db.employee.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeNumber: true,
        status: true,
        employmentType: true,
        shift: true,
        hireDate: true,
        terminationDate: true,
        equipmentAuthorizations: true,
        hazardExposures: true,
        isStudent: true,
        studentNumber: true,
        programOfStudy: true,
        departmentId: true,
        locationId: true,
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        jobRole: { select: { id: true, title: true, hazardExposures: true } },
        supervisor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!employee) throw ApiError.notFound('Employee');

    request.authorize('employee:read_own', {
      departmentId: employee.departmentId,
      locationId: employee.locationId,
      subjectEmployeeId: employee.id,
    });

    const [states, records, certificates, assignments] = await Promise.all([
      db.complianceState.findMany({
        where: { employeeId: id },
        orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
        select: {
          status: true,
          dueAt: true,
          completedAt: true,
          expiresAt: true,
          daysUntilExpiry: true,
          requirement: {
            select: { id: true, name: true, course: { select: { id: true, title: true } } },
          },
        },
      }),
      db.trainingRecord.findMany({
        where: { employeeId: id, voidedAt: null },
        orderBy: { completedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          courseTitle: true,
          courseVersionNumber: true,
          trainingType: true,
          deliveryMethod: true,
          instructorName: true,
          completedAt: true,
          expiresAt: true,
          score: true,
          passed: true,
          supersededAt: true,
          durationMinutes: true,
        },
      }),
      db.certificate.findMany({
        where: { employeeId: id },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          certificateNumber: true,
          publicId: true,
          courseTitle: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
        },
      }),
      db.trainingAssignment.findMany({
        where: { employeeId: id, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'] } },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          status: true,
          dueAt: true,
          course: { select: { id: true, title: true } },
        },
      }),
    ]);

    const now = new Date();
    const risk = assessRisk({
      expiredTrainingCount: states.filter((s) => s.status === 'EXPIRED').length,
      missingRequiredTrainingCount: states.filter((s) => s.status === 'MISSING').length,
      overdueTrainingCount: assignments.filter((a) => a.dueAt && a.dueAt < now).length,
      expiringWithin30DaysCount: states.filter(
        (s) => s.daysUntilExpiry !== null && s.daysUntilExpiry >= 0 && s.daysUntilExpiry <= 30,
      ).length,
      incompleteCourseCount: assignments.filter((a) => a.status === 'IN_PROGRESS').length,
    });

    return ok({ employee, compliance: states, records, certificates, assignments, risk });
  });

  app.post('/employees', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.authorize('employee:create');
    const body = parseBody(request, employeeBody);

    const currentCount = await db.employee.count({ where: { deletedAt: null } });
    assertWithinLimit(principal.entitlements, 'MAX_USERS', currentCount);

    const employee = await db.employee.create({
      data: {
        organizationId,
        ...body,
        email: body.email ? normaliseEmail(body.email) : null,
        equipmentAuthorizations: body.equipmentAuthorizations ?? [],
        hazardExposures: body.hazardExposures ?? [],
      },
    });

    // A new employee inherits every requirement their attributes imply, at once.
    const sync = await syncEmployeeRequirements(db, organizationId, employee.id, {
      actorUserId: principal.userId,
      timezone: principal.organization?.timezone,
    });

    await request.audit({
      action: 'USER_CREATED',
      entityType: 'employee',
      entityId: employee.id,
      summary: `Created employee ${body.firstName} ${body.lastName}`,
      changes: { jobRoleId: body.jobRoleId, departmentId: body.departmentId },
    });

    return reply.status(201).send(ok(employee, { trainingAssigned: sync.assignmentsCreated }));
  });

  app.patch('/employees/:id', async (request) => {
    const { organizationId, principal, db } = request.requireTenant();
    const { id } = parseParams(request, idParams);
    const body = parseBody(request, employeeFields.partial());

    const before = await db.employee.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw ApiError.notFound('Employee');

    request.authorize('employee:update', {
      departmentId: before.departmentId,
      locationId: before.locationId,
      subjectEmployeeId: before.id,
    });

    const employee = await db.employee.update({
      where: { id },
      data: {
        ...body,
        ...(body.email !== undefined
          ? { email: body.email ? normaliseEmail(body.email) : null }
          : {}),
      },
    });

    const changes = diffSnapshots(
      before as unknown as Record<string, unknown>,
      employee as unknown as Record<string, unknown>,
    );

    // A change to any requirement-driving attribute re-evaluates obligations
    // immediately — that is the "employee changes job" flow from §13.
    const requirementsChanged = REQUIREMENT_DRIVING_FIELDS.some((field) => field in changes);
    let sync = null;
    if (requirementsChanged) {
      sync = await syncEmployeeRequirements(db, organizationId, id, {
        actorUserId: principal.userId,
        timezone: principal.organization?.timezone,
      });
    }

    await request.audit({
      action: 'USER_UPDATED',
      entityType: 'employee',
      entityId: id,
      summary: `Updated ${employee.firstName} ${employee.lastName}`,
      changes,
    });

    return ok(employee, {
      requirementsRecalculated: requirementsChanged,
      trainingAssigned: sync?.assignmentsCreated ?? 0,
      trainingWithdrawn: sync?.requirementsRemoved ?? 0,
    });
  });

  // -------------------------------------------------------------------------
  // Users and roles
  // -------------------------------------------------------------------------

  app.get('/users', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('user:read');
    const pagination = parseQuery(request, paginationSchema);
    const { skip, take } = toSkipTake(pagination);

    const [items, total] = await Promise.all([
      db.user.findMany({
        where: { deletedAt: null },
        skip,
        take,
        orderBy: toOrderBy(pagination, ['lastName', 'email', 'createdAt'], 'lastName'),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          lastLoginAt: true,
          mfaEnabled: true,
          createdAt: true,
          roles: { select: { scopeType: true, role: { select: { key: true, name: true } } } },
        },
      }),
      db.user.count({ where: { deletedAt: null } }),
    ]);

    return paginated(items, total, pagination);
  });

  app.get('/roles', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('role:read');
    return ok(
      await db.role.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          isSystem: true,
          permissions: true,
          _count: { select: { assignments: true } },
        },
      }),
    );
  });

  app.post('/users/:id/roles', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('user:manage_roles');
    const { id } = parseParams(request, idParams);
    const body = parseBody(
      request,
      z.object({
        roleId: uuidSchema,
        scopeType: z
          .enum(['ORGANIZATION', 'DEPARTMENT', 'LOCATION', 'COURSE'])
          .default('ORGANIZATION'),
        scopeId: uuidSchema.optional(),
        expiresAt: z.coerce.date().optional(),
      }),
    );

    const [user, role] = await Promise.all([
      db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, email: true } }),
      db.role.findFirst({
        where: { id: body.roleId },
        select: { id: true, key: true, name: true },
      }),
    ]);
    if (!user) throw ApiError.notFound('User');
    if (!role) throw ApiError.notFound('Role');

    if (body.scopeType !== 'ORGANIZATION' && !body.scopeId) {
      throw ApiError.badRequest('A scoped role assignment needs a scopeId.');
    }

    const assignment = await db.userRole.create({
      data: {
        organizationId,
        userId: id,
        roleId: body.roleId,
        scopeType: body.scopeType,
        scopeId: body.scopeId ?? null,
        grantedById: request.principal?.userId ?? null,
        expiresAt: body.expiresAt ?? null,
      },
    });

    await request.audit({
      action: 'ROLE_CHANGED',
      entityType: 'user',
      entityId: id,
      summary: `Granted ${role.name} to ${user.email}`,
      changes: { roleKey: role.key, scopeType: body.scopeType, scopeId: body.scopeId ?? null },
    });

    return ok(assignment);
  });

  app.get('/roles/catalogue', async (request) => {
    request.requireAuth();
    request.authorize('role:read');
    return ok(
      Object.values(ROLE_TEMPLATES).map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        permissionCount: template.permissions.length,
      })),
    );
  });
};
