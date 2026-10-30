'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardHeader, ProgressBar, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';

interface Catalog {
  courses: {
    id: string;
    title: string;
    summary: string;
    publishedVersion: { id: string; version: number };
  }[];
  enrollments: { id: string; courseId: string; courseVersionId: string; progressPercent: number }[];
}
interface Draft {
  id: string;
  title: string;
  versions: {
    modules: { title: string; lessons: { id: string; title: string; body: string }[] }[];
    quizzes: {
      questions: {
        question: {
          id: string;
          prompt: string;
          payload: unknown;
          options: { id: string; text: string; isCorrect: boolean; feedback: string }[];
        };
      }[];
    }[];
  }[];
}
export default function AcademyPage() {
  const { can } = useSession();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const instructor = can('question_bank:manage');
  const catalog = useQuery({
    queryKey: ['academy'],
    queryFn: async () => (await api.get<Catalog>('/api/v1/academy/courses')).data,
  });
  const drafts = useQuery({
    queryKey: ['academy-review'],
    queryFn: async () => (await api.get<Draft[]>('/api/v1/academy/review')).data,
    enabled: instructor,
  });
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      const response = await api.post<{ id?: string }>(path, body);
      await client.invalidateQueries({ queryKey: ['academy'] });
      await client.invalidateQueries({ queryKey: ['academy-review'] });
      return response.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Certification Academy"
        description="Build understanding. Practice with purpose. Track your own progress."
      />
      <Card className="mb-6 p-6">
        <Badge tone="neutral">CLOUD · ASSOCIATE</Badge>
        <h2 className="mt-3 text-2xl font-semibold text-ink">Your path to AWS architecture</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Start with AWS fundamentals and IAM. Seven lessons connect core ideas to architecture
          decisions, followed by twenty original practice questions.
        </p>
        <p className="mt-3 text-xs text-ink-muted">
          Week 1 foundation · SAA-C03 · No AWS account required · Weeks 2–12 are planned
        </p>
      </Card>
      {(error || catalog.error) && (
        <Alert tone="danger" title="Unable to complete request">
          {error || catalog.error?.message}
        </Alert>
      )}
      {catalog.isLoading && <Skeleton className="h-40" />}
      {catalog.data?.courses.length === 0 && (
        <Card className="p-6">
          <p className="text-ink">
            No approved certification courses are available in your organization yet.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            An instructor must review and publish the foundation content before learners can enroll.
          </p>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {catalog.data?.courses.map((course) => {
          const enrollment = catalog.data.enrollments.find((e) => e.courseId === course.id);
          return (
            <Card key={course.id} className="p-6">
              <Badge tone="neutral">SAA-C03 · VERSION {course.publishedVersion.version}</Badge>
              <h2 className="mt-3 text-lg font-semibold text-ink">{course.title}</h2>
              <p className="my-3 text-sm text-ink-muted">{course.summary}</p>
              <p className="mb-4 text-xs text-ink-muted">
                Prerequisite: basic familiarity with web applications. Includes text lessons,
                architecture exercises and a practice quiz.
              </p>
              {enrollment ? (
                <>
                  <ProgressBar value={enrollment.progressPercent} />
                  <p className="my-2 text-xs text-ink-muted">
                    {enrollment.progressPercent}% of foundation lessons completed
                  </p>
                  <Link
                    className="font-medium text-brand-700"
                    href={`/academy/learn/${enrollment.id}`}
                  >
                    Continue learning →
                  </Link>
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void action(`/api/v1/academy/courses/${course.id}/enroll`).then((result) => {
                      if (result?.id) window.location.assign(`/academy/learn/${result.id}`);
                    });
                  }}
                >
                  Enroll in Week 1
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      {!!catalog.data?.enrollments.length && (
        <Card className="mt-4 p-6">
          <h2 className="font-semibold text-ink">My enrolled versions</h2>
          {catalog.data.enrollments.map((e) => (
            <p key={e.id} className="mt-2">
              <Link className="text-brand-700" href={`/academy/learn/${e.id}`}>
                Continue enrolled course · {e.progressPercent}% lesson progress →
              </Link>
            </p>
          ))}
        </Card>
      )}
      {instructor && (
        <section className="mt-8">
          <CardHeader
            title="Instructor review"
            description="Drafts are not available to learners. Review every lesson, answer and source before approval."
          />
          <Button
            disabled={busy}
            onClick={() => {
              void action('/api/v1/academy/import-week-one');
            }}
          >
            Import Week 1 as draft
          </Button>
          {drafts.error && (
            <Alert tone="danger" title="Review unavailable">
              {drafts.error.message}
            </Alert>
          )}
          {drafts.data?.map((draft) => (
            <Card key={draft.id} className="mt-4 p-6">
              <h3 className="font-semibold text-ink">{draft.title} · Draft</h3>
              <p className="my-3 text-sm text-ink-muted">
                Source verification: 2026-10-30. These original drafts require your instructional
                and technical review.
              </p>
              {draft.versions.map((version, i) => (
                <div key={i}>
                  {version.modules
                    .flatMap((m) => m.lessons)
                    .map((lesson) => (
                      <details key={lesson.id} className="my-2 rounded border border-border p-3">
                        <summary className="cursor-pointer text-ink">{lesson.title}</summary>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">
                          {lesson.body}
                        </p>
                      </details>
                    ))}
                  {version.quizzes
                    .flatMap((q) => q.questions)
                    .map(({ question: q }, index) => (
                      <details key={q.id} className="my-2 rounded border border-border p-3">
                        <summary className="cursor-pointer text-ink">
                          {index + 1}. {q.prompt}
                        </summary>
                        <ul>
                          {q.options.map((o) => (
                            <li className="mt-2 text-sm text-ink-muted" key={o.id}>
                              <strong className="text-ink">
                                {o.text} {o.isCorrect ? '(correct)' : '(incorrect)'}
                              </strong>
                              <p>{o.feedback}</p>
                            </li>
                          ))}
                        </ul>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(q.payload, null, 2)}
                        </pre>
                      </details>
                    ))}
                </div>
              ))}
              <label className="my-4 flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={!!reviewed[draft.id]}
                  onChange={(e) => setReviewed({ ...reviewed, [draft.id]: e.target.checked })}
                />
                I have reviewed all lessons, questions, option explanations and linked official
                sources and approve this version for learners.
              </label>
              <Button
                disabled={busy || !reviewed[draft.id] || !can('course:publish')}
                onClick={() => {
                  void action(`/api/v1/academy/review/${draft.id}/approve`, {
                    reviewedAllContent: true,
                  });
                }}
              >
                Approve and publish course version
              </Button>
            </Card>
          ))}
        </section>
      )}
      <p className="mt-8 text-xs text-ink-muted">
        Independently created Olbos learning and practice material. Not an official AWS exam or AWS
        certification. Practice results do not guarantee an examination outcome.
      </p>
    </>
  );
}
