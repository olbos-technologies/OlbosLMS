import { gradeAttempt, type QuestionInput } from './quiz.js';

export interface AcademyQuestion extends QuestionInput {
  prompt: string;
  explanation: string;
  objectiveId: string;
  options: { id: string; text: string; isCorrect: boolean; feedback: string }[];
}

export const shuffleAcademy = <T>(
  values: readonly T[],
  chooseIndex: (max: number) => number,
): T[] => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = chooseIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid shuffle index.');
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

export const lessonProgressPercent = (requiredIds: string[], completedIds: string[]): number => {
  const required = new Set(requiredIds);
  if (!required.size) return 0;
  const complete = new Set(completedIds.filter((id) => required.has(id)));
  return Math.floor((complete.size / required.size) * 100);
};

export const publicAcademyQuestions = (questions: AcademyQuestion[]) =>
  questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }));

export const gradeAcademy = (
  questions: AcademyQuestion[],
  answers: { questionId: string; optionIds: string[] }[],
  passingScore: number,
) => {
  if (new Set(answers.map((a) => a.questionId)).size !== answers.length) {
    throw new Error('Duplicate question answers.');
  }
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (
      !question ||
      new Set(answer.optionIds).size !== answer.optionIds.length ||
      answer.optionIds.some((id) => !question.options.some((o) => o.id === id)) ||
      (question.type !== 'MULTIPLE_SELECT' && answer.optionIds.length > 1)
    ) {
      throw new Error('Invalid answer selection.');
    }
  }
  return gradeAttempt(
    questions,
    answers.map((a) => ({
      questionId: a.questionId,
      answer: { optionId: a.optionIds[0], optionIds: a.optionIds },
    })),
    { passingScore },
  );
};
