'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
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
  return (
    <>
      <Link href="/academy" className="text-sm text-brand-700">
        ← Certification Academy
      </Link>
      <PageHeader
        title={finished ? 'Practice results' : 'AWS fundamentals and IAM'}
        description="Independent Olbos practice · Answers and explanations appear after submission"
      />
      {finished && (
        <Card className="mb-5 p-6">
          <p className="text-3xl font-semibold text-ink">{attempt.scorePercent}%</p>
          <p className="mt-2 text-sm text-ink-muted">
            Internal practice score. This is not an AWS scaled score or a prediction of an official
            exam result.
          </p>
        </Card>
      )}
      {error && (
        <Alert tone="danger" title="Submission failed">
          {error}
        </Alert>
      )}
      <div className="space-y-4">
        {(attempt.review ?? attempt.questions).map((q, index) => {
          const response = attempt.responses?.find((r) => r.questionId === q.id);
          const selected = finished ? (response?.answer.optionIds ?? []) : (answers[q.id] ?? []);
          return (
            <Card key={q.id} className="p-6">
              <fieldset disabled={finished || busy}>
                <legend className="font-semibold text-ink">
                  {index + 1}. {q.prompt}
                </legend>
                <p className="my-2 text-xs text-ink-muted">
                  {q.type === 'MULTIPLE_SELECT'
                    ? 'Select all correct answers.'
                    : 'Select one answer.'}
                </p>
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-3 rounded border border-border p-3 text-sm text-ink"
                    >
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
                      <span>
                        {o.text}
                        {finished && (
                          <span className="mt-2 block text-xs text-ink-muted">
                            {o.isCorrect ? 'Correct option. ' : 'Incorrect option. '}
                            {o.feedback}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {finished && (
                <p className="mt-3 text-sm font-medium text-ink">
                  {response?.isCorrect ? 'Answered correctly' : 'Review this concept'}
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {!finished && (
        <div className="my-6">
          <p className="mb-3 text-sm text-ink-muted">
            {Object.values(answers).filter((a) => a.length).length} of {attempt.questions.length}{' '}
            answered. Unanswered questions score zero. Keep this page open until submission; answer
            autosave is planned for the examination milestone.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? 'Submitting…' : 'Submit practice answers'}
          </Button>
        </div>
      )}
    </>
  );
}
