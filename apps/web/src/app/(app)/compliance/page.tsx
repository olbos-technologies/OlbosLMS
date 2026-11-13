'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  KpiCard,
  ProgressBar,
  Skeleton,
  Table,
  Td,
  Th,
} from '@olbos/ui';
import { api, type ApiClientError, exportUrl } from '@/lib/api';
import type { ComplianceDashboard, RollupBucket } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { complianceTone, formatDate, formatPercent } from '@/lib/format';

/**
 * Compliance dashboard (§20).
 *
 * The drill-down the specification describes — organization, department,
 * location, job role, course — rendered as four rollups ordered worst-first,
 * because the useful question is always "where is the problem", never "what is
 * the alphabetical order of my departments".
 */
export default function CompliancePage() {
  const dashboard = useQuery<ComplianceDashboard, ApiClientError>({
    queryKey: ['compliance', 'dashboard'],
    queryFn: async () => (await api.get<ComplianceDashboard>('/api/v1/compliance/dashboard')).data,
  });

  if (dashboard.error) {
    return (
      <>
        <PageHeader title="Compliance Dashboard" />
        <Alert tone="danger" title="Could not load compliance">
          {dashboard.error.message}
        </Alert>
      </>
    );
  }

  const data = dashboard.data;

  return (
    <>
      <PageHeader
        title="Compliance Dashboard"
        description={
          data
            ? `${data.scope === 'compliance:read_team' ? 'Your team' : 'Your organization'} · generated ${formatDate(data.generatedAt)}`
            : undefined
        }
        actions={
          <a
            href={exportUrl('/api/v1/reports/training_compliance', { format: 'csv' })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-muted"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Export report
          </a>
        }
      />

      {dashboard.isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Overall compliance"
              value={data.summary.compliancePercent.toFixed(1)}
              unit="%"
              tone={complianceTone(data.summary.compliancePercent)}
              hint={`${data.summary.total - data.summary.notApplicable} applicable requirement(s)`}
            />
            <KpiCard
              label="Expired"
              value={data.summary.expired}
              tone={data.summary.expired > 0 ? 'danger' : 'success'}
              hint="Past their renewal date"
            />
            <KpiCard
              label="Missing"
              value={data.summary.missing}
              tone={data.summary.missing > 0 ? 'danger' : 'success'}
              hint="Required but not completed"
            />
            <KpiCard
              label="Expiring soon"
              value={data.summary.expiringSoon}
              tone={data.summary.expiringSoon > 0 ? 'warning' : 'success'}
              hint="Inside the warning window"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Rollup title="By department" buckets={data.byDepartment} />
            <Rollup title="By location" buckets={data.byLocation} />
            <Rollup title="By job role" buckets={data.byJobRole} />
            <Rollup title="By course" buckets={data.byCourse} label="Course" />
          </div>
        </>
      )}
    </>
  );
}

const Rollup = ({
  title,
  buckets,
  label = 'Group',
}: {
  title: string;
  buckets: RollupBucket[];
  label?: string;
}) => (
  <Card>
    <CardHeader title={title} description="Lowest compliance first" />
    {buckets.length === 0 ? (
      <EmptyState title="No data yet" />
    ) : (
      <Table>
        <thead>
          <tr>
            <Th>{label}</Th>
            <Th className="w-20 text-right">People</Th>
            <Th className="w-44">Compliance</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
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
);
