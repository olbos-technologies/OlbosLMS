'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, CardHeader, KpiCard, Skeleton, Table, Td, Th } from '@olbos/ui';
import { api, type ApiClientError } from '@/lib/api';
import type { SafetyDashboard } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { complianceTone, formatDate } from '@/lib/format';

interface WorklistRow {
  status: string;
  dueAt: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
    department: { name: string } | null;
    location: { name: string } | null;
    supervisor: { firstName: string; lastName: string } | null;
  };
  requirement: { id: string; name: string; course: { id: string; title: string } };
}

/**
 * Safety Command Center (§19).
 *
 * The KPI row is the executive answer; the worklists below it are the operator
 * answer. Both come from the same compliance states, so the number on the card
 * and the number of rows in the list can never disagree.
 */
export default function SafetyPage() {
  const dashboard = useQuery<SafetyDashboard, ApiClientError>({
    queryKey: ['safety', 'dashboard'],
    queryFn: async () => (await api.get<SafetyDashboard>('/api/v1/safety/dashboard')).data,
  });

  const expiring = useQuery({
    queryKey: ['compliance', 'expiring'],
    queryFn: async () => (await api.get<WorklistRow[]>('/api/v1/compliance/expiring')).data,
  });

  const expired = useQuery({
    queryKey: ['compliance', 'expired'],
    queryFn: async () => (await api.get<WorklistRow[]>('/api/v1/compliance/expired')).data,
  });

  const missing = useQuery({
    queryKey: ['compliance', 'missing'],
    queryFn: async () => (await api.get<WorklistRow[]>('/api/v1/compliance/missing')).data,
  });

  if (dashboard.error) {
    return (
      <>
        <PageHeader title="Safety Command Center" />
        <Alert
          tone={dashboard.error.needsUpgrade ? 'warning' : 'danger'}
          title={dashboard.error.needsUpgrade ? 'Not included in your plan' : 'Could not load'}
        >
          {dashboard.error.message}
        </Alert>
      </>
    );
  }

  const kpis = dashboard.data?.kpis;

  return (
    <>
      <PageHeader
        title="Safety Command Center"
        description={
          dashboard.data
            ? `Across ${kpis?.activeEmployees ?? 0} active employees · generated ${formatDate(dashboard.data.generatedAt)}`
            : 'Organization-wide safety training position'
        }
      />

      {dashboard.isLoading || !kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Overall compliance"
            value={kpis.overallCompliancePercent.toFixed(1)}
            unit="%"
            tone={complianceTone(kpis.overallCompliancePercent)}
            hint="Of all applicable requirements"
          />
          <KpiCard
            label="Employees missing training"
            value={kpis.employeesMissingTraining}
            tone={kpis.employeesMissingTraining > 0 ? 'danger' : 'success'}
            hint="At least one expired or missing item"
          />
          <KpiCard
            label="Training expiring"
            value={kpis.trainingItemsExpiring}
            tone={kpis.trainingItemsExpiring > 0 ? 'warning' : 'success'}
            hint="Inside the warning window"
          />
          <KpiCard
            label="Expired certifications"
            value={kpis.expiredCertifications}
            tone={kpis.expiredCertifications > 0 ? 'danger' : 'success'}
            hint="Past their renewal date"
          />
          <KpiCard
            label="Completed this month"
            value={kpis.completedThisMonth}
            tone="brand"
            hint="Training records created"
          />
        </div>
      )}

      {kpis && (kpis.openIncidents > 0 || kpis.openCorrectiveActions > 0) ? (
        <div className="mt-4">
          <Alert tone="warning" title="Open safety work">
            {kpis.openIncidents} incident(s) under investigation and {kpis.openCorrectiveActions}{' '}
            corrective action(s) still open.
          </Alert>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Worklist
          title="Expiring training"
          description="Still valid, but approaching renewal"
          rows={expiring.data}
          loading={expiring.isLoading}
          error={expiring.error as ApiClientError | null}
          emptyMessage="Nothing is due for renewal in the warning window."
          showExpiry
        />
        <Worklist
          title="Expired training"
          description="No longer current"
          rows={expired.data}
          loading={expired.isLoading}
          error={expired.error as ApiClientError | null}
          emptyMessage="No expired training."
          showExpiry
        />
        <Worklist
          title="Missing training"
          description="Required but never completed"
          rows={missing.data}
          loading={missing.isLoading}
          error={missing.error as ApiClientError | null}
          emptyMessage="Every requirement has been met or assigned."
        />
      </div>

      <p className="mt-6 text-xs text-ink-subtle">
        These figures describe training this organization recorded in OLBOS. They are not a
        determination of compliance with any law or regulation.{' '}
        <Link href="/training/matrix" className="text-brand-700 underline-offset-2 hover:underline">
          Open the training matrix
        </Link>{' '}
        for the full picture.
      </p>
    </>
  );
}

const Worklist = ({
  title,
  description,
  rows,
  loading,
  error,
  emptyMessage,
  showExpiry,
}: {
  title: string;
  description: string;
  rows: WorklistRow[] | undefined;
  loading: boolean;
  error: ApiClientError | null;
  emptyMessage: string;
  showExpiry?: boolean;
}) => (
  <Card>
    <CardHeader
      title={title}
      description={description}
      actions={
        rows ? (
          <span className="text-xs font-semibold tabular-nums text-ink-muted">{rows.length}</span>
        ) : null
      }
    />
    {loading ? (
      <div className="p-4">
        <Skeleton className="h-32" />
      </div>
    ) : error ? (
      <div className="p-4">
        <Alert tone="danger">{error.message}</Alert>
      </div>
    ) : (rows?.length ?? 0) === 0 ? (
      <p className="px-5 py-8 text-center text-xs text-ink-muted">{emptyMessage}</p>
    ) : (
      <div className="max-h-96 overflow-y-auto">
        <Table>
          <thead className="sticky top-0">
            <tr>
              <Th>Employee</Th>
              <Th>Course</Th>
              <Th className="w-24">{showExpiry ? 'Expires' : 'Due'}</Th>
            </tr>
          </thead>
          <tbody>
            {rows!.slice(0, 50).map((row) => (
              <tr key={`${row.employee.id}-${row.requirement.id}`}>
                <Td>
                  <p className="font-medium text-ink">
                    {row.employee.lastName}, {row.employee.firstName}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {row.employee.department?.name ?? '—'}
                  </p>
                </Td>
                <Td className="text-xs">{row.requirement.course.title}</Td>
                <Td className="text-xs whitespace-nowrap">
                  {formatDate(showExpiry ? row.expiresAt : row.dueAt)}
                  {row.daysUntilExpiry !== null && showExpiry ? (
                    <span className="block text-[11px] text-ink-subtle">
                      {row.daysUntilExpiry >= 0
                        ? `${row.daysUntilExpiry}d left`
                        : `${Math.abs(row.daysUntilExpiry)}d ago`}
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows!.length > 50 ? (
          <p className="border-t border-border px-3 py-2 text-[11px] text-ink-subtle">
            Showing the first 50 of {rows!.length}.
          </p>
        ) : null}
      </div>
    )}
  </Card>
);
