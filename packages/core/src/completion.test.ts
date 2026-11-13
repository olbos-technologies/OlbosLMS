import { describe, expect, it } from 'vitest';
import { evaluateCompletion } from './completion.js';

describe('online self-paced course', () => {
  const rules = { requiresFinalAssessment: true, passingScore: 80, maxAttempts: 3 };

  it('blocks while lessons remain', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 5,
      completedRequiredLessonCount: 3,
    });
    expect(result.complete).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain('LESSONS_INCOMPLETE');
    expect(result.blockers[0]!.message).toBe('2 required lesson(s) remaining');
  });

  it('blocks when the final assessment has not been attempted', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 2,
      completedRequiredLessonCount: 2,
    });
    expect(result.blockers.map((b) => b.code)).toEqual(['FINAL_ASSESSMENT_NOT_TAKEN']);
  });

  it('blocks with an explanatory score when the assessment was failed', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 2,
      completedRequiredLessonCount: 2,
      finalAssessmentAttempts: 1,
      finalAssessmentPassed: false,
      finalAssessmentScore: 65,
    });
    expect(result.blockers[0]!.code).toBe('FINAL_ASSESSMENT_NOT_PASSED');
    expect(result.blockers[0]!.message).toBe('Score 65% is below the passing score of 80%');
    expect(result.locked).toBe(false);
  });

  it('locks the learner out once attempts are exhausted', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 2,
      completedRequiredLessonCount: 2,
      finalAssessmentAttempts: 3,
      finalAssessmentPassed: false,
      finalAssessmentScore: 70,
    });
    expect(result.locked).toBe(true);
    expect(result.blockers[0]!.code).toBe('ATTEMPTS_EXHAUSTED');
  });

  it('completes when lessons and the assessment are done', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 2,
      completedRequiredLessonCount: 2,
      finalAssessmentAttempts: 2,
      finalAssessmentPassed: true,
      finalAssessmentScore: 88,
    });
    expect(result.complete).toBe(true);
    expect(result.progressPercent).toBe(100);
    expect(result.blockers).toEqual([]);
  });
});

describe('instructor-led course', () => {
  const rules = { requiresAttendance: true, requiresFinalAssessment: true, passingScore: 70 };

  it('blocks without attendance', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 0,
      completedRequiredLessonCount: 0,
      finalAssessmentPassed: true,
      finalAssessmentAttempts: 1,
    });
    expect(result.blockers.map((b) => b.code)).toEqual(['ATTENDANCE_MISSING']);
  });

  it('completes with attendance and a passing assessment', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 0,
      completedRequiredLessonCount: 0,
      attendanceRecorded: true,
      finalAssessmentPassed: true,
      finalAssessmentAttempts: 1,
    });
    expect(result.complete).toBe(true);
  });
});

describe('blended course with a practical demonstration', () => {
  const rules = {
    requiresFinalAssessment: true,
    requiresAttendance: true,
    requiresPracticalAssessment: true,
    requiresInstructorSignoff: true,
    passingScore: 80,
  };

  const done = {
    requiredLessonCount: 3,
    completedRequiredLessonCount: 3,
    attendanceRecorded: true,
    finalAssessmentPassed: true,
    finalAssessmentAttempts: 1,
    practicalAssessmentPassed: true,
    instructorSignedOffAt: new Date('2026-06-01T00:00:00Z'),
  };

  it('completes only when every gate is met', () => {
    expect(evaluateCompletion(rules, done).complete).toBe(true);
  });

  it('blocks on a failed practical assessment', () => {
    const result = evaluateCompletion(rules, { ...done, practicalAssessmentPassed: false });
    expect(result.blockers[0]!.code).toBe('PRACTICAL_NOT_PASSED');
    expect(result.blockers[0]!.message).toMatch(/was not passed/);
  });

  it('blocks when no practical assessment exists at all', () => {
    const result = evaluateCompletion(rules, { ...done, practicalAssessmentPassed: null });
    expect(result.blockers[0]!.message).toMatch(/is required/);
  });

  it('blocks without instructor verification', () => {
    const result = evaluateCompletion(rules, { ...done, instructorSignedOffAt: null });
    expect(result.blockers.map((b) => b.code)).toEqual(['INSTRUCTOR_SIGNOFF_MISSING']);
  });

  it('reports every outstanding gate at once', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 3,
      completedRequiredLessonCount: 1,
    });
    expect(result.blockers.map((b) => b.code).sort()).toEqual([
      'ATTENDANCE_MISSING',
      'FINAL_ASSESSMENT_NOT_TAKEN',
      'INSTRUCTOR_SIGNOFF_MISSING',
      'LESSONS_INCOMPLETE',
      'PRACTICAL_NOT_PASSED',
    ]);
  });

  it('never reports 100% progress while a gate is open', () => {
    const result = evaluateCompletion(rules, {
      requiredLessonCount: 3,
      completedRequiredLessonCount: 3,
      attendanceRecorded: true,
      finalAssessmentPassed: true,
      finalAssessmentAttempts: 1,
      practicalAssessmentPassed: true,
      instructorSignedOffAt: null,
    });
    expect(result.complete).toBe(false);
    expect(result.progressPercent).toBeLessThan(100);
    expect(result.progressPercent).toBe(86);
  });
});

describe('course with no gates', () => {
  it('is complete immediately', () => {
    const result = evaluateCompletion(
      {},
      { requiredLessonCount: 0, completedRequiredLessonCount: 0 },
    );
    expect(result.complete).toBe(true);
    expect(result.progressPercent).toBe(100);
  });
});
