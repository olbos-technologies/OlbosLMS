'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@olbos/ui';
import { api, type ApiClientError } from '@/lib/api';
import type { EmployeeListItem, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { formatDate, titleCase } from '@/lib/format';

/**
 * Employee directory.
 *
 * The list the API returns is already scoped to what the caller may see — an
 * administrator gets the organization, a supervisor gets their team — and the
 * header states which, so a supervisor is never left wondering whether they are
 * looking at everyone.
 */
export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const employees = useQuery<Paginated<EmployeeListItem>, ApiClientError>({
    queryKey: ['employees', { search, page }],
    queryFn: async () => {
      const response = await api.get<EmployeeListItem[]>('/api/v1/employees', {
        search: search.trim() || undefined,
        page,
        pageSize: 25,
      });
      return { data: response.data, meta: response.meta } as Paginated<EmployeeListItem>;
    },
  });

  const scope = employees.data?.meta.scope;
  const total = employees.data?.meta.total ?? 0;
  const totalPages = employees.data?.meta.totalPages ?? 1;

  return (
    <>
      <PageHeader
        title="Employees"
        description={
          scope === 'employee:read_team'
            ? 'The employees you supervise.'
            : scope === 'employee:read_own'
              ? 'Your own record.'
              : 'Everyone in your organization.'
        }
        actions={
          employees.data ? (
            <Badge tone="neutral">
              {total} record{total === 1 ? '' : 's'}
            </Badge>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <Field label="Search" htmlFor="employee-search">
          <div className="relative max-w-md">
            <Search
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              id="employee-search"
              type="search"
              className="pl-8"
              placeholder="Name, employee number or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </Field>
      </Card>

      <Card>
        {employees.isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : employees.error ? (
          <div className="p-4">
            <Alert tone="danger" title="Could not load employees">
              {employees.error.message}
            </Alert>
          </div>
        ) : employees.data!.data.length === 0 ? (
          <EmptyState
            title="No employees found"
            description={
              search
                ? 'No one matches that search.'
                : 'Add employees to start assigning and tracking training.'
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th className="hidden md:table-cell">Job role</Th>
                  <Th className="hidden lg:table-cell">Department</Th>
                  <Th className="hidden lg:table-cell">Location</Th>
                  <Th className="hidden xl:table-cell">Supervisor</Th>
                  <Th className="hidden sm:table-cell">Hired</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {employees.data!.data.map((employee) => (
                  <tr key={employee.id} className="hover:bg-surface-muted/60">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar firstName={employee.firstName} lastName={employee.lastName} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {employee.lastName}, {employee.firstName}
                          </p>
                          <p className="truncate text-[11px] text-ink-subtle">
                            {employee.employeeNumber ?? employee.email ?? '—'}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden text-xs md:table-cell">
                      {employee.jobRole?.title ?? '—'}
                    </Td>
                    <Td className="hidden text-xs lg:table-cell">
                      {employee.department?.name ?? '—'}
                    </Td>
                    <Td className="hidden text-xs lg:table-cell">
                      {employee.location?.name ?? '—'}
                    </Td>
                    <Td className="hidden text-xs xl:table-cell">
                      {employee.supervisor
                        ? `${employee.supervisor.lastName}, ${employee.supervisor.firstName}`
                        : '—'}
                    </Td>
                    <Td className="hidden text-xs whitespace-nowrap sm:table-cell">
                      {formatDate(employee.hireDate)}
                    </Td>
                    <Td>
                      <Badge tone={employee.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {titleCase(employee.status)}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-ink-muted">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border border-border-strong px-2.5 py-1 text-xs disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border-strong px-2.5 py-1 text-xs disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
