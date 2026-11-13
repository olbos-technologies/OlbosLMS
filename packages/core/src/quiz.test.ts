import { describe, expect, it } from 'vitest';
import { gradeAttempt, gradeResponse, type QuestionInput } from './quiz.js';

const mc: QuestionInput = {
  id: 'q-mc',
  type: 'MULTIPLE_CHOICE',
  points: 10,
  options: [
    { id: 'a', isCorrect: false },
    { id: 'b', isCorrect: true },
    { id: 'c', isCorrect: false },
  ],
};

const ms: QuestionInput = {
  id: 'q-ms',
  type: 'MULTIPLE_SELECT',
  points: 10,
  allowPartialCredit: true,
  options: [
    { id: 'a', isCorrect: true },
    { id: 'b', isCorrect: true },
    { id: 'c', isCorrect: false },
    { id: 'd', isCorrect: false },
  ],
};

describe('multiple choice', () => {
  it('scores a correct answer', () => {
    const result = gradeResponse(mc, { questionId: mc.id, answer: { optionId: 'b' } });
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it('scores an incorrect answer as zero', () => {
    const result = gradeResponse(mc, { questionId: mc.id, answer: { optionId: 'a' } });
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it('scores a skipped question as zero without manual grading', () => {
    const result = gradeResponse(mc, undefined);
    expect(result.isCorrect).toBe(false);
    expect(result.requiresManualGrading).toBe(false);
  });
});

describe('true/false and scenario questions reuse single-choice scoring', () => {
  it('grades a true/false question', () => {
    const tf: QuestionInput = {
      id: 'tf',
      type: 'TRUE_FALSE',
      points: 5,
      options: [
        { id: 'true', isCorrect: true },
        { id: 'false', isCorrect: false },
      ],
    };
    expect(gradeResponse(tf, { questionId: 'tf', answer: { optionId: 'true' } }).pointsEarned).toBe(
      5,
    );
  });
});

describe('multiple select', () => {
  it('awards full marks for the exact set', () => {
    const result = gradeResponse(ms, { questionId: ms.id, answer: { optionIds: ['a', 'b'] } });
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it('awards partial credit for a subset', () => {
    const result = gradeResponse(ms, { questionId: ms.id, answer: { optionIds: ['a'] } });
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(5);
  });

  it('cancels a correct pick with an incorrect one', () => {
    const result = gradeResponse(ms, { questionId: ms.id, answer: { optionIds: ['a', 'c'] } });
    expect(result.pointsEarned).toBe(0);
  });

  it('gives nothing for ticking every box', () => {
    const result = gradeResponse(ms, {
      questionId: ms.id,
      answer: { optionIds: ['a', 'b', 'c', 'd'] },
    });
    expect(result.pointsEarned).toBe(0);
  });

  it('is all-or-nothing when partial credit is off', () => {
    const strict = { ...ms, allowPartialCredit: false };
    expect(
      gradeResponse(strict, { questionId: ms.id, answer: { optionIds: ['a'] } }).pointsEarned,
    ).toBe(0);
  });
});

describe('short answer', () => {
  const sa: QuestionInput = {
    id: 'sa',
    type: 'SHORT_ANSWER',
    points: 4,
    payload: { acceptedAnswers: ['Lockout/Tagout', 'LOTO'] },
  };

  it('accepts a listed answer regardless of case and spacing', () => {
    expect(gradeResponse(sa, { questionId: 'sa', answer: { text: '  loto ' } }).isCorrect).toBe(
      true,
    );
    expect(
      gradeResponse(sa, { questionId: 'sa', answer: { text: 'lockout/tagout' } }).isCorrect,
    ).toBe(true);
  });

  it('rejects an unlisted answer', () => {
    expect(gradeResponse(sa, { questionId: 'sa', answer: { text: 'padlock' } }).isCorrect).toBe(
      false,
    );
  });

  it('respects case sensitivity when configured', () => {
    const strict: QuestionInput = {
      ...sa,
      payload: { acceptedAnswers: ['LOTO'], caseSensitive: true },
    };
    expect(gradeResponse(strict, { questionId: 'sa', answer: { text: 'loto' } }).isCorrect).toBe(
      false,
    );
  });

  it('defers to a human when there is no answer key', () => {
    const open: QuestionInput = { ...sa, payload: {} };
    const result = gradeResponse(open, { questionId: 'sa', answer: { text: 'anything' } });
    expect(result.requiresManualGrading).toBe(true);
    expect(result.isCorrect).toBeNull();
    expect(result.pointsEarned).toBeNull();
  });
});

describe('matching and ordering', () => {
  const matching: QuestionInput = {
    id: 'm',
    type: 'MATCHING',
    points: 6,
    allowPartialCredit: true,
    payload: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3' } },
  };

  it('awards full marks for a complete match', () => {
    const result = gradeResponse(matching, {
      questionId: 'm',
      answer: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3' } },
    });
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(6);
  });

  it('awards partial credit per correct pair', () => {
    const result = gradeResponse(matching, {
      questionId: 'm',
      answer: { pairs: { l1: 'r1', l2: 'r3', l3: 'r2' } },
    });
    expect(result.pointsEarned).toBe(2);
  });

  const ordering: QuestionInput = {
    id: 'o',
    type: 'ORDERING',
    points: 4,
    payload: { sequence: ['s1', 's2', 's3', 's4'] },
  };

  it('requires the exact sequence without partial credit', () => {
    expect(
      gradeResponse(ordering, { questionId: 'o', answer: { sequence: ['s1', 's2', 's3', 's4'] } })
        .pointsEarned,
    ).toBe(4);
    expect(
      gradeResponse(ordering, { questionId: 'o', answer: { sequence: ['s2', 's1', 's3', 's4'] } })
        .pointsEarned,
    ).toBe(0);
  });

  it('awards position-by-position credit when enabled', () => {
    const partial = { ...ordering, allowPartialCredit: true };
    expect(
      gradeResponse(partial, { questionId: 'o', answer: { sequence: ['s1', 's2', 's4', 's3'] } })
        .pointsEarned,
    ).toBe(2);
  });
});

describe('essays', () => {
  it('always requires manual grading', () => {
    const essay: QuestionInput = { id: 'e', type: 'ESSAY', points: 20 };
    const result = gradeResponse(essay, { questionId: 'e', answer: { text: 'A long answer' } });
    expect(result.requiresManualGrading).toBe(true);
    expect(result.pointsEarned).toBeNull();
  });
});

describe('gradeAttempt', () => {
  it('scores an entirely objective quiz', () => {
    const attempt = gradeAttempt(
      [mc, ms],
      [
        { questionId: 'q-mc', answer: { optionId: 'b' } },
        { questionId: 'q-ms', answer: { optionIds: ['a', 'b'] } },
      ],
      { passingScore: 80 },
    );
    expect(attempt.pointsEarned).toBe(20);
    expect(attempt.pointsPossible).toBe(20);
    expect(attempt.scorePercent).toBe(100);
    expect(attempt.passed).toBe(true);
    expect(attempt.requiresManualGrading).toBe(false);
  });

  it('fails an attempt below the passing score', () => {
    const attempt = gradeAttempt(
      [mc, ms],
      [
        { questionId: 'q-mc', answer: { optionId: 'a' } },
        { questionId: 'q-ms', answer: { optionIds: ['a'] } },
      ],
      { passingScore: 80 },
    );
    expect(attempt.scorePercent).toBe(25);
    expect(attempt.passed).toBe(false);
  });

  it('withholds a score while an essay is unmarked', () => {
    const essay: QuestionInput = { id: 'e', type: 'ESSAY', points: 20 };
    const attempt = gradeAttempt(
      [mc, essay],
      [
        { questionId: 'q-mc', answer: { optionId: 'b' } },
        { questionId: 'e', answer: { text: 'words' } },
      ],
    );
    expect(attempt.scorePercent).toBeNull();
    expect(attempt.passed).toBeNull();
    expect(attempt.requiresManualGrading).toBe(true);
    expect(attempt.manualCount).toBe(1);
    expect(attempt.autoGradedCount).toBe(1);
  });

  it('scores unanswered questions as zero', () => {
    const attempt = gradeAttempt([mc, ms], [{ questionId: 'q-mc', answer: { optionId: 'b' } }]);
    expect(attempt.pointsEarned).toBe(10);
    expect(attempt.scorePercent).toBe(50);
  });
});
