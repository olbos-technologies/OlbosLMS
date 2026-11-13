/**
 * The at-risk engine (§45).
 *
 * This produces a *prioritisation aid*, never a judgement about a person. Every
 * output carries the factors that produced it, in plain language, so a
 * supervisor can see exactly why someone was surfaced and disagree with it.
 *
 * Deliberate constraints:
 *   * No demographic, protected-class or personal-characteristic input.
 *   * No opaque coefficients: each factor states its own contribution.
 *   * Thresholds are configurable per organization.
 */

export interface RiskSignals {
  readonly overdueTrainingCount?: number;
  readonly expiredTrainingCount?: number;
  readonly expiringWithin30DaysCount?: number;
  readonly missingRequiredTrainingCount?: number;
  readonly failedAssessmentCount?: number;
  readonly missedSessionCount?: number;
  readonly incompleteCourseCount?: number;
  /** Days since the learner last did anything. */
  readonly daysSinceLastActivity?: number | null;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFactor {
  readonly code: string;
  readonly label: string;
  readonly detail: string;
  readonly points: number;
}

export interface RiskAssessment {
  readonly level: RiskLevel;
  readonly score: number;
  readonly factors: RiskFactor[];
  /** Always present, so the UI never shows a bare score. */
  readonly explanation: string;
  readonly disclaimer: string;
}

export interface RiskWeights {
  readonly expiredTraining: number;
  readonly missingTraining: number;
  readonly overdueTraining: number;
  readonly expiringSoon: number;
  readonly failedAssessment: number;
  readonly missedSession: number;
  readonly incompleteCourse: number;
  readonly inactivity: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  expiredTraining: 25,
  missingTraining: 20,
  overdueTraining: 15,
  expiringSoon: 5,
  failedAssessment: 10,
  missedSession: 8,
  incompleteCourse: 4,
  inactivity: 10,
};

export interface RiskThresholds {
  readonly medium: number;
  readonly high: number;
  /** Days of inactivity before the inactivity factor applies. */
  readonly inactivityDays: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  medium: 25,
  high: 55,
  inactivityDays: 45,
};

const DISCLAIMER =
  'This is a prioritisation aid derived from training records, not an evaluation of the ' +
  'person. Review the listed factors before acting on it.';

export const assessRisk = (
  signals: RiskSignals,
  options: { weights?: Partial<RiskWeights>; thresholds?: Partial<RiskThresholds> } = {},
): RiskAssessment => {
  const weights = { ...DEFAULT_RISK_WEIGHTS, ...options.weights };
  const thresholds = { ...DEFAULT_RISK_THRESHOLDS, ...options.thresholds };
  const factors: RiskFactor[] = [];

  const add = (
    code: string,
    label: string,
    count: number | undefined,
    weight: number,
    unit: string,
    cap = 3,
  ): void => {
    if (!count || count <= 0) return;
    const counted = Math.min(count, cap);
    factors.push({
      code,
      label,
      detail: `${count} ${unit}${count === 1 ? '' : 's'}`,
      points: counted * weight,
    });
  };

  add(
    'EXPIRED_TRAINING',
    'Expired training',
    signals.expiredTrainingCount,
    weights.expiredTraining,
    'expired item',
  );
  add(
    'MISSING_TRAINING',
    'Missing required training',
    signals.missingRequiredTrainingCount,
    weights.missingTraining,
    'missing item',
  );
  add(
    'OVERDUE_TRAINING',
    'Overdue training',
    signals.overdueTrainingCount,
    weights.overdueTraining,
    'overdue assignment',
  );
  add(
    'EXPIRING_SOON',
    'Training expiring soon',
    signals.expiringWithin30DaysCount,
    weights.expiringSoon,
    'item expiring within 30 days',
  );
  add(
    'FAILED_ASSESSMENT',
    'Repeated assessment failures',
    signals.failedAssessmentCount,
    weights.failedAssessment,
    'failed attempt',
  );
  add(
    'MISSED_SESSION',
    'Missed training sessions',
    signals.missedSessionCount,
    weights.missedSession,
    'missed session',
  );
  add(
    'INCOMPLETE_COURSE',
    'Incomplete courses',
    signals.incompleteCourseCount,
    weights.incompleteCourse,
    'course in progress',
  );

  const inactiveDays = signals.daysSinceLastActivity;
  if (inactiveDays != null && inactiveDays >= thresholds.inactivityDays) {
    factors.push({
      code: 'INACTIVITY',
      label: 'Low engagement',
      detail: `No learning activity for ${inactiveDays} days`,
      points: weights.inactivity,
    });
  }

  const score = Math.min(
    100,
    factors.reduce((sum, factor) => sum + factor.points, 0),
  );
  const level: RiskLevel =
    score >= thresholds.high ? 'HIGH' : score >= thresholds.medium ? 'MEDIUM' : 'LOW';

  const explanation =
    factors.length === 0
      ? 'No outstanding training issues were found.'
      : factors
          .slice()
          .sort((a, b) => b.points - a.points)
          .map((factor) => `${factor.label}: ${factor.detail}`)
          .join('; ');

  return { level, score, factors, explanation, disclaimer: DISCLAIMER };
};
