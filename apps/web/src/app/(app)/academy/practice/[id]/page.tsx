'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Skeleton } from '@olbos/ui';
import { ArrowRight, ChevronRight, FileQuestion } from 'lucide-react';
import { api } from '@/lib/api';

interface Question {
  id: string;
  type: string;
  prompt: string;
  options: { id: string; text: string; isCorrect?: boolean; feedback?: string }[];
}
interface Attempt {
  id: string;
  status: string;
  scorePercent: string | null;
  questions: Question[];
  review?: Question[];
  responses?: { questionId: string; answer: { optionIds: string[] }; isCorrect: boolean }[];
}
export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['academy-attempt', id],
    queryFn: async () => (await api.get<Attempt>(`/api/v1/academy/attempts/${id}`)).data,
  });
  if (query.isLoading) return <Skeleton className="h-80" />;
  if (!query.data)
    return (
      <Alert tone="danger" title="Practice unavailable">
        {query.error?.message}
      </Alert>
    );
  const attempt = query.data;
  const finished = attempt.status !== 'IN_PROGRESS';
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/v1/academy/attempts/${id}/submit`, {
        answers: Object.entries(answers).map(([questionId, optionIds]) => ({
          questionId,
          optionIds,
        })),
      });
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  }
  const answeredCount = finished
    ? (attempt.responses?.filter((r) => r.answer.optionIds.length).length ?? 0)
    : Object.values(answers).filter((a) => a.length).length;
  const correctCount = attempt.responses?.filter((r) => r.isCorrect).length ?? 0;
  const questions = attempt.review ?? attempt.questions;
  return (
    <>
      <nav className="academy-breadcrumb" aria-label="Breadcrumb">
        <Link href="/academy">Certification Academy</Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span aria-current="page">{finished ? 'Practice results' : 'Practice assessment'}</span>
      </nav>
      <header className="academy-banner">
        <div className="academy-eyebrow">SAA-C03 · Week 1 assessment</div>
        <h1>{finished ? 'Practice results' : 'AWS fundamentals and IAM'}</h1>
        <p>
          {finished
            ? 'Review your responses and the reasoning behind each answer.'
            : 'Apply your understanding of cloud fundamentals and secure access.'}
        </p>
        <div className="academy-meta">
          <span>
            <FileQuestion size={15} aria-hidden="true" />
            {questions.length} questions
          </span>
          <span>Feedback after submission</span>
          <span>Independent Olbos practice</span>
        </div>
      </header>
      {finished && (
        <dl className="academy-summary-grid">
          <div>
            <dt>Practice score</dt>
            <dd>{attempt.scorePercent}%</dd>
          </div>
          <div>
            <dt>Correct responses</dt>
            <dd>
              {correctCount}
              <span className="text-sm font-normal text-ink-muted"> / {questions.length}</span>
            </dd>
          </div>
          <div>
            <dt>Questions answered</dt>
            <dd>
              {answeredCount}
              <span className="text-sm font-normal text-ink-muted"> / {questions.length}</span>
            </dd>
          </div>
        </dl>
      )}
      {error && (
        <Alert tone="danger" title="Submission failed">
          {error}
        </Alert>
      )}
      <div className="academy-question-grid">
        <div className="min-w-0 space-y-5">
          {questions.map((q, index) => {
            const response = attempt.responses?.find((r) => r.questionId === q.id);
            const selected = finished ? (response?.answer.optionIds ?? []) : (answers[q.id] ?? []);
            return (
              <article
                id={`question-${index + 1}`}
                key={q.id}
                className="academy-document academy-question"
              >
                <div className="border-b border-border bg-surface-muted px-6 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="academy-eyebrow text-ink-muted">
                      Question {String(index + 1).padStart(2, '0')}
                    </span>
                    {finished && (
                      <span className="text-xs font-medium text-ink">
                        {response?.isCorrect
                          ? 'Correct response'
                          : selected.length
                            ? 'Incorrect response'
                            : 'Not answered'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-6 sm:p-7">
                  <fieldset disabled={finished || busy}>
                    <legend className="text-base font-semibold leading-7 text-ink">
                      {q.prompt}
                    </legend>
                    <p className="mb-5 mt-2 text-xs text-ink-muted">
                      {q.type === 'MULTIPLE_SELECT'
                        ? 'Select all correct answers.'
                        : 'Select one answer.'}
                    </p>
                    <div className="space-y-3">
                      {q.options.map((o, optionIndex) => (
                        <label key={o.id} className="academy-option">
                          <input
                            type={q.type === 'MULTIPLE_SELECT' ? 'checkbox' : 'radio'}
                            name={q.id}
                            checked={selected.includes(o.id)}
                            onChange={(e) =>
                              setAnswers({
                                ...answers,
                                [q.id]:
                                  q.type === 'MULTIPLE_SELECT'
                                    ? e.target.checked
                                      ? [...selected, o.id]
                                      : selected.filter((s) => s !== o.id)
                                    : [o.id],
                              })
                            }
                          />
                          <span className="academy-option-letter" aria-hidden="true">
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          <span className="min-w-0">
                            {o.text}
                            {finished && (
                              <span className="mt-2 block border-t border-border pt-2 text-xs leading-6 text-ink-muted">
                                <strong className="font-semibold text-ink">
                                  {o.isCorrect ? 'Correct option. ' : 'Incorrect option. '}
                                </strong>
                                {o.feedback}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </article>
            );
          })}
          {!finished && (
            <Card className="p-6">
              <h2 className="font-semibold text-ink">Submit your assessment</h2>
              <p className="mb-4 mt-2 text-sm leading-7 text-ink-muted">
                {answeredCount} of {questions.length} questions answered. Unanswered questions
                receive zero points. You can review your selections before submitting.
              </p>
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                onClick={() => {
                  void submit();
                }}
              >
                Submit practice answers
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </Card>
          )}
        </div>
        <aside className="academy-outline" aria-label="Question navigation">
          <div className="academy-outline-header">
            <div className="academy-eyebrow text-ink-muted">
              {finished ? 'Review navigator' : 'Assessment navigator'}
            </div>
            <h2>{finished ? 'Review your responses' : 'Your progress'}</h2>
            <p className="mt-2 text-xs text-ink-muted">
              {answeredCount} of {questions.length} answered
            </p>
          </div>
          <div className="p-4">
            <nav className="academy-question-nav" aria-label="Jump to question">
              {questions.map((q, index) => (
                <a
                  key={q.id}
                  href={`#question-${index + 1}`}
                  data-answered={
                    finished
                      ? !!attempt.responses?.find((r) => r.questionId === q.id)?.answer.optionIds
                          .length
                      : !!answers[q.id]?.length
                  }
                  aria-label={`Question ${index + 1}, ${
                    (
                      finished
                        ? attempt.responses?.find((r) => r.questionId === q.id)?.answer.optionIds
                            .length
                        : answers[q.id]?.length
                    )
                      ? 'answered'
                      : 'not answered'
                  }`}
                >
                  {index + 1}
                </a>
              ))}
            </nav>
            <p className="mt-4 text-[11px] leading-6 text-ink-muted">
              Shaded numbers indicate answered questions.
            </p>
          </div>
          <div className="border-t border-border p-4">
            <p className="text-xs leading-6 text-ink-muted">
              {finished
                ? 'Use the explanations to identify concepts to revisit in the course.'
                : 'Keep this page open until submission. Answers are not saved automatically.'}
            </p>
          </div>
        </aside>
      </div>
      <p className="academy-notice">
        Scores are internal practice percentages, not AWS scaled scores. This assessment is
        independently created by Olbos and does not predict or guarantee an official examination
        result.
      </p>
    </>
  );
}
