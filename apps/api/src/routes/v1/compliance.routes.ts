import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  buildTrainingMatrix,
  employeesAtRisk,
  filterMatrix,
  matrixToCsv,
  rollup,
  summarise,
  type ComplianceResult,
  type ComplianceStatus,
  type MatrixCourse,
  type MatrixEmployee,
  type TrainingMatrix,
} from '@olbos/core';
import { resolveVisibility, VISIBILITY_LADDERS } from '@olbos/permissions';
import { ApiError } from '../../errors.js';
import { ok, parseQuery } from '../../lib/http.js';

/**
 * Compliance dashboard and training matrix (§12, §20).
 *
 * Both read `compliance_states`, which the sweep keeps current, so a matrix for
 * a few thousand employees is one indexed query rather than a recomputation.
 *
 * Visibility is resolved from the caller's widest applicable permission: an EHS
 * administrator sees the organization, a supervisor sees their team, and a
 * learner sees only themselves.
 */

const statusEnum = z.enum([
  'CURRENT',
  'EXPIRING_SOON',
  'EXPIRED',
  'MISSING',
  'IN_PROGRESS',
  'PENDING',
  'NOT_APPLICABLE',
]);

const matrixQuery = z.object({
  departmentIds: z.union([z.string(), z.array(z.string())]).optional(),
  locationIds: z.union([z.string(), z.array(z.string())]).optional(),
  jobRoleIds: z.union([z.string(), z.array(z.string())]).optional(),
  supervisorIds: z.union([z.string(), z.array(z.string())]).optional(),
  courseIds: z.union([z.string(), z.array(z.string())]).optional(),
  statuses: z.union([statusEnum, z.array(statusEnum)]).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  search: z.string().max(120).optional(),
});

const asArray = <T>(value: T | T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

interface LoadedMatrix {
  readonly matrix: TrainingMatrix;
  readonly scope: string;
  readonly organizationName: string;
}

export const complianceRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Loads the matrix the caller is entitled to see, then applies their filters.
   * Visibility is applied first and cannot be widened by a query parameter: a
   * supervisor asking for another department gets their own team back, not an
   * error and not the other department.
   */
  const loadMatrix = async (request: FastifyRequest): Promise<LoadedMatrix> => {
    const { principal, db } = request.requireTenant();

    const { permission, filter } = resolveVisibility(
      principal.access,
      VISIBILITY_LADDERS.compliance,
    );
    if (!permission) throw ApiError.forbidden('You cannot view compliance data.');

    const query = parseQuery(request, matrixQuery);

    const employeeWhere: Record<string, unknown> = { deletedAt: null };
    if (filter.selfOnly) {
      employeeWhere.id = principal.access.employeeId ?? '00000000-0000-0000-0000-000000000000';
    } else if (filter.teamOnly) {
      const team = principal.access.supervisedEmployeeIds ?? [];
      employeeWhere.id = {
        in: [...team, principal.access.employeeId].filter(Boolean) as string[],
      };
    } else if (!filter.unrestricted) {
      if (filter.departmentIds.length > 0)
        employeeWhere.departmentId = { in: filter.departmentIds };
      if (filter.locationIds.length > 0) employeeWhere.locationId = { in: filter.locationIds };
    }

    const [employees, states, courses] = await Promise.all([
      db.employee.findMany({
        where: employeeWhere,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          departmentId: true,
          locationId: true,
          jobRoleId: true,
          supervisorId: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
          jobRole: { select: { title: true } },
        },
      }),
      db.complianceState.findMany({
        where: { employee: employeeWhere },
        select: {
          requirementId: true,
          courseId: true,
          employeeId: true,
          status: true,
          dueAt: true,
          completedAt: true,
          expiresAt: true,
          daysUntilExpiry: true,
          latestRecordId: true,
          assignmentId: true,
        },
      }),
      db.course.findMany({
        where: { deletedAt: null, requirements: { some: { isActive: true } } },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, code: true, type: true },
      }),
    ]);

    const matrixEmployees: MatrixEmployee[] = employees.map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeNumber: employee.employeeNumber,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name ?? null,
      locationId: employee.locationId,
      locationName: employee.location?.name ?? null,
      jobRoleId: employee.jobRoleId,
      jobRoleTitle: employee.jobRole?.title ?? null,
      supervisorId: employee.supervisorId,
    }));

    const matrixCourses: MatrixCourse[] = courses.map((course) => ({
      id: course.id,
      title: course.title,
      code: course.code,
      type: course.type,
    }));

    const results: ComplianceResult[] = states.map((state) => ({
      requirementId: state.requirementId,
      courseId: state.courseId,
      employeeId: state.employeeId,
      status: state.status as ComplianceStatus,
      dueAt: state.dueAt,
      completedAt: state.completedAt,
      expiresAt: state.expiresAt,
      daysUntilExpiry: state.daysUntilExpiry,
      daysOverdue: null,
      isOverdue: state.status === 'EXPIRED',
      latestRecordId: state.latestRecordId,
      assignmentId: state.assignmentId,
      explanation: '',
    }));

    const matrix = buildTrainingMatrix({
      employees: matrixEmployees,
      courses: matrixCourses,
      states: results,
    });

    return {
      matrix: filterMatrix(matrix, {
        departmentIds: asArray(query.departmentIds),
        locationIds: asArray(query.locationIds),
        jobRoleIds: asArray(query.jobRoleIds),
        supervisorIds: asArray(query.supervisorIds),
        courseIds: asArray(query.courseIds),
        statuses: asArray(query.statuses),
        expiringWithinDays: query.expiringWithinDays,
        search: query.search,
      }),
      scope: permission,
      organizationName: principal.organization?.name ?? '',
    };
  };

  app.get('/compliance/dashboard', async (request) => {
    const { matrix, scope } = await loadMatrix(request);

    return ok({
      scope,
      summary: matrix.summary,
      byDepartment: rollup(matrix, 'department'),
      byLocation: rollup(matrix, 'location'),
      byJobRole: rollup(matrix, 'jobRole'),
      byCourse: rollup(matrix, 'course'),
      employeesAtRisk: employeesAtRisk(matrix)
        .slice(0, 25)
        .map((row) => ({
          employeeId: row.employee.id,
          name: `${row.employee.lastName}, ${row.employee.firstName}`,
          department: row.employee.departmentName,
          expired: row.summary.expired,
          missing: row.summary.missing,
          compliancePercent: row.summary.compliancePercent,
        })),
      generatedAt: matrix.generatedAt.toISOString(),
    });
  });

  app.get('/compliance/matrix', async (request) => {
    const { matrix, scope } = await loadMatrix(request);

    return ok(
      {
        courses: matrix.courses,
        rows: matrix.rows.map((row) => ({
          employee: row.employee,
          rowStatus: row.rowStatus,
          summary: row.summary,
          cells: row.cells,
        })),
      },
      {
        scope,
        summary: matrix.summary,
        generatedAt: matrix.generatedAt.toISOString(),
      },
    );
  });

  app.get('/compliance/matrix.csv', async (request, reply) => {
    request.authorize('report:export');
    const { matrix, organizationName } = await loadMatrix(request);

    await request.audit({
      action: 'EXPORT_CREATED',
      entityType: 'training_matrix',
      summary: `Exported the training matrix (${matrix.rows.length} employees)`,
    });

    const filename = `training-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(`${organizationName}\r\n${matrixToCsv(matrix)}`);
  });

  /** The three worklists the safety team lives in. */
  for (const [path, statuses] of [
    ['expiring', ['EXPIRING_SOON']],
    ['expired', ['EXPIRED']],
    ['missing', ['MISSING']],
  ] as const) {
    app.get(`/compliance/${path}`, async (request) => {
      const { principal, db } = request.requireTenant();
      const { permission, filter } = resolveVisibility(
        principal.access,
        VISIBILITY_LADDERS.compliance,
      );
      if (!permission) throw ApiError.forbidden('You cannot view compliance data.');

      const employeeWhere: Record<string, unknown> = { deletedAt: null };
      if (filter.teamOnly) {
        employeeWhere.id = {
          in: [
            ...(principal.access.supervisedEmployeeIds ?? []),
            principal.access.employeeId,
          ].filter(Boolean) as string[],
        };
      }

      const rows = await db.complianceState.findMany({
        where: { status: { in: [...statuses] }, employee: employeeWhere },
        orderBy: [{ expiresAt: 'asc' }, { dueAt: 'asc' }],
        take: 500,
        select: {
          status: true,
          dueAt: true,
          expiresAt: true,
          daysUntilExpiry: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              department: { select: { name: true } },
              location: { select: { name: true } },
              supervisor: { select: { firstName: true, lastName: true } },
            },
          },
          requirement: {
            select: { id: true, name: true, course: { select: { id: true, title: true } } },
          },
        },
      });

      return ok(rows, {
        scope: permission,
        count: rows.length,
        summary: summarise(rows.map((row) => row.status as ComplianceStatus)),
      });
    });
  }
};
