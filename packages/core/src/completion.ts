/**
 * Course completion rules (§8, §11).
 *
 * A course is complete only when every gate its version declares is satisfied.
 * The engine returns the outstanding blockers so the learner UI can say exactly
 * what is left rather than showing an inert progress bar.
 */

export interface CompletionRules {
  readonly requireAllRequiredLessons?: boolean;
  readonly requiresFinalAssessment?: boolean;
  readonly passingScore?: number | null;
  readonly maxAttempts?: number | null;
  readonly requiresAttendance?: boolean;
  readonly requiresPracticalAssessment?: boolean;
  readonly requiresInstructorSignoff?: boolean;
}

export interface CompletionSignals {
  readonly requiredLessonCount: number;
  readonly completedRequiredLessonCount: number;
  readonly finalAssessmentScore?: number | null;
  readonly finalAssessmentPassed?: boolean | null;
  readonly finalAssessmentAttempts?: number;
  readonly attendanceRecorded?: boolean;
  readonly practicalAssessmentPassed?: boolean | null;
  readonly instructorSignedOffAt?: Date | null;
}

export type CompletionBlockerCode =
  | 'LESSONS_INCOMPLETE'
  | 'FINAL_ASSESSMENT_NOT_TAKEN'
  | 'FINAL_ASSESSMENT_NOT_PASSED'
  | 'ATTEMPTS_EXHAUSTED'
  | 'ATTENDANCE_MISSING'
  | 'PRACTICAL_NOT_PASSED'
  | 'INSTRUCTOR_SIGNOFF_MISSING';

export interface CompletionBlocker {
  readonly code: CompletionBlockerCode;
  readonly message: string;
}

export interface CompletionEvaluation {
  readonly complete: boolean;
  readonly passed: boolean;
  readonly progressPercent: number;
  readonly blockers: CompletionBlocker[];
  /** True when the learner can no longer complete without intervention. */
  readonly locked: boolean;
}

export const evaluateCompletion = (
  rules: CompletionRules,
  signals: CompletionSignals,
): CompletionEvaluation => {
  const blockers: CompletionBlocker[] = [];
  let locked = false;

  const requireLessons = rules.requireAllRequiredLessons ?? true;
  const lessonsDone =
    signals.requiredLessonCount === 0 ||
    signals.completedRequiredLessonCount >= signals.requiredLessonCount;

  if (requireLessons && !lessonsDone) {
    const remaining = signals.requiredLessonCount - signals.completedRequiredLessonCount;
    blockers.push({
      code: 'LESSONS_INCOMPLETE',
      message: `${remaining} required lesson(s) remaining`,
    });
  }

  if (rules.requiresFinalAssessment && signals.finalAssessmentPassed !== true) {
    const attempts = signals.finalAssessmentAttempts ?? 0;
    if (attempts === 0) {
      blockers.push({
        code: 'FINAL_ASSESSMENT_NOT_TAKEN',
        message: 'The final assessment has not been attempted',
      });
    } else if (rules.maxAttempts != null && attempts >= rules.maxAttempts) {
      locked = true;
      blockers.push({
        code: 'ATTEMPTS_EXHAUSTED',
        message: `All ${rules.maxAttempts} assessment attempts have been used`,
      });
    } else {
      const score = signals.finalAssessmentScore;
      blockers.push({
        code: 'FINAL_ASSESSMENT_NOT_PASSED',
        message:
          score == null
            ? 'The final assessment has not been graded'
            : `Score ${score}% is below the passing score of ${rules.passingScore ?? 80}%`,
      });
    }
  }

  if (rules.requiresAttendance && !signals.attendanceRecorded) {
    blockers.push({
      code: 'ATTENDANCE_MISSING',
      message: 'Attendance has not been recorded for the required session',
    });
  }

  if (rules.requiresPracticalAssessment && signals.practicalAssessmentPassed !== true) {
    blockers.push({
      code: 'PRACTICAL_NOT_PASSED',
      message:
        signals.practicalAssessmentPassed === false
          ? 'The practical assessment was not passed'
          : 'A practical skills assessment is required',
    });
  }

  if (rules.requiresInstructorSignoff && !signals.instructorSignedOffAt) {
    blockers.push({
      code: 'INSTRUCTOR_SIGNOFF_MISSING',
      message: 'An instructor has not verified completion',
    });
  }

  // Progress counts every gate the course declares, not just lessons, so the
  // bar cannot sit at 100% while an assessment is still outstanding.
  const gates: boolean[] = [];
  if (requireLessons && signals.requiredLessonCount > 0) {
    for (let index = 0; index < signals.requiredLessonCount; index += 1) {
      gates.push(index < signals.completedRequiredLessonCount);
    }
  }
  if (rules.requiresFinalAssessment) gates.push(signals.finalAssessmentPassed === true);
  if (rules.requiresAttendance) gates.push(signals.attendanceRecorded === true);
  if (rules.requiresPracticalAssessment) gates.push(signals.practicalAssessmentPassed === true);
  if (rules.requiresInstructorSignoff) gates.push(!!signals.instructorSignedOffAt);

  const progressPercent =
    gates.length === 0 ? 100 : Math.round((gates.filter(Boolean).length / gates.length) * 100);

  const complete = blockers.length === 0;
  return { complete, passed: complete, progressPercent, blockers, locked };
};
