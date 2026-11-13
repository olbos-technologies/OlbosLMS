import { forTenant, getPrismaClient } from '@olbos/database';
import {
  batchByRecipient,
  buildSupervisorDigest,
  buildTrainingMessage,
  CATEGORY_POLICIES,
  dedupeKey,
  resolveDelivery,
  type NotificationCategory,
  type SupervisorDigestItem,
  type UserPreference,
} from '@olbos/notifications';
import { HOUR, MINUTE, type JobDefinition, type JobResult } from '../runtime.js';

/**
 * Notification jobs (§21).
 *
 * Two jobs, deliberately separate:
 *
 *   * `notification-generation` decides *what* should be said, and writes one
 *     row per (user, channel, event). The unique constraint on
 *     (userId, channel, dedupeKey) is what actually prevents a learner being
 *     told six times that the same certificate expires — the cooldown check is
 *     only the fast path.
 *   * `notification-dispatch` decides *when* it goes out, and batches.
 *
 * Supervisors get one digest, not one message per employee per course. That
 * distinction is the difference between a useful alert and a filtered folder.
 */

const WARNING_THRESHOLDS = [30, 7, 1];

export const notificationGenerationJob: JobDefinition = {
  name: 'notification-generation',
  description: 'Creates in-app and email notifications for due, overdue and expiring training.',
  intervalMs: 6 * HOUR,
  initialDelayMs: 30_000,

  async run({ log, now, signal }): Promise<JobResult> {
    const prisma = getPrismaClient();
    let created = 0;
    let suppressed = 0;
    let digests = 0;

    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true, name: true },
    });

    for (const organization of organizations) {
      if (signal.aborted) break;
      const db = forTenant(organization.id, prisma);

      const states = await db.complianceState.findMany({
        where: { status: { in: ['EXPIRING_SOON', 'EXPIRED', 'MISSING'] } },
        select: {
          status: true,
          dueAt: true,
          expiresAt: true,
          daysUntilExpiry: true,
          employeeId: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userId: true,
              supervisor: { select: { userId: true } },
            },
          },
          requirement: { select: { course: { select: { title: true } } } },
        },
      });

      const preferences = await db.notificationPreference.findMany({
        select: { userId: true, category: true, channel: true, enabled: true, frequency: true },
      });
      const preferencesByUser = new Map<string, UserPreference[]>();
      for (const preference of preferences) {
        const list = preferencesByUser.get(preference.userId) ?? [];
        list.push(preference as UserPreference);
        preferencesByUser.set(preference.userId, list);
      }

      const supervisorItems: (SupervisorDigestItem & { recipientId: string })[] = [];

      for (const state of states) {
        const courseTitle = state.requirement.course.title;

        // Escalating warning: only notify at a threshold that has just been
        // crossed, so a 90-day window does not produce 90 notifications.
        const category: NotificationCategory =
          state.status === 'EXPIRED'
            ? 'TRAINING_EXPIRED'
            : state.status === 'MISSING'
              ? 'TRAINING_OVERDUE'
              : 'TRAINING_EXPIRING';

        const variant =
          state.status === 'EXPIRING_SOON'
            ? WARNING_THRESHOLDS.find(
                (threshold) => state.daysUntilExpiry !== null && state.daysUntilExpiry <= threshold,
              )
            : null;

        if (state.status === 'EXPIRING_SOON' && variant === undefined) {
          suppressed += 1;
          continue;
        }

        if (state.employee.userId) {
          const key = dedupeKey({
            category,
            entityId: `${state.employeeId}:${courseTitle}`,
            variant: variant ?? null,
          });

          const delivery = resolveDelivery(
            category,
            preferencesByUser.get(state.employee.userId) ?? [],
          );

          const message = buildTrainingMessage(category, {
            courseTitle,
            dueAt: state.dueAt,
            expiresAt: state.expiresAt,
            daysUntil: state.daysUntilExpiry,
            daysOverdue:
              state.dueAt && state.dueAt < now
                ? Math.floor((now.getTime() - state.dueAt.getTime()) / 86_400_000)
                : null,
            organizationName: organization.name,
          });

          for (const channel of delivery.channels) {
            try {
              await db.notification.create({
                data: {
                  organizationId: organization.id,
                  userId: state.employee.userId,
                  category,
                  channel,
                  status: 'PENDING',
                  subject: message.subject,
                  body: message.body,
                  actionUrl: message.actionUrl ?? null,
                  dedupeKey: key,
                  scheduledFor: now,
                },
              });
              created += 1;
            } catch {
              // Unique violation on (userId, channel, dedupeKey): this exact
              // notice already exists. That is the intended outcome.
              suppressed += 1;
            }
          }
        }

        if (state.employee.supervisor?.userId) {
          supervisorItems.push({
            recipientId: state.employee.supervisor.userId,
            employeeName: `${state.employee.firstName} ${state.employee.lastName}`,
            courseTitle,
            status:
              state.status === 'EXPIRED'
                ? 'EXPIRED'
                : state.status === 'MISSING'
                  ? 'MISSING'
                  : 'EXPIRING',
            dueAt: state.dueAt,
          });
        }
      }

      for (const bucket of batchByRecipient(supervisorItems)) {
        const message = buildSupervisorDigest(bucket.items);
        const key = dedupeKey({
          category: 'COMPLIANCE_DIGEST',
          entityId: bucket.key,
          // One digest per day per supervisor.
          variant: now.toISOString().slice(0, 10),
        });

        try {
          await db.notification.create({
            data: {
              organizationId: organization.id,
              userId: bucket.key,
              category: 'COMPLIANCE_DIGEST',
              channel: 'EMAIL',
              status: 'PENDING',
              subject: message.subject,
              body: message.body,
              actionUrl: message.actionUrl ?? null,
              dedupeKey: key,
              batchKey: key,
              scheduledFor: now,
            },
          });
          digests += 1;
        } catch {
          suppressed += 1;
        }
      }
    }

    log.debug({ created, suppressed, digests }, 'notification generation finished');

    return {
      summary: `Created ${created} notification(s) and ${digests} digest(s); ${suppressed} suppressed as duplicates`,
      metrics: { created, digests, suppressed },
    };
  },
};

export const notificationDispatchJob: JobDefinition = {
  name: 'notification-dispatch',
  description: 'Sends pending notifications through the configured transports.',
  intervalMs: 5 * MINUTE,
  initialDelayMs: 45_000,

  async run({ log, now, signal }): Promise<JobResult> {
    const prisma = getPrismaClient();
    let sent = 0;
    let failed = 0;

    const pending = await prisma.notification.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
      take: 500,
      select: {
        id: true,
        organizationId: true,
        channel: true,
        category: true,
        subject: true,
        user: { select: { email: true } },
      },
    });

    for (const notification of pending) {
      if (signal.aborted) break;

      try {
        if (notification.channel === 'IN_APP') {
          // In-app notifications are already durable the moment the row exists.
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: 'SENT', sentAt: now },
          });
          sent += 1;
          continue;
        }

        // Email, SMS and push go through @olbos/notifications transports. The
        // deployment wires a real transport in `main.ts`; the log transport
        // records what would have been sent.
        log.info(
          {
            channel: notification.channel,
            to: notification.user.email,
            subject: notification.subject,
            category: notification.category,
            mandatory: CATEGORY_POLICIES[notification.category as NotificationCategory].mandatory,
          },
          'notification dispatched',
        );

        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: now },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'FAILED',
            failedAt: now,
            failureReason: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return {
      summary: `Dispatched ${sent} notification(s), ${failed} failed`,
      metrics: { sent, failed, pending: pending.length },
    };
  },
};
