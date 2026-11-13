import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildNavigation, effectivePermissions } from '@olbos/permissions';
import {
  booleanQuery,
  ok,
  paginated,
  paginationSchema,
  parseQuery,
  toSkipTake,
} from '../../lib/http.js';

/**
 * "Me" endpoints: everything the signed-in user needs about themselves.
 *
 * `/me/navigation` is the same tree the web sidebar renders, built from the
 * same permission and entitlement checks the API enforces — so the menu can
 * never offer something the API would refuse.
 */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (request) => {
    const principal = request.requireAuth();

    const employee = principal.access.employeeId
      ? await request.db.employee.findFirst({
          where: { id: principal.access.employeeId },
          select: {
            id: true,
            employeeNumber: true,
            jobRole: { select: { id: true, title: true } },
            department: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            supervisor: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : null;

    return ok({
      user: {
        id: principal.userId,
        email: principal.email,
        firstName: principal.firstName,
        lastName: principal.lastName,
        platformRole: principal.platformRole,
      },
      organization: principal.organization,
      employee,
      roles: principal.access.roles.map((role) => ({
        key: role.key,
        scopeType: role.scopeType,
        scopeId: role.scopeId ?? null,
      })),
      permissions: effectivePermissions(principal.access),
      entitlements: principal.entitlements.enabledKeys(),
      supervises: principal.access.supervisedEmployeeIds?.length ?? 0,
    });
  });

  app.get('/me/navigation', async (request) => {
    const principal = request.requireAuth();
    const includePlanned = parseQuery(
      request,
      z.object({ includePlanned: booleanQuery.default(true) }),
    ).includePlanned;

    return ok(
      buildNavigation(principal.access, {
        entitlements: principal.entitlements.enabledKeys(),
        includePlanned,
      }),
    );
  });

  /** The learner's own view: what they have been assigned and what is due. */
  app.get('/me/learning', async (request) => {
    const { principal, db } = request.requireTenant();
    const employeeId = principal.access.employeeId;

    if (!employeeId) {
      return ok({ assignments: [], enrollments: [], summary: null });
    }

    const [assignments, enrollments, states] = await Promise.all([
      db.trainingAssignment.findMany({
        where: { employeeId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'] } },
        orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          dueAt: true,
          assignedAt: true,
          startedAt: true,
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              summary: true,
              publishedVersion: {
                select: { estimatedMinutes: true, deliveryMethod: true, trainingType: true },
              },
            },
          },
          requirement: { select: { id: true, name: true, basis: true } },
        },
      }),
      db.enrollment.findMany({
        where: { userId: principal.userId, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
        orderBy: { lastAccessedAt: 'desc' },
        select: {
          id: true,
          status: true,
          progressPercent: true,
          lastAccessedAt: true,
          course: { select: { id: true, title: true, slug: true, type: true } },
        },
      }),
      db.complianceState.findMany({
        where: { employeeId },
        select: { status: true, expiresAt: true, daysUntilExpiry: true },
      }),
    ]);

    const summary = {
      assigned: assignments.length,
      overdue: assignments.filter((a) => a.dueAt && a.dueAt < new Date()).length,
      expiringSoon: states.filter((s) => s.status === 'EXPIRING_SOON').length,
      expired: states.filter((s) => s.status === 'EXPIRED').length,
      current: states.filter((s) => s.status === 'CURRENT').length,
    };

    return ok({ assignments, enrollments, summary });
  });

  app.get('/me/certificates', async (request) => {
    const { principal, db } = request.requireTenant();
    const employeeId = principal.access.employeeId;
    if (!employeeId) return ok([]);

    request.authorize('certificate:read_own', { subjectEmployeeId: employeeId });

    const certificates = await db.certificate.findMany({
      where: { employeeId },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        certificateNumber: true,
        publicId: true,
        courseTitle: true,
        trainingType: true,
        status: true,
        completedAt: true,
        issuedAt: true,
        expiresAt: true,
        creditHours: true,
        instructorName: true,
        disclaimer: true,
      },
    });

    return ok(certificates);
  });

  app.get('/me/notifications', async (request) => {
    const { principal, db } = request.requireTenant();
    const pagination = parseQuery(request, paginationSchema);
    const { skip, take } = toSkipTake(pagination);

    const [items, total, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: principal.userId, channel: 'IN_APP' },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          category: true,
          subject: true,
          body: true,
          actionUrl: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { userId: principal.userId, channel: 'IN_APP' } }),
      db.notification.count({
        where: { userId: principal.userId, channel: 'IN_APP', readAt: null },
      }),
    ]);

    return paginated(items, total, pagination, { unread });
  });

  app.post('/me/notifications/read', async (request) => {
    const { principal, db } = request.requireTenant();
    const body = z.object({ ids: z.array(z.guid()).max(200).optional() }).parse(request.body ?? {});

    const result = await db.notification.updateMany({
      where: {
        userId: principal.userId,
        readAt: null,
        ...(body.ids ? { id: { in: body.ids } } : {}),
      },
      data: { readAt: new Date(), status: 'READ' },
    });

    return ok({ marked: result.count });
  });
};
