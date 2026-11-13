import type { Logger } from 'pino';

/**
 * Job runtime.
 *
 * Deliberately small: a job is a named async function with a schedule and a
 * concurrency of one. That covers everything OLBOS needs today (sweeps,
 * digests, purges) without a broker.
 *
 * The `JobQueue` interface below is the seam for BullMQ/Redis when work needs
 * to fan out across processes — enqueue calls already go through it, so the
 * change is a driver swap rather than a rewrite of the jobs.
 */

export interface JobContext {
  readonly log: Logger;
  readonly now: Date;
  /** Set when the runner is shutting down; long jobs should check it. */
  readonly signal: AbortSignal;
}

export interface JobResult {
  /** Short, human-readable outcome for the log line. */
  readonly summary: string;
  readonly metrics?: Record<string, number>;
}

export interface JobDefinition {
  readonly name: string;
  readonly description: string;
  /** How often to run, in milliseconds. */
  readonly intervalMs: number;
  /** Delay before the first run, so a restart does not stampede. */
  readonly initialDelayMs?: number;
  run(context: JobContext): Promise<JobResult>;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export interface JobRunStats {
  readonly name: string;
  runs: number;
  failures: number;
  lastRunAt: Date | null;
  lastDurationMs: number | null;
  lastSummary: string | null;
  lastError: string | null;
}

/**
 * Runs jobs on a timer, one instance of each at a time.
 *
 * An overrunning job does not stack up: the next tick is scheduled after the
 * previous run finishes, not on a fixed wall-clock cadence. A sweep that takes
 * longer than its interval slows down rather than piling up.
 */
export class JobRunner {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();
  private readonly controller = new AbortController();
  private stopped = false;

  readonly stats = new Map<string, JobRunStats>();

  constructor(
    private readonly log: Logger,
    private readonly jobs: readonly JobDefinition[],
  ) {
    for (const job of jobs) {
      this.stats.set(job.name, {
        name: job.name,
        runs: 0,
        failures: 0,
        lastRunAt: null,
        lastDurationMs: null,
        lastSummary: null,
        lastError: null,
      });
    }
  }

  start(): void {
    for (const job of this.jobs) {
      const delay = job.initialDelayMs ?? 0;
      this.timers.set(
        job.name,
        setTimeout(() => void this.tick(job), delay),
      );
      this.log.info(
        { job: job.name, intervalMs: job.intervalMs, initialDelayMs: delay },
        'job scheduled',
      );
    }
  }

  private async tick(job: JobDefinition): Promise<void> {
    if (this.stopped) return;
    await this.runOnce(job);
    if (this.stopped) return;
    this.timers.set(
      job.name,
      setTimeout(() => void this.tick(job), job.intervalMs),
    );
  }

  /** Runs a job now. Exposed so a job can be triggered manually or in a test. */
  async runOnce(job: JobDefinition): Promise<JobResult | null> {
    if (this.running.has(job.name)) {
      this.log.warn({ job: job.name }, 'previous run still in progress; skipping this tick');
      return null;
    }

    const stats = this.stats.get(job.name) as JobRunStats;
    const started = Date.now();
    this.running.add(job.name);

    try {
      const result = await job.run({
        log: this.log.child({ job: job.name }),
        now: new Date(),
        signal: this.controller.signal,
      });

      stats.runs += 1;
      stats.lastRunAt = new Date();
      stats.lastDurationMs = Date.now() - started;
      stats.lastSummary = result.summary;
      stats.lastError = null;

      this.log.info(
        { job: job.name, durationMs: stats.lastDurationMs, ...result.metrics },
        result.summary,
      );
      return result;
    } catch (error) {
      stats.failures += 1;
      stats.lastRunAt = new Date();
      stats.lastDurationMs = Date.now() - started;
      stats.lastError = error instanceof Error ? error.message : String(error);

      // A failing job must never take the worker down: the next tick retries,
      // and the failure count is what alerting watches.
      this.log.error({ job: job.name, err: error }, 'job failed');
      return null;
    } finally {
      this.running.delete(job.name);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.controller.abort();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();

    // Let in-flight jobs finish rather than cutting a sweep in half.
    const deadline = Date.now() + 30_000;
    while (this.running.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.running.size > 0) {
      this.log.warn({ jobs: [...this.running] }, 'jobs still running at shutdown deadline');
    }
  }
}

// ---------------------------------------------------------------------------
// Queue seam
// ---------------------------------------------------------------------------

export interface QueuedJob<T = unknown> {
  readonly name: string;
  readonly payload: T;
  readonly runAt?: Date;
}

/**
 * The interface a Redis/BullMQ driver will implement. Application code enqueues
 * through this, so adding a broker does not touch a call site.
 */
export interface JobQueue {
  enqueue<T>(job: QueuedJob<T>): Promise<string>;
  size(): Promise<number>;
}

/**
 * Development queue: runs the handler inline, after the current tick.
 *
 * Explicitly not durable — it says so, rather than looking like a queue and
 * losing work on restart.
 */
export class InlineJobQueue implements JobQueue {
  readonly durable = false;
  private pending = 0;

  constructor(
    private readonly log: Logger,
    private readonly handlers: Record<string, (payload: unknown) => Promise<void>>,
  ) {}

  async enqueue<T>(job: QueuedJob<T>): Promise<string> {
    const handler = this.handlers[job.name];
    if (!handler) throw new Error(`No handler registered for job "${job.name}"`);

    const id = `${job.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.pending += 1;

    setTimeout(
      () => {
        void handler(job.payload)
          .catch((error) => this.log.error({ err: error, job: job.name, id }, 'inline job failed'))
          .finally(() => {
            this.pending -= 1;
          });
      },
      job.runAt ? Math.max(0, job.runAt.getTime() - Date.now()) : 0,
    );

    return id;
  }

  async size(): Promise<number> {
    return this.pending;
  }
}
