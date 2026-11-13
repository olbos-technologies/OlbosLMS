import { pino } from 'pino';
import { getEnv } from '@olbos/config';
import { getPrismaClient } from '@olbos/database';
import { JobRunner, type JobDefinition } from './runtime.js';
import { complianceSweepJob } from './jobs/compliance-sweep.js';
import { requirementRecalculationJob } from './jobs/requirement-recalculation.js';
import { notificationDispatchJob, notificationGenerationJob } from './jobs/notifications.js';
import { retentionPurgeJob, sessionCleanupJob, usageMeteringJob } from './jobs/maintenance.js';

/**
 * OLBOS worker.
 *
 * Runs the scheduled work that makes compliance true over time: expiry
 * transitions, requirement re-evaluation, notifications, metering and
 * housekeeping. Nothing here is triggered by an HTTP request, and nothing in
 * the API blocks on it.
 */

export const JOBS: readonly JobDefinition[] = [
  complianceSweepJob,
  requirementRecalculationJob,
  notificationGenerationJob,
  notificationDispatchJob,
  sessionCleanupJob,
  retentionPurgeJob,
  usageMeteringJob,
];

const main = async (): Promise<void> => {
  const env = getEnv();
  const log = pino({ level: env.LOG_LEVEL, name: 'olbos-worker' });

  const runner = new JobRunner(log, JOBS);

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down worker');
    await runner.stop();
    await getPrismaClient().$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'unhandled promise rejection');
  });

  // `--once` runs every job a single time and exits: used by the CI smoke check
  // and by an operator who needs a sweep now rather than at the next tick.
  if (process.argv.includes('--once')) {
    log.info({ jobs: JOBS.length }, 'running every job once');
    for (const job of JOBS) {
      await runner.runOnce(job);
    }
    await getPrismaClient().$disconnect();
    return;
  }

  runner.start();
  log.info({ jobs: JOBS.map((job) => job.name) }, 'OLBOS worker started');
};

main().catch((error) => {
  console.error('Failed to start the OLBOS worker:', error);
  process.exit(1);
});
