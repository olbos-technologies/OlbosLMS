/**
 * Practical (hands-on) skills assessment scoring (§16).
 *
 * The assessor records PASS / FAIL / N/A per criterion. Scoring is deliberately
 * strict by default: a template that marks a criterion `isCritical` fails the
 * whole assessment when that criterion fails, however high the weighted score.
 */

export type CriterionResult = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export interface PracticalCriterion {
  readonly id: string;
  readonly text: string;
  readonly isCritical?: boolean;
  readonly weight?: number;
}

export interface PracticalTemplate {
  readonly requireAllCriteria?: boolean;
  /** Used when `requireAllCriteria` is false. */
  readonly passingPercent?: number | null;
  readonly requiresEmployeeAcknowledgment?: boolean;
}

export interface CriterionEntry {
  readonly criterionId: string;
  readonly result: CriterionResult;
  readonly comment?: string | null;
}

export interface PracticalScore {
  readonly passed: boolean;
  readonly scorePercent: number | null;
  readonly assessedCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly notApplicableCount: number;
  readonly failedCriticalIds: string[];
  readonly unscoredCriterionIds: string[];
  readonly reason: string;
}

export const scorePracticalAssessment = (
  criteria: readonly PracticalCriterion[],
  entries: readonly CriterionEntry[],
  template: PracticalTemplate = {},
): PracticalScore => {
  const byId = new Map(entries.map((entry) => [entry.criterionId, entry]));
  const unscoredCriterionIds = criteria
    .filter((criterion) => !byId.has(criterion.id))
    .map((criterion) => criterion.id);

  let passedWeight = 0;
  let assessedWeight = 0;
  let passedCount = 0;
  let failedCount = 0;
  let notApplicableCount = 0;
  const failedCriticalIds: string[] = [];

  for (const criterion of criteria) {
    const entry = byId.get(criterion.id);
    if (!entry) continue;
    const weight = criterion.weight ?? 1;

    switch (entry.result) {
      case 'PASS':
        passedCount += 1;
        passedWeight += weight;
        assessedWeight += weight;
        break;
      case 'FAIL':
        failedCount += 1;
        assessedWeight += weight;
        if (criterion.isCritical) failedCriticalIds.push(criterion.id);
        break;
      case 'NOT_APPLICABLE':
        // N/A leaves the denominator entirely: it neither helps nor hurts.
        notApplicableCount += 1;
        break;
    }
  }

  const assessedCount = passedCount + failedCount + notApplicableCount;
  const scorePercent =
    assessedWeight > 0 ? Math.round((passedWeight / assessedWeight) * 1000) / 10 : null;

  if (unscoredCriterionIds.length > 0) {
    return {
      passed: false,
      scorePercent,
      assessedCount,
      passedCount,
      failedCount,
      notApplicableCount,
      failedCriticalIds,
      unscoredCriterionIds,
      reason: `${unscoredCriterionIds.length} criterion/criteria have not been assessed`,
    };
  }

  if (failedCriticalIds.length > 0) {
    return {
      passed: false,
      scorePercent,
      assessedCount,
      passedCount,
      failedCount,
      notApplicableCount,
      failedCriticalIds,
      unscoredCriterionIds,
      reason: 'A critical criterion was not met',
    };
  }

  const requireAll = template.requireAllCriteria ?? true;
  if (requireAll) {
    const passed = failedCount === 0;
    return {
      passed,
      scorePercent,
      assessedCount,
      passedCount,
      failedCount,
      notApplicableCount,
      failedCriticalIds,
      unscoredCriterionIds,
      reason: passed
        ? 'Every applicable criterion was met'
        : `${failedCount} criterion/criteria were not met`,
    };
  }

  const threshold = template.passingPercent ?? 80;
  const passed = scorePercent !== null && scorePercent >= threshold;
  return {
    passed,
    scorePercent,
    assessedCount,
    passedCount,
    failedCount,
    notApplicableCount,
    failedCriticalIds,
    unscoredCriterionIds,
    reason: passed
      ? `Score ${scorePercent}% meets the ${threshold}% threshold`
      : `Score ${scorePercent ?? 0}% is below the ${threshold}% threshold`,
  };
};

export interface SignoffState {
  readonly assessorSignedAt?: Date | null;
  readonly employeeAcknowledgedAt?: Date | null;
}

/** Whether an assessment may be treated as final evidence of competence. */
export const isPracticalComplete = (
  score: PracticalScore,
  signoff: SignoffState,
  template: PracticalTemplate = {},
): { complete: boolean; blockers: string[] } => {
  const blockers: string[] = [];
  if (score.unscoredCriterionIds.length > 0) blockers.push('Not every criterion has been assessed');
  if (!signoff.assessorSignedAt) blockers.push('The assessor has not signed the assessment');
  if ((template.requiresEmployeeAcknowledgment ?? true) && !signoff.employeeAcknowledgedAt) {
    blockers.push('The employee has not acknowledged the assessment');
  }
  return { complete: blockers.length === 0, blockers };
};
