import { describe, expect, it } from 'vitest';
import { academyMetadata, weekOneLessons, weekOneQuestions } from './academy-content.js';
describe('Week 1 draft package', () => {
  it('contains seven substantive lessons and twenty original stable questions', () => {
    expect(weekOneLessons).toHaveLength(7);
    expect(weekOneQuestions).toHaveLength(20);
    expect(new Set(weekOneQuestions.map((q) => q.stableId)).size).toBe(20);
    expect(new Set(weekOneQuestions.map((q) => q.prompt)).size).toBe(20);
    for (const q of weekOneQuestions) {
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(q.options.every((o) => o.feedback.length > 20)).toBe(true);
      expect(['1.1', '2.2']).toContain(q.objectiveId);
    }
    expect(academyMetadata.domains.reduce((sum, d) => sum + d.weight, 0)).toBe(100);
    expect(academyMetadata.scope).toContain('not yet available');
  });
});
