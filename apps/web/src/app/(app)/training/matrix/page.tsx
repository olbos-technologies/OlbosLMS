'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Filter } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  STATUS_STYLES,
  type ComplianceStatus,
} from '@olbos/ui';
import { api, type ApiClientError, exportUrl } from '@/lib/api';
import type { ComplianceSummary, TrainingMatrix } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { complianceTone, formatDate, formatPercent } from '@/lib/format';

/**
 * The training matrix (§12).
 *
 * Employees down, courses across, a compliance status in each cell. Two things
 * make it usable rather than merely correct:
 *
 *   * The employee column is sticky, because the grid is wider than any screen
 *     once an organization has a dozen safety courses.
 *   * Every cell carries a text label and a glyph, not only a colour. A safety
 *     manager who is colour blind, or who printed the grid, must still be able
 *     to read it.
 */

const STATUS_OPTIONS: ComplianceStatus[] = [
  'CURRENT',
  'EXPIRING_SOON',
  'EXPIRED',
  'MISSING',
  'IN_PROGRESS',
  'PENDING',
];

export default function TrainingMatrixPage() {
  const { hasEntitlement } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [expiringWithinDays, setExpiringWithinDays] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      statuses: status || undefined,
      expiringWithinDays: expiringWithinDays || undefined,
    }),
    [search, status, expiringWithinDays],
  );

  const matrix = useQuery<{ data: TrainingMatrix; meta: Record<string, unknown> }, ApiClientError>({
    queryKey: ['compliance', 'matrix', query],
    queryFn: async () => {
      const response = await api.get<TrainingMatrix>('/api/v1/compliance/matrix', query);
      return { data: response.data, meta: response.meta ?? {} };
    },
    enabled: hasEntitlement('TRAINING_MATRIX'),
  });

  if (!hasEntitlement('TRAINING_MATRIX')) {
    return (
      <>
        <PageHeader title="Training Matrix" />
        <Alert tone="warning" title="Not included in your plan">
          The training matrix is part of the Professional plan. Your organization owner can change
          the plan under Administration → Billing.
        </Alert>
      </>
    );
  }

  const summary = matrix.data?.meta.summary as ComplianceSummary | undefined;
  const courses = matrix.data?.data.courses ?? [];
  const rows = matrix.data?.data.rows ?? [];

  return (
    <>
      <PageHeader
        title="Training Matrix"
        description="Every employee against every training requirement."
        actions={
          <>
            <Button
              size="sm"
              icon={<Filter className="size-3.5" aria-hidden="true" />}
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
            >
              Filters
            </Button>
            <a
              href={exportUrl('/api/v1/compliance/matrix.csv', query)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-muted"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Export CSV
            </a>
          </>
        }
      />

      {showFilters ? (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Search employees" htmlFor="matrix-search">
              <Input
                id="matrix-search"
                type="search"
                placeholder="Name or employee number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="matrix-status">
              <Select
                id="matrix-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_STYLES[option].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Expiring within"
              htmlFor="matrix-expiring"
              hint="Excludes items that already expired"
            >
              <Select
                id="matrix-expiring"
                value={expiringWithinDays}
                onChange={(event) => setExpiringWithinDays(event.target.value)}
              >
                <option value="">Any time</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </Select>
            </Field>
          </div>
        </Card>
      ) : null}

      {summary ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge tone={complianceTone(summary.compliancePercent)}>
            {formatPercent(summary.compliancePercent)} compliant
          </Badge>
          <span className="text-xs text-ink-muted">
            {rows.length} employee{rows.length === 1 ? '' : 's'} · {courses.length} course
            {courses.length === 1 ? '' : 's'}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((option) => (
              <StatusBadge key={option} status={option} />
            ))}
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {matrix.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-64" />
          </div>
        ) : matrix.error ? (
          <div className="p-4">
            <Alert tone="danger" title="Could not load the matrix">
              {matrix.error.message}
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No employees match"
            description="Adjust the filters, or add employees and training requirements to build the matrix."
          />
        ) : (
          <div className="scroll-x max-h-[70vh] overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Training compliance by employee and course</caption>
              <thead>
                <tr>
                  {/* Sticky in both directions: the grid is read by scanning. */}
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-20 min-w-56 border-r border-b border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold text-ink-muted"
                  >
                    Employee
                  </th>
                  {courses.map((course) => (
                    <th
                      key={course.id}
                      scope="col"
                      className="sticky top-0 z-10 min-w-28 border-b border-border bg-surface-muted px-2 py-2 text-left text-xs font-semibold text-ink-muted"
                    >
                      <span className="block max-w-32 leading-tight">{course.title}</span>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="sticky top-0 z-10 min-w-24 border-b border-l border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold text-ink-muted"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employee.id} className="hover:bg-surface-muted/60">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-r border-b border-border bg-surface px-3 py-2 text-left font-normal"
                    >
                      <span className="block text-[13px] font-medium text-ink">
                        {row.employee.lastName}, {row.employee.firstName}
                      </span>
                      <span className="block text-[11px] text-ink-subtle">
                        {row.employee.employeeNumber ?? '—'}
                        {row.employee.departmentName ? ` · ${row.employee.departmentName}` : ''}
                      </span>
                    </th>

                    {courses.map((course) => {
                      const cell = row.cells[course.id];
                      const status: ComplianceStatus = cell?.status ?? 'NOT_APPLICABLE';
                      return (
                        <td key={course.id} className="border-b border-border px-2 py-2">
                          <StatusBadge
                            status={status}
                            title={
                              cell
                                ? `${STATUS_STYLES[status].label}${
                                    cell.expiresAt
                                      ? ` · expires ${formatDate(cell.expiresAt)}`
                                      : cell.dueAt
                                        ? ` · due ${formatDate(cell.dueAt)}`
                                        : ''
                                  }`
                                : 'This requirement does not apply to this employee'
                            }
                          />
                        </td>
                      );
                    })}

                    <td className="border-b border-l border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={row.rowStatus} showGlyph={false} />
                        <span
                          className={cn(
                            'text-xs font-medium tabular-nums',
                            complianceTone(row.summary.compliancePercent) === 'success'
                              ? 'text-status-current'
                              : complianceTone(row.summary.compliancePercent) === 'warning'
                                ? 'text-status-expiring'
                                : 'text-status-expired',
                          )}
                        >
                          {formatPercent(row.summary.compliancePercent)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-subtle">
        A cell reads N/A when the requirement does not apply to that employee — for example a
        forklift requirement for someone who is not an authorised operator.
      </p>
    </>
  );
}
