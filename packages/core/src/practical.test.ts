import { describe, expect, it } from 'vitest';
import {
  isPracticalComplete,
  scorePracticalAssessment,
  type CriterionEntry,
  type PracticalCriterion,
} from './practical.js';

/** The Lockout/Tagout practical from the product specification (§16). */
const lotoCriteria: PracticalCriterion[] = [
  { id: 'c1', text: 'Identifies energy sources', isCritical: true },
  { id: 'c2', text: 'Notifies affected employees' },
  { id: 'c3', text: 'Shuts down equipment' },
  { id: 'c4', text: 'Applies lock/tag', isCritical: true },
  { id: 'c5', text: 'Verifies zero energy', isCritical: true },
  { id: 'c6', text: 'Performs work safely' },
  { id: 'c7', text: 'Restores equipment' },
];

const allPass: CriterionEntry[] = lotoCriteria.map((c) => ({ criterionId: c.id, result: 'PASS' }));

describe('scorePracticalAssessment', () => {
  it('passes when every criterion is met', () => {
    const score = scorePracticalAssessment(lotoCriteria, allPass);
    expect(score.passed).toBe(true);
    expect(score.scorePercent).toBe(100);
    expect(score.passedCount).toBe(7);
    expect(score.reason).toMatch(/Every applicable criterion/);
  });

  it('fails on any criterion when all are required', () => {
    const entries = allPass.map((e) =>
      e.criterionId === 'c7' ? { ...e, result: 'FAIL' as const } : e,
    );
    const score = scorePracticalAssessment(lotoCriteria, entries);
    expect(score.passed).toBe(false);
    expect(score.failedCount).toBe(1);
    expect(score.failedCriticalIds).toEqual([]);
  });

  it('fails outright when a critical criterion fails, whatever the score', () => {
    const entries = allPass.map((e) =>
      e.criterionId === 'c5' ? { ...e, result: 'FAIL' as const } : e,
    );
    const score = scorePracticalAssessment(lotoCriteria, entries, {
      requireAllCriteria: false,
      passingPercent: 80,
    });
    expect(score.scorePercent).toBeGreaterThanOrEqual(80);
    expect(score.passed).toBe(false);
    expect(score.failedCriticalIds).toEqual(['c5']);
    expect(score.reason).toBe('A critical criterion was not met');
  });

  it('removes N/A criteria from the denominator', () => {
    const entries: CriterionEntry[] = [
      ...allPass.slice(0, 6),
      { criterionId: 'c7', result: 'NOT_APPLICABLE' },
    ];
    const score = scorePracticalAssessment(lotoCriteria, entries);
    expect(score.scorePercent).toBe(100);
    expect(score.notApplicableCount).toBe(1);
    expect(score.passed).toBe(true);
  });

  it('refuses to pass a partially assessed form', () => {
    const score = scorePracticalAssessment(lotoCriteria, allPass.slice(0, 4));
    expect(score.passed).toBe(false);
    expect(score.unscoredCriterionIds).toEqual(['c5', 'c6', 'c7']);
    expect(score.reason).toMatch(/have not been assessed/);
  });

  it('supports a percentage threshold when not every criterion is mandatory', () => {
    const entries = allPass.map((e) =>
      e.criterionId === 'c7' ? { ...e, result: 'FAIL' as const } : e,
    );
    const score = scorePracticalAssessment(lotoCriteria, entries, {
      requireAllCriteria: false,
      passingPercent: 80,
    });
    expect(score.scorePercent).toBe(85.7);
    expect(score.passed).toBe(true);
    expect(score.reason).toMatch(/meets the 80% threshold/);
  });

  it('honours criterion weights', () => {
    const weighted: PracticalCriterion[] = [
      { id: 'a', text: 'Minor step', weight: 1 },
      { id: 'b', text: 'Major step', weight: 4 },
    ];
    const score = scorePracticalAssessment(
      weighted,
      [
        { criterionId: 'a', result: 'PASS' },
        { criterionId: 'b', result: 'FAIL' },
      ],
      { requireAllCriteria: false, passingPercent: 50 },
    );
    expect(score.scorePercent).toBe(20);
    expect(score.passed).toBe(false);
  });

  it('reports no score for an assessment where everything is N/A', () => {
    const score = scorePracticalAssessment(
      [{ id: 'a', text: 'Step' }],
      [{ criterionId: 'a', result: 'NOT_APPLICABLE' }],
    );
    expect(score.scorePercent).toBeNull();
    expect(score.passed).toBe(true);
  });
});

describe('isPracticalComplete', () => {
  const score = scorePracticalAssessment(lotoCriteria, allPass);

  it('requires both signatures by default', () => {
    const result = isPracticalComplete(score, {});
    expect(result.complete).toBe(false);
    expect(result.blockers).toEqual([
      'The assessor has not signed the assessment',
      'The employee has not acknowledged the assessment',
    ]);
  });

  it('is complete once both parties have signed', () => {
    const result = isPracticalComplete(score, {
      assessorSignedAt: new Date(),
      employeeAcknowledgedAt: new Date(),
    });
    expect(result.complete).toBe(true);
  });

  it('can waive the employee acknowledgement per template', () => {
    const result = isPracticalComplete(
      score,
      { assessorSignedAt: new Date() },
      { requiresEmployeeAcknowledgment: false },
    );
    expect(result.complete).toBe(true);
  });

  it('blocks while criteria are unassessed', () => {
    const partial = scorePracticalAssessment(lotoCriteria, allPass.slice(0, 2));
    const result = isPracticalComplete(partial, {
      assessorSignedAt: new Date(),
      employeeAcknowledgedAt: new Date(),
    });
    expect(result.complete).toBe(false);
    expect(result.blockers[0]).toMatch(/Not every criterion/);
  });
});
