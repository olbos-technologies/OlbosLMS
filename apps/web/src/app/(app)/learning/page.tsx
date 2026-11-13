'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@olbos/ui';
import { api } from '@/lib/api';
import type { CertificateListItem, MyLearning } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { formatDate, formatMinutes, titleCase } from '@/lib/format';

/**
 * My Learning — the learner's own view.
 *
 * Each assignment says *why* it was assigned. "You must complete Lockout/Tagout"
 * is an instruction; "because you are a Maintenance Technician, under the
 * energy control programme" is a reason, and people complete training they
 * understand the reason for.
 */
export default function MyLearningPage() {
  const { hasEntitlement } = useSession();

  const learning = useQuery({
    queryKey: ['me', 'learning'],
    queryFn: async () => (await api.get<MyLearning>('/api/v1/me/learning')).data,
  });

  const certificates = useQuery({
    queryKey: ['me', 'certificates'],
    queryFn: async () => (await api.get<CertificateListItem[]>('/api/v1/me/certificates')).data,
    enabled: hasEntitlement('CERTIFICATES'),
  });

  const summary = learning.data?.summary;

  return (
    <>
      <PageHeader
        title="My Learning"
        description="Training assigned to you, your progress, and your certificates."
      />

      {summary && summary.overdue > 0 ? (
        <Alert tone="danger" title="Overdue training" className="mb-4">
          You have {summary.overdue} overdue item{summary.overdue === 1 ? '' : 's'}. Please complete
          {summary.overdue === 1 ? ' it' : ' them'} as soon as you can, and speak to your supervisor
          if you cannot.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Assigned training"
              description="What you need to complete, and why"
            />
            {learning.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-40" />
              </div>
            ) : (learning.data?.assignments.length ?? 0) === 0 ? (
              <EmptyState
                icon={<BookOpen className="size-8" aria-hidden="true" />}
                title="Nothing assigned"
                description="You have completed everything currently required of you."
              />
            ) : (
              <ul className="divide-y divide-border">
                {learning.data!.assignments.map((assignment) => {
                  const overdue = assignment.dueAt && new Date(assignment.dueAt) < new Date();
                  return (
                    <li key={assignment.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-ink">
                              {assignment.course.title}
                            </h3>
                            <Badge tone="neutral">{titleCase(assignment.course.type)}</Badge>
                            {assignment.course.publishedVersion ? (
                              <Badge tone="neutral">
                                {titleCase(assignment.course.publishedVersion.deliveryMethod)}
                              </Badge>
                            ) : null}
                          </div>

                          {assignment.course.summary ? (
                            <p className="mt-1 text-xs text-ink-muted">
                              {assignment.course.summary}
                            </p>
                          ) : null}

                          {assignment.requirement ? (
                            <p className="mt-2 rounded border border-border bg-surface-muted px-2 py-1.5 text-[11px] text-ink-muted">
                              <span className="font-medium text-ink">Why you have this: </span>
                              {assignment.requirement.name}
                              {assignment.requirement.basis
                                ? ` — ${assignment.requirement.basis}`
                                : ''}
                            </p>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-right">
                          <StatusBadge status={overdue ? 'MISSING' : 'PENDING'} />
                          <p className="mt-1.5 text-[11px] text-ink-subtle">
                            Due {formatDate(assignment.dueAt)}
                          </p>
                          <p className="text-[11px] text-ink-subtle">
                            {formatMinutes(
                              assignment.course.publishedVersion?.estimatedMinutes ?? null,
                            )}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {(learning.data?.enrollments.length ?? 0) > 0 ? (
            <Card className="mt-4">
              <CardHeader title="Courses in progress" />
              <Table>
                <thead>
                  <tr>
                    <Th>Course</Th>
                    <Th className="w-48">Progress</Th>
                  </tr>
                </thead>
                <tbody>
                  {learning.data!.enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <Td className="font-medium">{enrollment.course.title}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={enrollment.progressPercent}
                            label={`${enrollment.course.title} progress`}
                          />
                          <span className="w-10 shrink-0 text-right text-xs tabular-nums">
                            {enrollment.progressPercent}%
                          </span>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>

        <div>
          <Card>
            <CardHeader title="My certificates" />
            {!hasEntitlement('CERTIFICATES') ? (
              <div className="p-4">
                <Alert tone="info">
                  Certificates are not included in your organization's plan.
                </Alert>
              </div>
            ) : certificates.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-32" />
              </div>
            ) : (certificates.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Award className="size-8" aria-hidden="true" />}
                title="No certificates yet"
                description="Certificates appear here when you complete training that issues one."
              />
            ) : (
              <ul className="divide-y divide-border">
                {certificates.data!.map((certificate) => (
                  <li key={certificate.id} className="p-4">
                    <p className="text-sm font-medium text-ink">{certificate.courseTitle}</p>
                    <p className="font-mono text-[11px] text-ink-subtle">
                      {certificate.certificateNumber}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={
                          certificate.status === 'ACTIVE'
                            ? 'CURRENT'
                            : certificate.status === 'EXPIRED'
                              ? 'EXPIRED'
                              : 'NOT_APPLICABLE'
                        }
                      />
                      <span className="text-[11px] text-ink-subtle">
                        Issued {formatDate(certificate.issuedAt)}
                        {certificate.expiresAt
                          ? ` · expires ${formatDate(certificate.expiresAt)}`
                          : ' · does not expire'}
                      </span>
                    </div>
                    <a
                      href={`/verify/certificate/${certificate.publicId}`}
                      className="mt-1.5 inline-block text-[11px] text-brand-700 underline-offset-2 hover:underline"
                    >
                      Public verification link
                    </a>
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
