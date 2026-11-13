import { describe, expect, it } from 'vitest';
import { assessRisk } from './risk.js';

describe('assessRisk', () => {
  it('reports LOW risk with no outstanding issues', () => {
    const result = assessRisk({});
    expect(result.level).toBe('LOW');
    expect(result.score).toBe(0);
    expect(result.factors).toEqual([]);
    expect(result.explanation).toBe('No outstanding training issues were found.');
  });

  it('reports MEDIUM risk for a single expired item', () => {
    const result = assessRisk({ expiredTrainingCount: 1 });
    expect(result.score).toBe(25);
    expect(result.level).toBe('MEDIUM');
  });

  it('reports HIGH risk when several signals stack up', () => {
    const result = assessRisk({
      expiredTrainingCount: 2,
      missingRequiredTrainingCount: 1,
      overdueTrainingCount: 1,
    });
    expect(result.score).toBe(50 + 20 + 15);
    expect(result.level).toBe('HIGH');
  });

  it('caps the contribution of any one signal', () => {
    const many = assessRisk({ expiredTrainingCount: 50 });
    const three = assessRisk({ expiredTrainingCount: 3 });
    expect(many.score).toBe(three.score);
    expect(many.factors[0]!.detail).toBe('50 expired items');
  });

  it('caps the total score at 100', () => {
    const result = assessRisk({
      expiredTrainingCount: 10,
      missingRequiredTrainingCount: 10,
      overdueTrainingCount: 10,
      failedAssessmentCount: 10,
      missedSessionCount: 10,
    });
    expect(result.score).toBe(100);
  });

  it('adds an inactivity factor past the threshold', () => {
    expect(assessRisk({ daysSinceLastActivity: 44 }).factors).toEqual([]);
    const result = assessRisk({ daysSinceLastActivity: 60 });
    expect(result.factors[0]!.code).toBe('INACTIVITY');
    expect(result.factors[0]!.detail).toBe('No learning activity for 60 days');
  });

  it('explains every flag in plain language, worst first', () => {
    const result = assessRisk({ expiringWithin30DaysCount: 1, expiredTrainingCount: 1 });
    expect(result.explanation).toBe(
      'Expired training: 1 expired item; Training expiring soon: 1 item expiring within 30 days',
    );
  });

  it('always carries the disclaimer that it is not a judgement of the person', () => {
    expect(assessRisk({ expiredTrainingCount: 3 }).disclaimer).toMatch(
      /prioritisation aid.*not an evaluation of the person/i,
    );
  });

  it('accepts organization-specific weights and thresholds', () => {
    const result = assessRisk(
      { missedSessionCount: 1 },
      { weights: { missedSession: 40 }, thresholds: { medium: 10, high: 30 } },
    );
    expect(result.score).toBe(40);
    expect(result.level).toBe('HIGH');
  });

  it('treats expiring-soon training as a mild signal, not a failure', () => {
    const result = assessRisk({ expiringWithin30DaysCount: 3 });
    expect(result.score).toBe(15);
    expect(result.level).toBe('LOW');
  });
});
