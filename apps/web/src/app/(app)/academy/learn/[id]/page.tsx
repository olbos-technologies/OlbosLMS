'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ProgressBar, Skeleton } from '@olbos/ui';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ChevronDown,
  FileQuestion,
  GraduationCap,
} from 'lucide-react';
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
      lessons: { id: string; title: string; body: string; durationSeconds?: number | null }[];
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
  const [outlineOpen, setOutlineOpen] = useState(false);
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
  const currentIndex = current ? lessons.indexOf(current) : -1;
  function selectLesson(lessonId: string) {
    setSelected(lessonId);
    document.getElementById('lesson-document')?.scrollIntoView({ block: 'start' });
  }
  return (
    <>
      <nav className="academy-breadcrumb" aria-label="Breadcrumb">
        <Link href="/academy">Certification Academy</Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span aria-current="page">Course learning</span>
      </nav>
      <header className="academy-banner">
        <div className="academy-eyebrow">Professional learning · Cloud architecture</div>
        <h1>{enrollment.courseVersion.title}</h1>
        <p>Week 1: AWS Fundamentals and IAM</p>
        <div className="academy-meta">
          <span>
            <GraduationCap size={15} aria-hidden="true" />
            SAA-C03 · Associate
          </span>
          <span>
            <BookOpen size={15} aria-hidden="true" />
            {lessons.length} lessons
          </span>
          <span>Course version {enrollment.courseVersion.version}</span>
          <span>Self-paced learning</span>
        </div>
      </header>
      {error && (
        <Alert tone="danger" title="Request failed">
          {error}
        </Alert>
      )}
      <div className="academy-learning-grid">
        <aside
          className={`academy-outline ${outlineOpen ? 'is-expanded' : ''}`}
          aria-label="Course outline"
        >
          <div className="academy-outline-header">
            <div className="academy-eyebrow text-ink-muted">Course outline</div>
            <h2>Week 1 · Fundamentals and IAM</h2>
          </div>
          <div className="academy-outline-progress">
            <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
              <span>Lesson progress</span>
              <strong className="text-ink">{enrollment.progressPercent}%</strong>
            </div>
            <ProgressBar value={enrollment.progressPercent} label="Foundation lesson progress" />
            <p className="mt-2 text-[11px] text-ink-muted">
              {completed.size} of {lessons.length} lessons completed
            </p>
          </div>
          <button
            className="academy-mobile-toggle"
            aria-expanded={outlineOpen}
            aria-controls="course-lessons"
            onClick={() => setOutlineOpen(!outlineOpen)}
          >
            {outlineOpen ? 'Hide course lessons' : 'Show course lessons'}
            <ChevronDown size={16} aria-hidden="true" className={outlineOpen ? 'rotate-180' : ''} />
          </button>
          <nav id="course-lessons" aria-label="Course lessons">
            {enrollment.courseVersion.modules.map((m) => (
              <ol key={m.id}>
                {m.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      className="academy-lesson-link"
                      aria-current={current?.id === lesson.id ? 'step' : undefined}
                      onClick={() => selectLesson(lesson.id)}
                    >
                      <span className="academy-lesson-index">
                        {completed.has(lesson.id) ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          String(lessons.indexOf(lesson) + 1).padStart(2, '0')
                        )}
                      </span>
                      <span>
                        {lesson.title}
                        <span className="academy-lesson-status">
                          {completed.has(lesson.id)
                            ? 'Completed'
                            : current?.id === lesson.id
                              ? 'Current lesson'
                              : 'Not completed'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ))}
          </nav>
          <a href="#course-assessment" className="academy-link w-full px-4 py-3">
            <FileQuestion size={15} aria-hidden="true" />
            Week 1 practice
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </aside>
        <div className="min-w-0">
          {current && (
            <article
              id="lesson-document"
              className="academy-document scroll-mt-20"
              aria-labelledby="lesson-title"
            >
              <header className="academy-document-header">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="academy-eyebrow text-brand-700">
                    Lesson {String(currentIndex + 1).padStart(2, '0')} of {lessons.length}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                    {completed.has(current.id) ? (
                      <>
                        <Check size={14} aria-hidden="true" />
                        Completed
                      </>
                    ) : (
                      'Reading & applied learning'
                    )}
                  </span>
                </div>
                <h2 id="lesson-title">{current.title}</h2>
              </header>
              <div className="academy-document-body">
                {current.body.split('\n\n').map((block, i) => {
                  const [heading, ...body] = block.split('\n');
                  const content = body.join('\n');
                  const objectives = heading === 'Learning objectives';
                  const exercise = heading === 'Exercise' || heading === 'Knowledge check';
                  return (
                    <section
                      key={i}
                      className={
                        objectives
                          ? 'academy-learning-callout'
                          : exercise
                            ? 'academy-exercise'
                            : undefined
                      }
                    >
                      <h3>{heading}</h3>
                      {objectives ? (
                        <ul>
                          {body.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="whitespace-pre-wrap">{content}</p>
                      )}
                    </section>
                  );
                })}
              </div>
              <footer className="academy-document-footer">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="max-w-sm text-xs leading-6 text-ink-muted">
                    Mark this lesson complete after reviewing the material and working through the
                    learning activities.
                  </p>
                  <Button
                    variant={completed.has(current.id) ? 'secondary' : 'primary'}
                    size="lg"
                    icon={
                      completed.has(current.id) ? <Check size={16} aria-hidden="true" /> : undefined
                    }
                    loading={busy}
                    disabled={completed.has(current.id)}
                    onClick={() => {
                      void act(`/api/v1/academy/enrollments/${id}/complete-lesson`, {
                        lessonId: current.id,
                      });
                    }}
                  >
                    {completed.has(current.id) ? 'Lesson completed' : 'Mark lesson complete'}
                  </Button>
                </div>
              </footer>
            </article>
          )}
          <nav
            className="my-4 flex flex-wrap items-center justify-between gap-3"
            aria-label="Lesson navigation"
          >
            <Button
              variant="ghost"
              disabled={currentIndex <= 0}
              icon={<ArrowLeft size={15} aria-hidden="true" />}
              onClick={() => selectLesson(lessons[currentIndex - 1]!.id)}
            >
              Previous lesson
            </Button>
            <Button
              disabled={currentIndex < 0 || currentIndex >= lessons.length - 1}
              onClick={() => selectLesson(lessons[currentIndex + 1]!.id)}
            >
              Next lesson
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </nav>
          <section aria-labelledby="course-resources-heading">
            <div className="academy-section-heading">
              <div>
                <h2 id="course-resources-heading">Learning resources</h2>
                <p>Official reference material for this course foundation</p>
              </div>
            </div>
            <Card className="overflow-hidden">
              <div className="academy-resource-row">
                <div className="flex items-center gap-3">
                  <span className="academy-resource-icon">
                    <BookOpen size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      AWS documentation and exam objectives
                    </h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      Source verification: October 30, 2026
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <a
                    className="academy-link"
                    href="https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    IAM reference ↗
                  </a>
                  <a
                    className="academy-link"
                    href="https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Exam guide ↗
                  </a>
                </div>
              </div>
            </Card>
          </section>
          <section
            id="course-assessment"
            className="scroll-mt-20"
            aria-labelledby="assessment-heading"
          >
            <div className="academy-section-heading">
              <div>
                <h2 id="assessment-heading">Assessment & practice</h2>
                <p>Apply your understanding and review feedback after submission.</p>
              </div>
            </div>
            <Card>
              {enrollment.courseVersion.quizzes.map((q) => (
                <div className="academy-resource-row" key={q.id}>
                  <div className="flex items-center gap-3">
                    <span className="academy-resource-icon">
                      <FileQuestion size={19} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{q.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        20 questions · Feedback after submission
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => {
                      void act(`/api/v1/academy/enrollments/${id}/practice`, { quizId: q.id }).then(
                        (attempt) => {
                          if (attempt) router.push(`/academy/practice/${attempt.id}`);
                        },
                      );
                    }}
                  >
                    Start practice
                    <ArrowRight size={15} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </Card>
          </section>
          <section aria-labelledby="practice-history-heading">
            <div className="academy-section-heading">
              <h2 id="practice-history-heading">Practice history</h2>
              <span className="text-xs text-ink-muted">
                {enrollment.quizAttempts.length} recent attempt
                {enrollment.quizAttempts.length === 1 ? '' : 's'}
              </span>
            </div>
            <Card>
              {enrollment.quizAttempts.length === 0 ? (
                <p className="p-6 text-sm text-ink-muted">
                  Your submitted practice results will appear here.
                </p>
              ) : (
                <ul>
                  {enrollment.quizAttempts.map((a) => (
                    <li key={a.id} className="academy-resource-row">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {a.status === 'GRADED' ? 'Completed practice' : 'Practice in progress'}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {new Date(a.startedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          {a.status === 'GRADED' ? ` · ${a.scorePercent}% practice score` : ''}
                        </p>
                      </div>
                      <Link className="academy-link" href={`/academy/practice/${a.id}`}>
                        {a.status === 'GRADED' ? 'Review results' : 'Resume practice'}
                        <ChevronRight size={15} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <p className="academy-notice">
            This foundation includes Week 1 only. Lesson progress is separate from course completion
            and does not issue a certificate. Olbos practice assessments are independently created
            and are not official AWS certification exams.
          </p>
        </div>
      </div>
    </>
  );
}
