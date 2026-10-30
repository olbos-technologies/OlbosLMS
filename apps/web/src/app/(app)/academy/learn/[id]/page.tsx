'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, ProgressBar, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';

interface Enrollment {
  id: string;
  progressPercent: number;
  lessonProgress: { lessonId: string; status: string }[];
  courseVersion: {
    title: string;
    version: number;
    modules: {
      id: string;
      title: string;
      lessons: { id: string; title: string; body: string }[];
    }[];
    quizzes: { id: string; title: string }[];
  };
  quizAttempts: { id: string; status: string; scorePercent: string | null; startedAt: string }[];
}
export default function LearnPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['academy-enrollment', id],
    queryFn: async () => (await api.get<Enrollment>(`/api/v1/academy/enrollments/${id}`)).data,
  });
  if (query.isLoading) return <Skeleton className="h-80" />;
  if (!query.data)
    return (
      <Alert tone="danger" title="Course unavailable">
        {query.error?.message}
      </Alert>
    );
  const enrollment = query.data;
  const lessons = enrollment.courseVersion.modules.flatMap((m) => m.lessons);
  const current = lessons.find((l) => l.id === selected) ?? lessons[0];
  const completed = new Set(
    enrollment.lessonProgress.filter((p) => p.status === 'COMPLETED').map((p) => p.lessonId),
  );
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ id: string }>(path, body);
      await client.invalidateQueries({ queryKey: ['academy-enrollment', id] });
      await client.invalidateQueries({ queryKey: ['academy'] });
      return result.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.');
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
        title={enrollment.courseVersion.title}
        description={`SAA-C03 · Course version ${enrollment.courseVersion.version} · Week 1 foundation`}
      />
      <Card className="mb-4 p-4">
        <ProgressBar value={enrollment.progressPercent} />
        <p className="mt-2 text-xs text-ink-muted">
          {completed.size} of {lessons.length} lessons completed. Lesson progress does not issue a
          course completion certificate.
        </p>
      </Card>
      {error && (
        <Alert tone="danger" title="Request failed">
          {error}
        </Alert>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-4">
          <nav aria-label="Course lessons">
            {enrollment.courseVersion.modules.map((m) => (
              <div key={m.id}>
                <h2 className="mb-3 font-semibold text-ink">{m.title}</h2>
                <ol className="space-y-1">
                  {m.lessons.map((lesson, index) => (
                    <li key={lesson.id}>
                      <button
                        className={`w-full rounded p-2 text-left text-sm focus-visible:outline focus-visible:outline-2 ${current?.id === lesson.id ? 'bg-surface-muted font-semibold text-ink' : 'text-ink-muted'}`}
                        aria-current={current?.id === lesson.id ? 'step' : undefined}
                        onClick={() => setSelected(lesson.id)}
                      >
                        {index + 1}. {lesson.title} {completed.has(lesson.id) ? '✓ Completed' : ''}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </nav>
        </Card>
        <div className="min-w-0 space-y-4">
          {current && (
            <Card className="p-6">
              <Badge tone="neutral">LESSON {lessons.indexOf(current) + 1}</Badge>
              <h2 className="my-4 text-2xl font-semibold text-ink">{current.title}</h2>
              <article className="space-y-5">
                {current.body.split('\n\n').map((block, i) => {
                  const [heading, ...body] = block.split('\n');
                  return (
                    <section key={i}>
                      <h3 className="mb-2 font-semibold text-ink">{heading}</h3>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">
                        {body.join('\n')}
                      </p>
                    </section>
                  );
                })}
              </article>
              <Button
                className="mt-6"
                disabled={busy || completed.has(current.id)}
                onClick={() => {
                  void act(`/api/v1/academy/enrollments/${id}/complete-lesson`, {
                    lessonId: current.id,
                  });
                }}
              >
                {completed.has(current.id) ? 'Lesson completed' : 'Mark lesson complete'}
              </Button>
              <p className="mt-4 text-xs text-ink-muted">
                References:{' '}
                <a
                  className="underline"
                  href="https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  AWS IAM best practices
                </a>{' '}
                ·{' '}
                <a
                  className="underline"
                  href="https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  SAA-C03 guide
                </a>
                . Verified 2026-10-30.
              </p>
            </Card>
          )}
          <Card className="p-6">
            <h2 className="font-semibold text-ink">Practice what you learned</h2>
            <p className="my-3 text-sm text-ink-muted">
              20 questions · Feedback after submission · Internal practice score
            </p>
            {enrollment.courseVersion.quizzes.map((q) => (
              <Button
                key={q.id}
                disabled={busy}
                onClick={() => {
                  void act(`/api/v1/academy/enrollments/${id}/practice`, { quizId: q.id }).then(
                    (attempt) => {
                      if (attempt) router.push(`/academy/practice/${attempt.id}`);
                    },
                  );
                }}
              >
                {q.title}
              </Button>
            ))}
          </Card>
          <Card className="p-6">
            <h2 className="font-semibold text-ink">Your practice history</h2>
            {enrollment.quizAttempts.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No practice attempts yet.</p>
            ) : (
              <ul>
                {enrollment.quizAttempts.map((a) => (
                  <li key={a.id} className="mt-3 text-sm">
                    <Link className="text-brand-700" href={`/academy/practice/${a.id}`}>
                      {new Date(a.startedAt).toLocaleDateString()} ·{' '}
                      {a.status === 'GRADED'
                        ? `${a.scorePercent}% — review answers`
                        : 'Resume practice'}{' '}
                      →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
