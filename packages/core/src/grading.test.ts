import { describe, expect, it } from 'vitest';
import {
  applyLatePenalty,
  assessLateness,
  calculateCourseGrade,
  diffGrade,
  letterFor,
  type GradeCategory,
  type GradeEntry,
} from './grading.js';

const grade = (o: Partial<GradeEntry> & { id: string }): GradeEntry => ({
  pointsEarned: 0,
  pointsPossible: 100,
  ...o,
});

describe('letterFor', () => {
  it('maps percentages to the default scale', () => {
    expect(letterFor(95)).toBe('A');
    expect(letterFor(93)).toBe('A');
    expect(letterFor(92.9)).toBe('A-');
    expect(letterFor(80)).toBe('B-');
    expect(letterFor(59.9)).toBe('F');
    expect(letterFor(0)).toBe('F');
  });

  it('returns null with no percentage', () => {
    expect(letterFor(null)).toBeNull();
  });

  it('honours a custom scale', () => {
    const scale = [
      { letter: 'PASS', minPercent: 70 },
      { letter: 'FAIL', minPercent: 0 },
    ];
    expect(letterFor(72, scale)).toBe('PASS');
    expect(letterFor(69, scale)).toBe('FAIL');
  });
});

describe('calculateCourseGrade without categories', () => {
  it('totals points', () => {
    const result = calculateCourseGrade([
      grade({ id: '1', pointsEarned: 90, pointsPossible: 100 }),
      grade({ id: '2', pointsEarned: 40, pointsPossible: 50 }),
    ]);
    expect(result.pointsEarned).toBe(130);
    expect(result.pointsPossible).toBe(150);
    expect(result.percent).toBe(86.67);
    expect(result.letter).toBe('B');
  });

  it('excludes excused work from the denominator', () => {
    const result = calculateCourseGrade([
      grade({ id: '1', pointsEarned: 90, pointsPossible: 100 }),
      grade({ id: '2', pointsEarned: null, pointsPossible: 100, isExcused: true }),
    ]);
    expect(result.pointsPossible).toBe(100);
    expect(result.percent).toBe(90);
  });

  it('scores ungraded work as pending rather than zero', () => {
    const result = calculateCourseGrade([
      grade({ id: '1', pointsEarned: 90, pointsPossible: 100 }),
      grade({ id: '2', pointsEarned: null, pointsPossible: 100 }),
    ]);
    expect(result.percent).toBe(90);
  });

  it('adds extra credit to the numerator only', () => {
    const result = calculateCourseGrade([
      grade({ id: '1', pointsEarned: 90, pointsPossible: 100 }),
      grade({ id: '2', pointsEarned: 5, pointsPossible: 5, isExtraCredit: true }),
    ]);
    expect(result.pointsPossible).toBe(100);
    expect(result.percent).toBe(95);
  });

  it('returns null with nothing graded', () => {
    expect(calculateCourseGrade([]).percent).toBeNull();
  });
});

describe('calculateCourseGrade with weighted categories', () => {
  const categories: GradeCategory[] = [
    { id: 'hw', name: 'Homework', weightPercent: 30 },
    { id: 'quiz', name: 'Quizzes', weightPercent: 30 },
    { id: 'final', name: 'Final Exam', weightPercent: 40 },
  ];

  it('weights each category', () => {
    const result = calculateCourseGrade(
      [
        grade({ id: '1', categoryId: 'hw', pointsEarned: 100, pointsPossible: 100 }),
        grade({ id: '2', categoryId: 'quiz', pointsEarned: 80, pointsPossible: 100 }),
        grade({ id: '3', categoryId: 'final', pointsEarned: 70, pointsPossible: 100 }),
      ],
      { categories },
    );
    // 100*0.3 + 80*0.3 + 70*0.4 = 82
    expect(result.percent).toBe(82);
    expect(result.weightsNormalised).toBe(false);
  });

  it('renormalises when a category has no graded work yet', () => {
    const result = calculateCourseGrade(
      [
        grade({ id: '1', categoryId: 'hw', pointsEarned: 100, pointsPossible: 100 }),
        grade({ id: '2', categoryId: 'quiz', pointsEarned: 80, pointsPossible: 100 }),
      ],
      { categories },
    );
    // Only 60 points of weight are in play; rescaled to 50/50.
    expect(result.percent).toBe(90);
    expect(result.weightsNormalised).toBe(true);
    expect(result.categories.find((c) => c.categoryId === 'final')!.effectiveWeightPercent).toBe(0);
  });

  it('renormalises weights that do not sum to 100', () => {
    const result = calculateCourseGrade(
      [
        grade({ id: '1', categoryId: 'a', pointsEarned: 100, pointsPossible: 100 }),
        grade({ id: '2', categoryId: 'b', pointsEarned: 50, pointsPossible: 100 }),
      ],
      {
        categories: [
          { id: 'a', name: 'A', weightPercent: 60 },
          { id: 'b', name: 'B', weightPercent: 60 },
        ],
      },
    );
    expect(result.percent).toBe(75);
    expect(result.weightsNormalised).toBe(true);
  });

  it('drops the lowest score when configured', () => {
    const result = calculateCourseGrade(
      [
        grade({ id: '1', categoryId: 'hw', pointsEarned: 100, pointsPossible: 100 }),
        grade({ id: '2', categoryId: 'hw', pointsEarned: 100, pointsPossible: 100 }),
        grade({ id: '3', categoryId: 'hw', pointsEarned: 0, pointsPossible: 100 }),
      ],
      { categories: [{ id: 'hw', name: 'Homework', weightPercent: 100, dropLowest: 1 }] },
    );
    expect(result.percent).toBe(100);
    expect(result.categories[0]!.droppedGradeIds).toEqual(['3']);
  });

  it('never drops more than there are scores', () => {
    const result = calculateCourseGrade(
      [grade({ id: '1', categoryId: 'hw', pointsEarned: 50, pointsPossible: 100 })],
      { categories: [{ id: 'hw', name: 'Homework', weightPercent: 100, dropLowest: 3 }] },
    );
    expect(result.percent).toBe(50);
    expect(result.categories[0]!.droppedGradeIds).toEqual([]);
  });

  it('never drops extra credit', () => {
    const result = calculateCourseGrade(
      [
        grade({ id: '1', categoryId: 'hw', pointsEarned: 100, pointsPossible: 100 }),
        grade({
          id: '2',
          categoryId: 'hw',
          pointsEarned: 1,
          pointsPossible: 10,
          isExtraCredit: true,
        }),
        grade({ id: '3', categoryId: 'hw', pointsEarned: 60, pointsPossible: 100 }),
      ],
      { categories: [{ id: 'hw', name: 'Homework', weightPercent: 100, dropLowest: 1 }] },
    );
    expect(result.categories[0]!.droppedGradeIds).toEqual(['3']);
    expect(result.percent).toBe(101);
  });
});

describe('assessLateness', () => {
  const due = new Date('2026-06-10T23:59:00Z');

  it('is not late when submitted on the due date', () => {
    const result = assessLateness(new Date('2026-06-10T08:00:00Z'), due);
    expect(result.isLate).toBe(false);
    expect(result.penaltyPercent).toBe(0);
  });

  it('counts whole days late', () => {
    const result = assessLateness(new Date('2026-06-13T01:00:00Z'), due, {
      penaltyPercentPerDay: 10,
    });
    expect(result.lateDays).toBe(3);
    expect(result.penaltyPercent).toBe(30);
    expect(result.accepted).toBe(true);
  });

  it('rejects late work when the policy forbids it', () => {
    const result = assessLateness(new Date('2026-06-11T01:00:00Z'), due, { allowLate: false });
    expect(result.accepted).toBe(false);
    expect(result.penaltyPercent).toBe(100);
  });

  it('rejects work beyond the maximum late window', () => {
    const result = assessLateness(new Date('2026-06-20T01:00:00Z'), due, {
      penaltyPercentPerDay: 10,
      maxLateDays: 5,
    });
    expect(result.accepted).toBe(false);
  });

  it('caps the penalty at 100 percent', () => {
    const result = assessLateness(new Date('2026-08-10T01:00:00Z'), due, {
      penaltyPercentPerDay: 10,
    });
    expect(result.penaltyPercent).toBe(100);
  });

  it('treats an assignment with no due date as never late', () => {
    expect(assessLateness(new Date(), null).isLate).toBe(false);
  });
});

describe('applyLatePenalty', () => {
  it('deducts a percentage of the possible points', () => {
    expect(applyLatePenalty(90, 100, 20)).toBe(70);
  });

  it('never returns a negative score', () => {
    expect(applyLatePenalty(10, 100, 50)).toBe(0);
  });

  it('is a no-op without a penalty', () => {
    expect(applyLatePenalty(90, 100, 0)).toBe(90);
  });
});

describe('diffGrade', () => {
  it('reports only the fields that changed', () => {
    const changes = diffGrade(
      { pointsEarned: 80, isExcused: false, feedback: 'Good' },
      { pointsEarned: 90, isExcused: false, feedback: 'Good' },
    );
    expect(changes).toEqual([{ field: 'pointsEarned', from: 80, to: 90 }]);
  });

  it('records an excusal', () => {
    const changes = diffGrade({ isExcused: false }, { isExcused: true });
    expect(changes).toEqual([{ field: 'isExcused', from: false, to: true }]);
  });

  it('returns nothing when nothing changed', () => {
    expect(diffGrade({ pointsEarned: 80 }, { pointsEarned: 80 })).toEqual([]);
  });
});
