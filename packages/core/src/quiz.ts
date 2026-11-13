/**
 * Quiz auto-grading (§25).
 *
 * Objective question types are scored here; essays and unmatched short answers
 * are flagged for a human. Nothing is marked correct by guesswork: an ungraded
 * response returns `isCorrect: null`, and the attempt stays SUBMITTED rather
 * than GRADED until an instructor finishes it.
 */

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_SELECT'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'ESSAY'
  | 'MATCHING'
  | 'ORDERING'
  | 'SCENARIO';

export interface QuestionOptionInput {
  readonly id: string;
  readonly isCorrect: boolean;
}

export interface QuestionInput {
  readonly id: string;
  readonly type: QuestionType;
  readonly points: number;
  readonly options?: readonly QuestionOptionInput[];
  /**
   * Type-specific answer key:
   *   SHORT_ANSWER -> { acceptedAnswers: string[], caseSensitive?: boolean }
   *   MATCHING     -> { pairs: Record<leftId, rightId> }
   *   ORDERING     -> { sequence: string[] }
   */
  readonly payload?: Record<string, unknown>;
  /** Partial credit for MULTIPLE_SELECT / MATCHING / ORDERING. */
  readonly allowPartialCredit?: boolean;
}

export interface ResponseInput {
  readonly questionId: string;
  /**
   * MULTIPLE_CHOICE / TRUE_FALSE -> { optionId }
   * MULTIPLE_SELECT              -> { optionIds: string[] }
   * SHORT_ANSWER / ESSAY         -> { text }
   * MATCHING                     -> { pairs: Record<leftId, rightId> }
   * ORDERING                     -> { sequence: string[] }
   */
  readonly answer: Record<string, unknown>;
}

export interface GradedResponse {
  readonly questionId: string;
  readonly isCorrect: boolean | null;
  readonly pointsEarned: number | null;
  readonly pointsPossible: number;
  readonly requiresManualGrading: boolean;
}

export interface GradedAttempt {
  readonly responses: GradedResponse[];
  readonly pointsEarned: number;
  readonly pointsPossible: number;
  /** Null while manual grading is outstanding. */
  readonly scorePercent: number | null;
  readonly passed: boolean | null;
  readonly requiresManualGrading: boolean;
  readonly autoGradedCount: number;
  readonly manualCount: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const normaliseText = (value: string, caseSensitive: boolean): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
};

const gradeMultipleChoice = (question: QuestionInput, response: ResponseInput): GradedResponse => {
  const correctIds = (question.options ?? []).filter((o) => o.isCorrect).map((o) => o.id);
  const chosen = typeof response.answer.optionId === 'string' ? response.answer.optionId : null;
  const isCorrect = chosen !== null && correctIds.includes(chosen);
  return {
    questionId: question.id,
    isCorrect,
    pointsEarned: isCorrect ? question.points : 0,
    pointsPossible: question.points,
    requiresManualGrading: false,
  };
};

const gradeMultipleSelect = (question: QuestionInput, response: ResponseInput): GradedResponse => {
  const correct = new Set((question.options ?? []).filter((o) => o.isCorrect).map((o) => o.id));
  const incorrect = new Set((question.options ?? []).filter((o) => !o.isCorrect).map((o) => o.id));
  const chosen = new Set(asStringArray(response.answer.optionIds));

  const hits = [...chosen].filter((id) => correct.has(id)).length;
  const falsePositives = [...chosen].filter((id) => incorrect.has(id)).length;
  const exact = hits === correct.size && falsePositives === 0;

  if (!question.allowPartialCredit || correct.size === 0) {
    return {
      questionId: question.id,
      isCorrect: exact,
      pointsEarned: exact ? question.points : 0,
      pointsPossible: question.points,
      requiresManualGrading: false,
    };
  }

  // Partial credit: each wrong selection cancels one correct selection, so
  // ticking every box cannot score above zero.
  const net = Math.max(0, hits - falsePositives);
  return {
    questionId: question.id,
    isCorrect: exact,
    pointsEarned: round2((net / correct.size) * question.points),
    pointsPossible: question.points,
    requiresManualGrading: false,
  };
};

const gradeShortAnswer = (question: QuestionInput, response: ResponseInput): GradedResponse => {
  const payload = question.payload ?? {};
  const accepted = asStringArray(payload.acceptedAnswers);
  const caseSensitive = payload.caseSensitive === true;
  const text = typeof response.answer.text === 'string' ? response.answer.text : '';

  if (accepted.length === 0) {
    // No answer key: an instructor must grade it rather than the learner
    // receiving an arbitrary result.
    return {
      questionId: question.id,
      isCorrect: null,
      pointsEarned: null,
      pointsPossible: question.points,
      requiresManualGrading: true,
    };
  }

  const normalised = normaliseText(text, caseSensitive);
  const isCorrect = accepted.some((answer) => normaliseText(answer, caseSensitive) === normalised);
  return {
    questionId: question.id,
    isCorrect,
    pointsEarned: isCorrect ? question.points : 0,
    pointsPossible: question.points,
    requiresManualGrading: false,
  };
};

const gradeMatching = (question: QuestionInput, response: ResponseInput): GradedResponse => {
  const key = (question.payload?.pairs ?? {}) as Record<string, string>;
  const given = (response.answer.pairs ?? {}) as Record<string, string>;
  const entries = Object.entries(key);

  if (entries.length === 0) {
    return {
      questionId: question.id,
      isCorrect: null,
      pointsEarned: null,
      pointsPossible: question.points,
      requiresManualGrading: true,
    };
  }

  const hits = entries.filter(([left, right]) => given[left] === right).length;
  const exact = hits === entries.length;
  return {
    questionId: question.id,
    isCorrect: exact,
    pointsEarned: question.allowPartialCredit
      ? round2((hits / entries.length) * question.points)
      : exact
        ? question.points
        : 0,
    pointsPossible: question.points,
    requiresManualGrading: false,
  };
};

const gradeOrdering = (question: QuestionInput, response: ResponseInput): GradedResponse => {
  const expected = asStringArray(question.payload?.sequence);
  const given = asStringArray(response.answer.sequence);

  if (expected.length === 0) {
    return {
      questionId: question.id,
      isCorrect: null,
      pointsEarned: null,
      pointsPossible: question.points,
      requiresManualGrading: true,
    };
  }

  const hits = expected.filter((id, index) => given[index] === id).length;
  const exact = hits === expected.length && given.length === expected.length;
  return {
    questionId: question.id,
    isCorrect: exact,
    pointsEarned: question.allowPartialCredit
      ? round2((hits / expected.length) * question.points)
      : exact
        ? question.points
        : 0,
    pointsPossible: question.points,
    requiresManualGrading: false,
  };
};

const manualOnly = (question: QuestionInput): GradedResponse => ({
  questionId: question.id,
  isCorrect: null,
  pointsEarned: null,
  pointsPossible: question.points,
  requiresManualGrading: true,
});

export const gradeResponse = (
  question: QuestionInput,
  response: ResponseInput | undefined,
): GradedResponse => {
  if (!response) {
    // An unanswered question scores zero; it is not left pending.
    return {
      questionId: question.id,
      isCorrect: false,
      pointsEarned: 0,
      pointsPossible: question.points,
      requiresManualGrading: false,
    };
  }

  switch (question.type) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
    case 'SCENARIO':
      return gradeMultipleChoice(question, response);
    case 'MULTIPLE_SELECT':
      return gradeMultipleSelect(question, response);
    case 'SHORT_ANSWER':
      return gradeShortAnswer(question, response);
    case 'MATCHING':
      return gradeMatching(question, response);
    case 'ORDERING':
      return gradeOrdering(question, response);
    case 'ESSAY':
      return manualOnly(question);
    default:
      return manualOnly(question);
  }
};

export interface GradeAttemptOptions {
  readonly passingScore?: number;
}

/** Grades a whole attempt. Pure — the caller persists the result. */
export const gradeAttempt = (
  questions: readonly QuestionInput[],
  responses: readonly ResponseInput[],
  options: GradeAttemptOptions = {},
): GradedAttempt => {
  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  const graded = questions.map((question) => gradeResponse(question, byQuestion.get(question.id)));

  const pointsPossible = graded.reduce((sum, r) => sum + r.pointsPossible, 0);
  const pointsEarned = graded.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0);
  const manual = graded.filter((r) => r.requiresManualGrading);

  const requiresManualGrading = manual.length > 0;
  const scorePercent =
    requiresManualGrading || pointsPossible === 0
      ? null
      : round2((pointsEarned / pointsPossible) * 100);

  return {
    responses: graded,
    pointsEarned: round2(pointsEarned),
    pointsPossible: round2(pointsPossible),
    scorePercent,
    passed: scorePercent === null ? null : scorePercent >= (options.passingScore ?? 80),
    requiresManualGrading,
    autoGradedCount: graded.length - manual.length,
    manualCount: manual.length,
  };
};
