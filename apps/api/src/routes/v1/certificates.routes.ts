import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getEnv } from '@olbos/config';
import { buildVerificationUrl, verifyCertificateIntegrity } from '@olbos/core';
import { resolveVisibility, VISIBILITY_LADDERS } from '@olbos/permissions';
import { ApiError } from '../../errors.js';
import {
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

/**
 * Certificates (§17, §18).
 *
 * Certificates are issued by the completion pipeline, never by hand — a
 * certificate with no training record behind it is exactly what an audit is
 * looking for. Revocation is a state change plus an audit entry; nothing is
 * deleted.
 */
export const certificateRoutes: FastifyPluginAsync = async (app) => {
  app.get('/certificates', async (request) => {
    const { principal, db } = request.requireTenant();
    request.requireEntitlement('CERTIFICATES');

    const { permission, filter } = resolveVisibility(
      principal.access,
      VISIBILITY_LADDERS.certificates,
    );
    if (!permission) throw ApiError.forbidden('You cannot view certificates.');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'SUPERSEDED']).optional(),
        employeeId: uuidSchema.optional(),
        courseId: uuidSchema.optional(),
        expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);

    const where: Record<string, unknown> = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.expiringWithinDays !== undefined
        ? {
            status: 'ACTIVE',
            expiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + query.expiringWithinDays * 86_400_000),
            },
          }
        : {}),
    };

    if (filter.selfOnly) {
      where.employeeId = principal.access.employeeId ?? '00000000-0000-0000-0000-000000000000';
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    const [items, total] = await Promise.all([
      db.certificate.findMany({
        where,
        skip,
        take,
        orderBy: toOrderBy(pagination, ['issuedAt', 'expiresAt', 'learnerName'], 'issuedAt'),
        select: {
          id: true,
          certificateNumber: true,
          publicId: true,
          learnerName: true,
          courseTitle: true,
          trainingType: true,
          status: true,
          completedAt: true,
          issuedAt: true,
          expiresAt: true,
          instructorName: true,
          creditHours: true,
          verificationCount: true,
          employee: { select: { id: true, employeeNumber: true } },
        },
      }),
      db.certificate.count({ where }),
    ]);

    const env = getEnv();
    return paginated(
      items.map((item) => ({
        ...item,
        verificationUrl: buildVerificationUrl(env.API_PUBLIC_URL, item.publicId),
      })),
      total,
      pagination,
      { scope: permission },
    );
  });

  app.get('/certificates/:id', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('CERTIFICATES');
    const { id } = parseParams(request, idParams);
    const env = getEnv();

    const certificate = await db.certificate.findFirst({
      where: { id },
      select: {
        id: true,
        publicId: true,
        certificateNumber: true,
        organizationId: true,
        employeeId: true,
        courseVersionId: true,
        learnerName: true,
        courseTitle: true,
        organizationName: true,
        trainingType: true,
        deliveryMethod: true,
        instructorName: true,
        durationMinutes: true,
        creditHours: true,
        score: true,
        status: true,
        completedAt: true,
        issuedAt: true,
        expiresAt: true,
        disclaimer: true,
        integrityHash: true,
        revokedAt: true,
        revokedReason: true,
        employee: { select: { id: true, departmentId: true, locationId: true } },
        trainingRecord: { select: { id: true, courseVersionNumber: true } },
      },
    });
    if (!certificate) throw ApiError.notFound('Certificate');

    request.authorize('certificate:read_own', {
      departmentId: certificate.employee.departmentId,
      locationId: certificate.employee.locationId,
      subjectEmployeeId: certificate.employeeId,
    });

    // The integrity check runs on every read, not only on public verification:
    // an internal viewer should not be shown a tampered certificate either.
    const intact = verifyCertificateIntegrity(
      env.CERTIFICATE_SIGNING_SECRET,
      certificate,
      certificate.integrityHash,
    );

    const { integrityHash: _hash, employee: _employee, ...safe } = certificate;
    void _hash;
    void _employee;

    return ok(
      {
        ...safe,
        verificationUrl: buildVerificationUrl(env.API_PUBLIC_URL, certificate.publicId),
      },
      { integrityVerified: intact },
    );
  });

  app.post('/certificates/:id/revoke', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('CERTIFICATES');
    request.authorize('certificate:revoke');

    const { id } = parseParams(request, idParams);
    const body = parseBody(request, z.object({ reason: z.string().trim().min(5).max(1000) }));

    const certificate = await db.certificate.findFirst({
      where: { id },
      select: {
        id: true,
        certificateNumber: true,
        courseTitle: true,
        status: true,
        learnerName: true,
      },
    });
    if (!certificate) throw ApiError.notFound('Certificate');
    if (certificate.status === 'REVOKED') {
      throw ApiError.conflict('That certificate is already revoked.');
    }

    const updated = await db.certificate.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: request.principal?.userId ?? null,
        revokedReason: body.reason,
      },
      select: { id: true, certificateNumber: true, status: true, revokedAt: true },
    });

    await request.audit({
      action: 'CERTIFICATE_REVOKED',
      entityType: 'certificate',
      entityId: id,
      summary: `Revoked ${certificate.certificateNumber} (${certificate.courseTitle}) for ${certificate.learnerName}`,
      changes: { reason: body.reason },
    });

    return ok(updated);
  });
};
