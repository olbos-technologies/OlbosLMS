import { getPrismaClient } from '@olbos/database';
import { HOUR, type JobDefinition, type JobResult } from '../runtime.js';

/**
 * Housekeeping jobs.
 *
 * Small, boring and important: an expired session that is never cleaned up is a
 * row that keeps a revoked credential's shape around, and an export that is
 * never purged is personal data sitting in object storage past its purpose.
 */

export const sessionCleanupJob: JobDefinition = {
  name: 'session-cleanup',
  description: 'Revokes expired sessions and deletes long-dead session rows.',
  intervalMs: HOUR,
  initialDelayMs: 60_000,

  async run({ now }): Promise<JobResult> {
    const prisma = getPrismaClient();

    const revoked = await prisma.userSession.updateMany({
      where: { revokedAt: null, expiresAt: { lt: now } },
      data: { revokedAt: now, revokedReason: 'EXPIRED' },
    });

    // Revoked sessions are kept for a while: "which device was this?" is a real
    // support and security question. Thirty days is long enough to answer it.
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const deleted = await prisma.userSession.deleteMany({
      where: { revokedAt: { lt: cutoff } },
    });

    const tokens = await prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
    });

    return {
      summary: `Revoked ${revoked.count} expired session(s), removed ${deleted.count} old session(s) and ${tokens.count} reset token(s)`,
      metrics: { revoked: revoked.count, deleted: deleted.count, tokens: tokens.count },
    };
  },
};

export const retentionPurgeJob: JobDefinition = {
  name: 'retention-purge',
  description: 'Removes generated exports and files that have passed their retention date.',
  intervalMs: 12 * HOUR,
  initialDelayMs: 120_000,

  async run({ log, now }): Promise<JobResult> {
    const prisma = getPrismaClient();

    const expiredReports = await prisma.reportRun.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Files are soft-deleted here; the object itself is removed by the storage
    // driver in a follow-up pass, so a failed delete cannot orphan a row that
    // still claims the file exists.
    const files = await prisma.storedFile.findMany({
      where: { deletedAt: null, retainUntil: { lt: now } },
      select: { id: true, storageKey: true },
      take: 500,
    });

    if (files.length > 0) {
      await prisma.storedFile.updateMany({
        where: { id: { in: files.map((file) => file.id) } },
        data: { deletedAt: now },
      });
      log.info({ count: files.length }, 'files marked for storage deletion');
    }

    return {
      summary: `Purged ${expiredReports.count} expired report(s) and marked ${files.length} file(s) for deletion`,
      metrics: { reports: expiredReports.count, files: files.length },
    };
  },
};

export const usageMeteringJob: JobDefinition = {
  name: 'usage-metering',
  description: 'Records per-tenant usage counters for billing and plan limits.',
  intervalMs: 6 * HOUR,
  initialDelayMs: 90_000,

  async run({ now, signal }): Promise<JobResult> {
    const prisma = getPrismaClient();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let recorded = 0;

    for (const organization of organizations) {
      if (signal.aborted) break;

      const [users, courses, storage, aiRequests] = await Promise.all([
        prisma.employee.count({ where: { organizationId: organization.id, deletedAt: null } }),
        prisma.course.count({ where: { organizationId: organization.id, deletedAt: null } }),
        prisma.storedFile.aggregate({
          where: { organizationId: organization.id, deletedAt: null },
          _sum: { byteSize: true },
        }),
        prisma.aiUsageRecord.count({
          where: { organizationId: organization.id, occurredAt: { gte: periodStart } },
        }),
      ]);

      const metrics: [string, number][] = [
        ['users', users],
        ['courses', courses],
        ['storage_bytes', Number(storage._sum.byteSize ?? 0)],
        ['ai_requests', aiRequests],
      ];

      for (const [metric, quantity] of metrics) {
        await prisma.usageRecord.upsert({
          where: {
            organizationId_metric_periodStart: {
              organizationId: organization.id,
              metric,
              periodStart,
            },
          },
          create: {
            organizationId: organization.id,
            metric,
            quantity,
            periodStart,
            periodEnd,
          },
          update: { quantity, recordedAt: now },
        });
        recorded += 1;
      }
    }

    return {
      summary: `Recorded ${recorded} usage counter(s) for ${organizations.length} organization(s)`,
      metrics: { recorded, organizations: organizations.length },
    };
  },
};
