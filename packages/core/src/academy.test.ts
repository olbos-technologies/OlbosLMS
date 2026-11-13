import { describe, expect, it } from 'vitest';
import {
  gradeAcademy,
  lessonProgressPercent,
  publicAcademyQuestions,
  shuffleAcademy,
  type AcademyQuestion,
} from './academy.js';

const questions: AcademyQuestion[] = [
  {
    id: 'q1',
    type: 'MULTIPLE_SELECT',
    points: 1,
    prompt: 'Select both correct options',
    explanation: 'Both required',
    objectiveId: '1.1',
    options: [
      { id: 'a', text: 'First', isCorrect: true, feedback: 'Required' },
      { id: 'b', text: 'Second', isCorrect: true, feedback: 'Required' },
      { id: 'c', text: 'Third', isCorrect: false, feedback: 'Incorrect' },
    ],
  },
];
describe('academy progress', () => {
  it('counts distinct required completions only', () => {
    expect(lessonProgressPercent(['a', 'b', 'c'], ['a', 'a', 'unrelated'])).toBe(33);
    expect(lessonProgressPercent([], ['a'])).toBe(0);
    expect(lessonProgressPercent(['a'], ['a'])).toBe(100);
  });
});
describe('academy practice', () => {
  it('shuffles without losing, duplicating or mutating question identities', () => {
    const input = ['a', 'b', 'c', 'd'];
    expect(shuffleAcademy(input, () => 0)).toEqual(['b', 'c', 'd', 'a']);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
    expect(() => shuffleAcademy(input, () => 4)).toThrow();
  });
  it('requires the complete multiple-response set without partial credit', () => {
    expect(gradeAcademy(questions, [{ questionId: 'q1', optionIds: ['a'] }], 80).scorePercent).toBe(
      0,
    );
    expect(
      gradeAcademy(questions, [{ questionId: 'q1', optionIds: ['b', 'a'] }], 80).scorePercent,
    ).toBe(100);
    expect(
      gradeAcademy(questions, [{ questionId: 'q1', optionIds: ['a', 'b', 'c'] }], 80).scorePercent,
    ).toBe(0);
  });
  it('rejects unknown options, duplicate selections and duplicate answers', () => {
    for (const optionIds of [
      ['a', 'unknown'],
      ['a', 'a'],
    ]) {
      expect(() => gradeAcademy(questions, [{ questionId: 'q1', optionIds }], 80)).toThrow();
    }
    expect(() =>
      gradeAcademy(
        questions,
        [
          { questionId: 'q1', optionIds: [] },
          { questionId: 'q1', optionIds: [] },
        ],
        80,
      ),
    ).toThrow();
    expect(() => gradeAcademy(questions, [{ questionId: 'unknown', optionIds: [] }], 80)).toThrow();
  });
  it('scores missing answers as zero and applies the server passing target', () => {
    expect(gradeAcademy(questions, [], 80)).toMatchObject({ scorePercent: 0, passed: false });
  });
  it('strips all keys, feedback, objectives and explanations from delivery', () => {
    expect(publicAcademyQuestions(questions)).toEqual([
      {
        id: 'q1',
        type: 'MULTIPLE_SELECT',
        prompt: 'Select both correct options',
        options: [
          { id: 'a', text: 'First' },
          { id: 'b', text: 'Second' },
          { id: 'c', text: 'Third' },
        ],
      },
    ]);
  });
});
