import { addDays, addYears, daysBetween, DEFAULT_TIMEZONE } from './dates.js';

/**
 * The training expiration engine (§14).
 *
 * Nothing here hard-codes a regulatory renewal interval. Every interval and
 * every warning threshold comes from the organization's own configuration —
 * OLBOS models the policy an organization sets, it does not assert what the law
 * requires.
 */

/** Presets offered in the UI. Any positive integer is accepted. */
export const RENEWAL_PRESETS = {
  NEVER: null,
  DAYS_30: 30,
  DAYS_90: 90,
  MONTHS_6: 182,
  YEAR_1: 365,
  YEARS_2: 730,
  YEARS_3: 1095,
} as const;

export type ExpirationBasis = 'COMPLETION_DATE' | 'FIXED_DATE' | 'ANNIVERSARY_OF_HIRE';

export const DEFAULT_WARNING_INTERVALS = [90, 60, 30, 14, 7, 1] as const;

export interface ExpirationPolicy {
  /** Null (or 0) means the training never expires. */
  readonly renewalIntervalDays: number | null;
  readonly basis?: ExpirationBasis;
  /** Required when basis is FIXED_DATE. */
  readonly fixedExpiresAt?: Date | null;
  /** Required when basis is ANNIVERSARY_OF_HIRE. */
  readonly hireDate?: Date | null;
  readonly warningIntervalDays?: readonly number[];
  readonly timezone?: string;
}

export const neverExpires = (policy: ExpirationPolicy): boolean =>
  policy.basis !== 'FIXED_DATE' &&
  (policy.renewalIntervalDays === null ||
    policy.renewalIntervalDays === undefined ||
    policy.renewalIntervalDays <= 0);

/**
 * The instant a completion stops counting as current, or null when the training
 * never expires.
 */
export const computeExpiresAt = (completedAt: Date, policy: ExpirationPolicy): Date | null => {
  const basis = policy.basis ?? 'COMPLETION_DATE';

  if (basis === 'FIXED_DATE') {
    return policy.fixedExpiresAt ?? null;
  }

  if (neverExpires(policy)) return null;
  const interval = policy.renewalIntervalDays as number;

  if (basis === 'ANNIVERSARY_OF_HIRE') {
    if (!policy.hireDate) return addDays(completedAt, interval);
    // Roll the hire anniversary forward until it lands after the completion.
    let anniversary = policy.hireDate;
    let guard = 0;
    while (anniversary <= completedAt && guard < 200) {
      anniversary = addYears(anniversary, 1);
      guard += 1;
    }
    return anniversary;
  }

  return addDays(completedAt, interval);
};

export type ExpirationStatus = 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED' | 'NEVER_EXPIRES';

export interface ExpirationEvaluation {
  readonly status: ExpirationStatus;
  readonly expiresAt: Date | null;
  /** Negative once expired. Null when the training never expires. */
  readonly daysUntilExpiry: number | null;
  /** The warning threshold that has been crossed, if any (e.g. 30). */
  readonly warningThreshold: number | null;
}

const sortedWarnings = (intervals: readonly number[] | undefined): number[] =>
  [...(intervals && intervals.length > 0 ? intervals : DEFAULT_WARNING_INTERVALS)]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

/** Classifies an expiry instant relative to `now`. */
export const evaluateExpiration = (
  expiresAt: Date | null,
  options: { now?: Date; warningIntervalDays?: readonly number[]; timezone?: string } = {},
): ExpirationEvaluation => {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;

  if (!expiresAt) {
    return {
      status: 'NEVER_EXPIRES',
      expiresAt: null,
      daysUntilExpiry: null,
      warningThreshold: null,
    };
  }

  const daysUntilExpiry = daysBetween(now, expiresAt, timezone);

  if (daysUntilExpiry < 0) {
    return { status: 'EXPIRED', expiresAt, daysUntilExpiry, warningThreshold: null };
  }

  const warnings = sortedWarnings(options.warningIntervalDays);
  // The tightest threshold that has been crossed, so the message escalates as
  // the date approaches (30 -> 14 -> 7 -> 1) instead of repeating the widest.
  const crossed = warnings.find((threshold) => daysUntilExpiry <= threshold) ?? null;

  return {
    status: crossed === null ? 'CURRENT' : 'EXPIRING_SOON',
    expiresAt,
    daysUntilExpiry,
    warningThreshold: crossed,
  };
};

/** Convenience: compute the expiry from a completion, then classify it. */
export const evaluateCompletion = (
  completedAt: Date,
  policy: ExpirationPolicy,
  now: Date = new Date(),
): ExpirationEvaluation =>
  evaluateExpiration(computeExpiresAt(completedAt, policy), {
    now,
    ...(policy.warningIntervalDays ? { warningIntervalDays: policy.warningIntervalDays } : {}),
    ...(policy.timezone ? { timezone: policy.timezone } : {}),
  });

/**
 * The next date on which a warning notification should fire, or null when no
 * further warning is due. Used by the notification scheduler to avoid sending
 * the same warning twice.
 */
export const nextWarningDate = (
  expiresAt: Date | null,
  options: { now?: Date; warningIntervalDays?: readonly number[]; timezone?: string } = {},
): { date: Date; threshold: number } | null => {
  if (!expiresAt) return null;
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const remaining = daysBetween(now, expiresAt, timezone);
  if (remaining < 0) return null;

  // Warnings that are still in the future, widest first.
  const upcoming = sortedWarnings(options.warningIntervalDays)
    .filter((threshold) => threshold < remaining)
    .sort((a, b) => b - a);

  const threshold = upcoming[0];
  if (threshold === undefined) return null;
  return { date: addDays(expiresAt, -threshold), threshold };
};
