'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  KpiCard,
  ProgressBar,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@olbos/ui';
import { api, type ApiClientError } from '@/lib/api';
import type { ComplianceDashboard, MyLearning } from '@/lib/types';
import { useSession } from '@/components/session';
import { PageHeader } from '@/components/app-shell';
import { complianceTone, formatDate, formatPercent, titleCase } from '@/lib/format';

/**
 * Command Center.
 *
 * Shows each role the thing they are accountable for: a learner sees what they
 * owe, a supervisor sees their team, an administrator sees the organization.
 * Sections a user cannot see are not requested at all, so the page does not
 * generate 403s to discard.
 */
export default function DashboardPage() {
  const { me, can } = useSession();
  const canSeeCompliance = can('compliance:read') || can('compliance:read_team');

  const learning = useQuery({
    queryKey: ['me', 'learning'],
    queryFn: async () => (await api.get<MyLearning>('/api/v1/me/learning')).data,
  });

  const compliance = useQuery<ComplianceDashboard, ApiClientError>({
    queryKey: ['compliance', 'dashboard'],
    queryFn: async () => (await api.get<ComplianceDashboard>('/api/v1/compliance/dashboard')).data,
    enabled: canSeeCompliance,
  });

  const summary = learning.data?.summary;

  return (
    <>
      <PageHeader
        title={`Good day, ${me?.user.firstName ?? ''}`}
        description={
          me?.employee?.jobRole?.title
            ? `${me.employee.jobRole.title}${me.employee.department ? ` · ${me.employee.department.name}` : ''}`
            : 'Your training and compliance overview'
        }
      />

      {/* --- personal position ------------------------------------------- */}
      <section aria-labelledby="my-training" className="mb-6">
        <h2 id="my-training" className="mb-3 text-sm font-semibold text-ink">
          My training
        </h2>

        {learning.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Assigned to me" value={summary.assigned} hint="Not yet complete" />
            <KpiCard
              label="Overdue"
              value={summary.overdue}
              tone={summary.overdue > 0 ? 'danger' : 'success'}
              hint={summary.overdue > 0 ? 'Complete these first' : 'Nothing overdue'}
            />
            <KpiCard
              label="Expiring soon"
              value={summary.expiringSoon}
              tone={summary.expiringSoon > 0 ? 'warning' : 'neutral'}
              hint="Within your warning window"
            />
            <KpiCard
              label="Current"
              value={summary.current}
              tone="success"
              hint="Requirements you meet"
            />
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No training profile"
              description="Your account is not linked to an employee record, so no training is assigned to you."
            />
          </Card>
        )}
      </section>

      {/* --- assigned work ------------------------------------------------ */}
      <section aria-labelledby="assigned" className="mb-6">
        <Card>
          <CardHeader
            title="Assigned to me"
            description="Training you have been asked to complete"
            actions={
              <Link
                href="/learning"
                className="text-xs text-brand-700 underline-offset-2 hover:underline"
              >
                View all
              </Link>
            }
          />
          {learning.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : (learning.data?.assignments.length ?? 0) === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="You have completed everything assigned to you."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Course</Th>
                  <Th className="hidden sm:table-cell">Why</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {learning.data!.assignments.slice(0, 6).map((assignment) => {
                  const overdue = assignment.dueAt && new Date(assignment.dueAt) < new Date();
                  return (
                    <tr key={assignment.id}>
                      <Td>
                        <p className="font-medium text-ink">{assignment.course.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {titleCase(assignment.course.type)}
                          {assignment.course.publishedVersion
                            ? ` · ${titleCase(assignment.course.publishedVersion.deliveryMethod)}`
                            : ''}
                        </p>
                      </Td>
                      <Td className="hidden max-w-xs sm:table-cell">
                        <span className="text-xs text-ink-muted">
                          {assignment.requirement?.name ?? 'Assigned directly'}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(assignment.dueAt)}</Td>
                      <Td>
                        <StatusBadge status={overdue ? 'MISSING' : 'PENDING'} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </section>

      {/* --- organization position ---------------------------------------- */}
      {canSeeCompliance ? (
        <section aria-labelledby="org-compliance">
          <h2 id="org-compliance" className="mb-3 text-sm font-semibold text-ink">
            {compliance.data?.scope === 'compliance:read_team'
              ? 'My team'
              : 'Organization compliance'}
          </h2>

          {compliance.isLoading ? (
            <Skeleton className="h-64" />
          ) : compliance.error ? (
            <Alert tone="danger" title="Could not load compliance">
              {compliance.error.message}
            </Alert>
          ) : compliance.data ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-1">
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Overall compliance
                </p>
                <p
                  className={`mt-2 text-4xl font-semibold tabular-nums ${
                    complianceTone(compliance.data.summary.compliancePercent) === 'success'
                      ? 'text-status-current'
                      : complianceTone(compliance.data.summary.compliancePercent) === 'warning'
                        ? 'text-status-expiring'
                        : 'text-status-expired'
                  }`}
                >
                  {formatPercent(compliance.data.summary.compliancePercent)}
                </p>
                <div className="mt-3">
                  <ProgressBar
                    value={compliance.data.summary.compliancePercent}
                    label="Overall compliance"
                    tone={complianceTone(compliance.data.summary.compliancePercent)}
                  />
                </div>
                <dl className="mt-4 space-y-1.5 text-xs">
                  {(
                    [
                      ['Current', compliance.data.summary.current, 'CURRENT'],
                      ['Expiring', compliance.data.summary.expiringSoon, 'EXPIRING_SOON'],
                      ['Expired', compliance.data.summary.expired, 'EXPIRED'],
                      ['Missing', compliance.data.summary.missing, 'MISSING'],
                      ['Pending', compliance.data.summary.pending, 'PENDING'],
                    ] as const
                  ).map(([label, value, status]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5">
                        <StatusBadge status={status} showGlyph={false} />
                      </dt>
                      <dd className="font-medium tabular-nums text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader
                  title="Compliance by department"
                  description="Lowest first — where attention is needed"
                />
                {compliance.data.byDepartment.length === 0 ? (
                  <EmptyState title="No compliance data yet" />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Department</Th>
                        <Th className="w-24 text-right">Employees</Th>
                        <Th className="w-40">Compliance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliance.data.byDepartment.map((bucket) => (
                        <tr key={bucket.key}>
                          <Td className="font-medium">{bucket.label}</Td>
                          <Td className="text-right tabular-nums">{bucket.employeeCount}</Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <ProgressBar
                                value={bucket.summary.compliancePercent}
                                label={`${bucket.label} compliance`}
                                tone={complianceTone(bucket.summary.compliancePercent)}
                              />
                              <span className="w-12 shrink-0 text-right text-xs tabular-nums">
                                {formatPercent(bucket.summary.compliancePercent)}
                              </span>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              {compliance.data.employeesAtRisk.length > 0 ? (
                <Card className="lg:col-span-3">
                  <CardHeader
                    title="Employees needing attention"
                    description="At least one expired or missing requirement"
                    actions={<Badge tone="danger">{compliance.data.employeesAtRisk.length}</Badge>}
                  />
                  <Table>
                    <thead>
                      <tr>
                        <Th>Employee</Th>
                        <Th className="hidden sm:table-cell">Department</Th>
                        <Th className="w-20 text-right">Expired</Th>
                        <Th className="w-20 text-right">Missing</Th>
                        <Th className="w-28 text-right">Compliance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliance.data.employeesAtRisk.map((employee) => (
                        <tr key={employee.employeeId}>
                          <Td className="font-medium">{employee.name}</Td>
                          <Td className="hidden text-ink-muted sm:table-cell">
                            {employee.department ?? '—'}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {employee.expired > 0 ? (
                              <span className="font-medium text-status-expired">
                                {employee.expired}
                              </span>
                            ) : (
                              '0'
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {employee.missing > 0 ? (
                              <span className="font-medium text-status-missing">
                                {employee.missing}
                              </span>
                            ) : (
                              '0'
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatPercent(employee.compliancePercent)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
