import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getEnv } from '@olbos/config';
import { getPrismaClient } from '@olbos/database';
import { buildVerificationPayload, type CertificateRecord } from '@olbos/core';
import { parseParams } from '../lib/http.js';

/**
 * Unauthenticated certificate verification (§17).
 *
 * Anyone holding a certificate — an auditor, a client, a prospective employer —
 * can confirm it is genuine. The response is deliberately narrow: enough to
 * confirm the credential, never enough to mine personal data from a guessed
 * code. Verification attempts are rate limited and counted on the certificate.
 */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  const prisma = getPrismaClient();
  const env = getEnv();

  app.get(
    '/verify/certificate/:publicId',
    {
      config: {
        skipCsrf: true,
        // Tighter than the global limit: this is the endpoint an attacker
        // would use to enumerate certificate codes.
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { publicId } = parseParams(
        request,
        z.object({
          publicId: z
            .string()
            .min(6)
            .max(32)
            .regex(/^[A-Z0-9]+$/),
        }),
      );

      const certificate = await prisma.certificate.findUnique({
        where: { publicId },
        select: {
          publicId: true,
          certificateNumber: true,
          organizationId: true,
          employeeId: true,
          courseVersionId: true,
          learnerName: true,
          courseTitle: true,
          completedAt: true,
          issuedAt: true,
          expiresAt: true,
          integrityHash: true,
          status: true,
          organizationName: true,
          trainingType: true,
          instructorName: true,
          durationMinutes: true,
          creditHours: true,
          disclaimer: true,
          revokedAt: true,
        },
      });

      const payload = buildVerificationPayload(
        certificate
          ? ({
              ...certificate,
              creditHours: certificate.creditHours ? Number(certificate.creditHours) : null,
            } as CertificateRecord)
          : null,
        { secret: env.CERTIFICATE_SIGNING_SECRET },
      );

      if (certificate) {
        // Fire-and-forget: a verification counter must never delay or fail the
        // answer an auditor is waiting on.
        void prisma.certificate
          .update({
            where: { publicId },
            data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() },
          })
          .catch((error) => request.log.warn({ err: error }, 'verification counter update failed'));
      }

      return reply
        .status(payload.result === 'NOT_FOUND' ? 404 : 200)
        .header('cache-control', 'no-store')
        .send({ data: payload });
    },
  );
};
