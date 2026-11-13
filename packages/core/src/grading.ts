import { daysBetween, DEFAULT_TIMEZONE } from './dates.js';

/**
 * Gradebook calculation (§25).
 *
 * Rules the engine enforces:
 *   * Excused work leaves the denominator, it does not score zero.
 *   * Extra credit adds to the numerator without inflating the denominator.
 *   * Late penalties are computed from the submission, never applied twice.
 *   * Category weights are normalised, so a course whose weights sum to 90 or
 *     110 still produces a sane total instead of silently mis-scoring learners.
 *   * Nothing here mutates a stored grade; callers persist the result together
 *     with a `grade_audits` row.
 */

export interface GradeEntry {
  readonly id: string;
  readonly categoryId?: string | null;
  readonly pointsEarned?: number | null;
  readonly pointsPossible?: number | null;
  readonly isExcused?: boolean;
  readonly isExtraCredit?: boolean;
}

export interface GradeCategory {
  readonly id: string;
  readonly name: string;
  readonly weightPercent: number;
  readonly dropLowest?: number;
}

export interface CategoryResult {
  readonly categoryId: string;
  readonly name: string;
  readonly weightPercent: number;
  /** Weight after normalisation across categories that carry graded work. */
  readonly effectiveWeightPercent: number;
  readonly pointsEarned: number;
  readonly pointsPossible: number;
  readonly percent: number | null;
  readonly droppedGradeIds: string[];
  readonly countedGradeIds: string[];
}

export interface CourseGradeResult {
  readonly percent: number | null;
  readonly letter: string | null;
  readonly pointsEarned: number;
  readonly pointsPossible: number;
  readonly categories: CategoryResult[];
  /** True when weights had to be normalised because they did not sum to 100. */
  readonly weightsNormalised: boolean;
}

export interface LetterGradeBand {
  readonly letter: string;
  /** Inclusive lower bound as a percentage. */
  readonly minPercent: number;
}

/** A conventional default; every organization may override it. */
export const DEFAULT_LETTER_SCALE: readonly LetterGradeBand[] = [
  { letter: 'A', minPercent: 93 },
  { letter: 'A-', minPercent: 90 },
  { letter: 'B+', minPercent: 87 },
  { letter: 'B', minPercent: 83 },
  { letter: 'B-', minPercent: 80 },
  { letter: 'C+', minPercent: 77 },
  { letter: 'C', minPercent: 73 },
  { letter: 'C-', minPercent: 70 },
  { letter: 'D+', minPercent: 67 },
  { letter: 'D', minPercent: 63 },
  { letter: 'D-', minPercent: 60 },
  { letter: 'F', minPercent: 0 },
];

export const letterFor = (
  percent: number | null,
  scale: readonly LetterGradeBand[] = DEFAULT_LETTER_SCALE,
): string | null => {
  if (percent === null || Number.isNaN(percent)) return null;
  const ordered = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  return ordered.find((band) => percent >= band.minPercent)?.letter ?? null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isCounted = (grade: GradeEntry): boolean =>
  !grade.isExcused && grade.pointsEarned !== null && grade.pointsEarned !== undefined;

/**
 * Drops the N lowest scores in a category. Extra credit is never dropped —
 * dropping it would penalise a learner for doing optional work.
 */
const applyDropLowest = (
  grades: readonly GradeEntry[],
  dropLowest: number,
): { counted: GradeEntry[]; dropped: GradeEntry[] } => {
  const droppable = grades.filter((g) => !g.isExtraCredit && (g.pointsPossible ?? 0) > 0);
  const protectedGrades = grades.filter((g) => !droppable.includes(g));
  if (dropLowest <= 0 || droppable.length <= dropLowest) {
    return { counted: grades.slice(), dropped: [] };
  }

  const ranked = [...droppable].sort((a, b) => {
    const aRatio = (a.pointsEarned ?? 0) / (a.pointsPossible || 1);
    const bRatio = (b.pointsEarned ?? 0) / (b.pointsPossible || 1);
    return aRatio - bRatio;
  });

  const dropped = ranked.slice(0, dropLowest);
  const droppedIds = new Set(dropped.map((g) => g.id));
  return {
    counted: [...protectedGrades, ...droppable.filter((g) => !droppedIds.has(g.id))],
    dropped,
  };
};

export interface CalculateCourseGradeOptions {
  readonly categories?: readonly GradeCategory[];
  readonly letterScale?: readonly LetterGradeBand[];
}

/**
 * Computes a learner's course grade from their graded work.
 *
 * With no categories the result is a straight points total. With categories it
 * is the weighted mean of each category's percentage, using only the categories
 * that actually contain graded work.
 */
export const calculateCourseGrade = (
  grades: readonly GradeEntry[],
  options: CalculateCourseGradeOptions = {},
): CourseGradeResult => {
  const categories = options.categories ?? [];
  const counted = grades.filter(isCounted);

  if (categories.length === 0) {
    const pointsEarned = counted.reduce((sum, g) => sum + (g.pointsEarned ?? 0), 0);
    const pointsPossible = counted
      .filter((g) => !g.isExtraCredit)
      .reduce((sum, g) => sum + (g.pointsPossible ?? 0), 0);
    const percent = pointsPossible > 0 ? round2((pointsEarned / pointsPossible) * 100) : null;
    return {
      percent,
      letter: letterFor(percent, options.letterScale),
      pointsEarned: round2(pointsEarned),
      pointsPossible: round2(pointsPossible),
      categories: [],
      weightsNormalised: false,
    };
  }

  const results: CategoryResult[] = categories.map((category) => {
    const inCategory = counted.filter((g) => g.categoryId === category.id);
    const { counted: kept, dropped } = applyDropLowest(inCategory, category.dropLowest ?? 0);

    const pointsEarned = kept.reduce((sum, g) => sum + (g.pointsEarned ?? 0), 0);
    const pointsPossible = kept
      .filter((g) => !g.isExtraCredit)
      .reduce((sum, g) => sum + (g.pointsPossible ?? 0), 0);

    return {
      categoryId: category.id,
      name: category.name,
      weightPercent: category.weightPercent,
      effectiveWeightPercent: 0,
      pointsEarned: round2(pointsEarned),
      pointsPossible: round2(pointsPossible),
      percent: pointsPossible > 0 ? round2((pointsEarned / pointsPossible) * 100) : null,
      droppedGradeIds: dropped.map((g) => g.id),
      countedGradeIds: kept.map((g) => g.id),
    };
  });

  const scoring = results.filter((r) => r.percent !== null && r.weightPercent > 0);
  const weightTotal = scoring.reduce((sum, r) => sum + r.weightPercent, 0);

  const withEffectiveWeights = results.map((result) => ({
    ...result,
    effectiveWeightPercent:
      weightTotal > 0 && scoring.includes(result)
        ? round2((result.weightPercent / weightTotal) * 100)
        : 0,
  }));

  const percent =
    weightTotal > 0
      ? round2(
          withEffectiveWeights.reduce(
            (sum, r) => sum + ((r.percent ?? 0) * r.effectiveWeightPercent) / 100,
            0,
          ),
        )
      : null;

  return {
    percent,
    letter: letterFor(percent, options.letterScale),
    pointsEarned: round2(withEffectiveWeights.reduce((sum, r) => sum + r.pointsEarned, 0)),
    pointsPossible: round2(withEffectiveWeights.reduce((sum, r) => sum + r.pointsPossible, 0)),
    categories: withEffectiveWeights,
    // Anything other than exactly 100 means the stored weights were rescaled.
    weightsNormalised: scoring.length > 0 && Math.abs(weightTotal - 100) > 0.001,
  };
};

// ---------------------------------------------------------------------------
// Late penalties
// ---------------------------------------------------------------------------

export interface LatePolicy {
  readonly allowLate?: boolean;
  readonly penaltyPercentPerDay?: number | null;
  readonly maxLateDays?: number | null;
  readonly timezone?: string;
}

export interface LateAssessment {
  readonly isLate: boolean;
  readonly lateDays: number;
  readonly accepted: boolean;
  /** Percentage points deducted from the raw score, 0–100. */
  readonly penaltyPercent: number;
}

/** Classifies a submission against the assignment's late policy. */
export const assessLateness = (
  submittedAt: Date,
  dueAt: Date | null | undefined,
  policy: LatePolicy = {},
): LateAssessment => {
  if (!dueAt) {
    return { isLate: false, lateDays: 0, accepted: true, penaltyPercent: 0 };
  }

  const timezone = policy.timezone ?? DEFAULT_TIMEZONE;
  const lateDays = Math.max(0, -daysBetween(submittedAt, dueAt, timezone));

  if (lateDays === 0) {
    return { isLate: false, lateDays: 0, accepted: true, penaltyPercent: 0 };
  }

  if (policy.allowLate === false) {
    return { isLate: true, lateDays, accepted: false, penaltyPercent: 100 };
  }

  if (policy.maxLateDays != null && lateDays > policy.maxLateDays) {
    return { isLate: true, lateDays, accepted: false, penaltyPercent: 100 };
  }

  const perDay = policy.penaltyPercentPerDay ?? 0;
  return {
    isLate: true,
    lateDays,
    accepted: true,
    penaltyPercent: Math.min(100, round2(perDay * lateDays)),
  };
};

/** Applies a late penalty to a raw score. Never returns a negative score. */
export const applyLatePenalty = (
  pointsEarned: number,
  pointsPossible: number,
  penaltyPercent: number,
): number => {
  if (penaltyPercent <= 0) return round2(pointsEarned);
  const deduction = (pointsPossible * penaltyPercent) / 100;
  return round2(Math.max(0, pointsEarned - deduction));
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface GradeChange {
  readonly field: string;
  readonly from: unknown;
  readonly to: unknown;
}

/**
 * Diffs a stored grade against its replacement. The API refuses to write a
 * grade change without persisting this diff to `grade_audits`.
 */
export const diffGrade = (
  previous: Partial<GradeEntry> & Record<string, unknown>,
  next: Partial<GradeEntry> & Record<string, unknown>,
  fields: readonly string[] = [
    'pointsEarned',
    'pointsPossible',
    'percent',
    'letter',
    'isExcused',
    'isExtraCredit',
    'feedback',
  ],
): GradeChange[] =>
  fields
    .filter((field) => field in previous || field in next)
    .map((field) => ({ field, from: previous[field] ?? null, to: next[field] ?? null }))
    .filter((change) => JSON.stringify(change.from) !== JSON.stringify(change.to));
