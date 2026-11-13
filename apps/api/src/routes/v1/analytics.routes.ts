import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { summarise, type ComplianceStatus } from '@olbos/core';
import { ok, parseQuery, toCsv, csvSafe } from '../../lib/http.js';
import { ApiError } from '../../errors.js';

/**
 * Analytics and reporting (§44, §46).
 *
 * Every figure here is derived from the same `compliance_states` and
 * `training_records` the dashboards read, so a report and the screen it was run
 * from can never disagree.
 */
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/analytics/training', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('analytics:training');

    const query = parseQuery(
      request,
      z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }),
    );

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - query.months);

    const [completionsByMonth, byCourse, byDelivery, totals] = await Promise.all([
      db.$queryRaw<{ month: string; completions: bigint; hours: number | null }[]>`
        SELECT to_char(date_trunc('month', "completedAt"), 'YYYY-MM') AS month,
               count(*)::bigint AS completions,
               sum("creditHours")::float AS hours
          FROM training_records
         WHERE "organizationId" = ${request.principal?.organizationId}::uuid
           AND "completedAt" >= ${since}
           AND "voidedAt" IS NULL
         GROUP BY 1
         ORDER BY 1
      `,
      db.trainingRecord.groupBy({
        by: ['courseId', 'courseTitle'],
        where: { completedAt: { gte: since }, voidedAt: null },
        _count: { _all: true },
        _avg: { score: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: 20,
      }),
      db.trainingRecord.groupBy({
        by: ['deliveryMethod'],
        where: { completedAt: { gte: since }, voidedAt: null },
        _count: { _all: true },
      }),
      db.trainingRecord.aggregate({
        where: { completedAt: { gte: since }, voidedAt: null },
        _count: { _all: true },
        _sum: { creditHours: true, durationMinutes: true },
        _avg: { score: true },
      }),
    ]);

    return ok({
      periodMonths: query.months,
      totals: {
        completions: totals._count._all,
        creditHours: Number(totals._sum.creditHours ?? 0),
        trainingMinutes: totals._sum.durationMinutes ?? 0,
        averageScore: totals._avg.score ? Number(totals._avg.score) : null,
      },
      completionsByMonth: completionsByMonth.map((row) => ({
        month: row.month,
        completions: Number(row.completions),
        creditHours: row.hours ?? 0,
      })),
      byCourse: byCourse.map((row) => ({
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        completions: row._count._all,
        averageScore: row._avg.score ? Number(row._avg.score) : null,
      })),
      byDeliveryMethod: byDelivery.map((row) => ({
        deliveryMethod: row.deliveryMethod,
        completions: row._count._all,
      })),
    });
  });

  app.get('/analytics/safety', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('SAFETY_MODULE');
    request.authorize('analytics:safety');

    const [states, incidents, observations, practicals] = await Promise.all([
      db.complianceState.findMany({ select: { status: true } }),
      db.incident.groupBy({ by: ['severity'], _count: { _all: true } }),
      db.safetyObservation.groupBy({ by: ['type'], _count: { _all: true } }),
      db.practicalAssessment.aggregate({ _count: { _all: true }, _avg: { scorePercent: true } }),
    ]);

    return ok({
      compliance: summarise(states.map((state) => state.status as ComplianceStatus)),
      incidentsBySeverity: incidents.map((row) => ({
        severity: row.severity,
        count: row._count._all,
      })),
      observationsByType: observations.map((row) => ({ type: row.type, count: row._count._all })),
      practicalAssessments: {
        total: practicals._count._all,
        averageScore: practicals._avg.scorePercent ? Number(practicals._avg.scorePercent) : null,
      },
    });
  });

  app.get('/analytics/learning', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('analytics:learning');

    const [enrollments, attempts, grades] = await Promise.all([
      db.enrollment.groupBy({ by: ['status'], _count: { _all: true } }),
      db.quizAttempt.aggregate({
        where: { status: 'GRADED' },
        _count: { _all: true },
        _avg: { scorePercent: true },
      }),
      db.grade.aggregate({ _count: { _all: true }, _avg: { percent: true } }),
    ]);

    return ok({
      enrollmentsByStatus: enrollments.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      assessments: {
        gradedAttempts: attempts._count._all,
        averageScore: attempts._avg.scorePercent ? Number(attempts._avg.scorePercent) : null,
      },
      grades: {
        recorded: grades._count._all,
        averagePercent: grades._avg.percent ? Number(grades._avg.percent) : null,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Reports (§46)
  // -------------------------------------------------------------------------

  const REPORTS = {
    training_completion: 'Training Completion Report',
    training_compliance: 'Training Compliance Report',
    employee_training_record: 'Employee Training Record',
    certificate: 'Certificate Report',
    expiration: 'Expiration Report',
    overdue_training: 'Overdue Training Report',
  } as const;

  type ReportKey = keyof typeof REPORTS;

  app.get('/reports', async (request) => {
    request.requireAuth();
    request.authorize('report:run');
    return ok(
      Object.entries(REPORTS).map(([key, name]) => ({
        key,
        name,
        formats: ['json', 'csv'],
      })),
    );
  });

  app.get('/reports/:key', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('report:run');

    const { key } = request.params as { key: string };
    if (!(key in REPORTS)) throw ApiError.notFound('Report');
    const reportKey = key as ReportKey;

    const query = parseQuery(
      request,
      z.object({
        format: z.enum(['json', 'csv']).default('json'),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    );

    if (query.format === 'csv') request.authorize('report:export');

    let header: string[] = [];
    let rows: unknown[][] = [];

    switch (reportKey) {
      case 'training_completion':
      case 'employee_training_record': {
        const records = await db.trainingRecord.findMany({
          where: {
            voidedAt: null,
            ...(query.from || query.to
              ? {
                  completedAt: {
                    ...(query.from ? { gte: query.from } : {}),
                    ...(query.to ? { lte: query.to } : {}),
                  },
                }
              : {}),
          },
          orderBy: { completedAt: 'desc' },
          take: 10_000,
          select: {
            completedAt: true,
            expiresAt: true,
            courseTitle: true,
            courseVersionNumber: true,
            trainingType: true,
            deliveryMethod: true,
            instructorName: true,
            durationMinutes: true,
            score: true,
            passed: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
                employeeNumber: true,
                department: { select: { name: true } },
                jobRole: { select: { title: true } },
              },
            },
          },
        });
        header = [
          'Employee',
          'Employee #',
          'Department',
          'Job role',
          'Course',
          'Version',
          'Training type',
          'Delivery',
          'Instructor',
          'Completed',
          'Expires',
          'Minutes',
          'Score',
          'Passed',
        ];
        rows = records.map((record) => [
          csvSafe(`${record.employee.lastName}, ${record.employee.firstName}`),
          csvSafe(record.employee.employeeNumber),
          csvSafe(record.employee.department?.name),
          csvSafe(record.employee.jobRole?.title),
          csvSafe(record.courseTitle),
          record.courseVersionNumber,
          record.trainingType,
          record.deliveryMethod,
          csvSafe(record.instructorName),
          record.completedAt,
          record.expiresAt,
          record.durationMinutes,
          record.score ? Number(record.score) : '',
          record.passed ? 'Yes' : 'No',
        ]);
        break;
      }

      case 'training_compliance':
      case 'overdue_training':
      case 'expiration': {
        const statuses =
          reportKey === 'overdue_training'
            ? (['MISSING', 'EXPIRED'] as const)
            : reportKey === 'expiration'
              ? (['EXPIRING_SOON', 'EXPIRED'] as const)
              : undefined;

        const states = await db.complianceState.findMany({
          where: statuses ? { status: { in: [...statuses] } } : {},
          orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
          take: 10_000,
          select: {
            status: true,
            dueAt: true,
            completedAt: true,
            expiresAt: true,
            daysUntilExpiry: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
                employeeNumber: true,
                department: { select: { name: true } },
                location: { select: { name: true } },
                supervisor: { select: { firstName: true, lastName: true } },
              },
            },
            requirement: { select: { name: true, course: { select: { title: true } } } },
          },
        });
        header = [
          'Employee',
          'Employee #',
          'Department',
          'Location',
          'Supervisor',
          'Requirement',
          'Course',
          'Status',
          'Due',
          'Completed',
          'Expires',
          'Days until expiry',
        ];
        rows = states.map((state) => [
          csvSafe(`${state.employee.lastName}, ${state.employee.firstName}`),
          csvSafe(state.employee.employeeNumber),
          csvSafe(state.employee.department?.name),
          csvSafe(state.employee.location?.name),
          state.employee.supervisor
            ? csvSafe(
                `${state.employee.supervisor.lastName}, ${state.employee.supervisor.firstName}`,
              )
            : '',
          csvSafe(state.requirement.name),
          csvSafe(state.requirement.course.title),
          state.status,
          state.dueAt,
          state.completedAt,
          state.expiresAt,
          state.daysUntilExpiry,
        ]);
        break;
      }

      case 'certificate': {
        const certificates = await db.certificate.findMany({
          orderBy: { issuedAt: 'desc' },
          take: 10_000,
          select: {
            certificateNumber: true,
            learnerName: true,
            courseTitle: true,
            trainingType: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
            instructorName: true,
            verificationCount: true,
          },
        });
        header = [
          'Certificate #',
          'Learner',
          'Course',
          'Training type',
          'Status',
          'Issued',
          'Expires',
          'Instructor',
          'Verifications',
        ];
        rows = certificates.map((certificate) => [
          csvSafe(certificate.certificateNumber),
          csvSafe(certificate.learnerName),
          csvSafe(certificate.courseTitle),
          certificate.trainingType,
          certificate.status,
          certificate.issuedAt,
          certificate.expiresAt,
          csvSafe(certificate.instructorName),
          certificate.verificationCount,
        ]);
        break;
      }
    }

    await db.reportRun.create({
      data: {
        organizationId,
        reportKey,
        format: query.format,
        status: 'COMPLETED',
        parameters: {
          from: query.from?.toISOString() ?? null,
          to: query.to?.toISOString() ?? null,
        },
        requestedById: request.principal?.userId ?? null,
        rowCount: rows.length,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    if (query.format === 'csv') {
      await request.audit({
        action: 'EXPORT_CREATED',
        entityType: 'report',
        summary: `Exported ${REPORTS[reportKey]} (${rows.length} rows)`,
        changes: { reportKey, rowCount: rows.length },
      });

      const filename = `${reportKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(toCsv([header, ...rows]));
    }

    return ok(
      rows.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index]]))),
      { report: REPORTS[reportKey], rowCount: rows.length },
    );
  });

  app.get('/audit', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('audit:read');

    const query = parseQuery(
      request,
      z.object({
        entityType: z.string().max(64).optional(),
        entityId: z.string().max(64).optional(),
        action: z.string().max(64).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      }),
    );

    const entries = await db.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.action ? { action: query.action as never } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        changes: true,
        actorLabel: true,
        occurredAt: true,
        requestId: true,
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return ok(entries);
  });
};
