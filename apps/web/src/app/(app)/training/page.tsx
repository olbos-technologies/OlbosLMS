'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@olbos/ui';
import { api, type ApiClientError } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { titleCase } from '@/lib/format';

interface RequirementRow {
  id: string;
  name: string;
  description: string | null;
  scopeType: string;
  dueWithinDays: number | null;
  renewalIntervalDays: number | null;
  isMandatory: boolean;
  isActive: boolean;
  basis: string | null;
  course: { id: string; title: string; type: string };
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  jobRole: { id: string; title: string } | null;
  hazardExposure: string | null;
  equipmentKey: string | null;
  shift: string | null;
  employmentType: string | null;
  _count: { complianceStates: number };
}

/** Describes a requirement's audience in the words a safety manager would use. */
const describeScope = (requirement: RequirementRow): string => {
  switch (requirement.scopeType) {
    case 'ORGANIZATION':
      return 'Everyone in the organization';
    case 'DEPARTMENT':
      return `Department: ${requirement.department?.name ?? '—'}`;
    case 'LOCATION':
      return `Location: ${requirement.location?.name ?? '—'}`;
    case 'JOB_ROLE':
      return `Job role: ${requirement.jobRole?.title ?? '—'}`;
    case 'EMPLOYMENT_TYPE':
      return `Employment type: ${titleCase(requirement.employmentType ?? '')}`;
    case 'SHIFT':
      return `Shift: ${requirement.shift ?? '—'}`;
    case 'HAZARD_EXPOSURE':
      return `Hazard exposure: ${requirement.hazardExposure ?? '—'}`;
    case 'EQUIPMENT_AUTHORIZATION':
      return `Equipment: ${requirement.equipmentKey ?? '—'}`;
    case 'INDIVIDUAL':
      return 'One named employee';
    default:
      return titleCase(requirement.scopeType);
  }
};

/**
 * Required training (§13).
 *
 * The point of this screen is the "who" column: a requirement is a rule about
 * an audience, not a list of names, and it keeps applying as people join,
 * change role or gain an equipment authorisation.
 */
export default function RequiredTrainingPage() {
  const requirements = useQuery<Paginated<RequirementRow>, ApiClientError>({
    queryKey: ['training', 'requirements'],
    queryFn: async () => {
      const response = await api.get<RequirementRow[]>('/api/v1/training/requirements', {
        pageSize: 100,
      });
      return { data: response.data, meta: response.meta } as Paginated<RequirementRow>;
    },
  });

  return (
    <>
      <PageHeader
        title="Required Training"
        description="Rules that decide who must complete which training, and how often."
        actions={
          <Link
            href="/training/matrix"
            className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-muted"
          >
            Open matrix
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Training requirements"
          description="Applied automatically when someone is hired or changes role"
          actions={
            requirements.data ? (
              <Badge tone="neutral">{requirements.data.meta.total} rule(s)</Badge>
            ) : null
          }
        />

        {requirements.isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : requirements.error ? (
          <div className="p-4">
            <Alert tone="danger" title="Could not load requirements">
              {requirements.error.message}
            </Alert>
          </div>
        ) : requirements.data!.data.length === 0 ? (
          <EmptyState
            title="No training requirements yet"
            description="A requirement links a course to an audience — a job role, a department, a hazard exposure or an equipment authorisation."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Requirement</Th>
                <Th>Course</Th>
                <Th className="hidden md:table-cell">Who it applies to</Th>
                <Th className="hidden lg:table-cell w-28">Due within</Th>
                <Th className="hidden lg:table-cell w-28">Renews</Th>
                <Th className="w-24 text-right">Tracked</Th>
              </tr>
            </thead>
            <tbody>
              {requirements.data!.data.map((requirement) => (
                <tr key={requirement.id} className="hover:bg-surface-muted/60">
                  <Td>
                    <p className="font-medium text-ink">{requirement.name}</p>
                    {requirement.basis ? (
                      <p className="mt-0.5 max-w-md text-[11px] text-ink-subtle">
                        {requirement.basis}
                      </p>
                    ) : null}
                    {!requirement.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                  </Td>
                  <Td className="text-xs">{requirement.course.title}</Td>
                  <Td className="hidden text-xs md:table-cell">{describeScope(requirement)}</Td>
                  <Td className="hidden text-xs lg:table-cell">
                    {requirement.dueWithinDays === null
                      ? 'No deadline'
                      : `${requirement.dueWithinDays} days`}
                  </Td>
                  <Td className="hidden text-xs lg:table-cell">
                    {requirement.renewalIntervalDays
                      ? `${requirement.renewalIntervalDays} days`
                      : 'Course default'}
                  </Td>
                  <Td className="text-right text-xs tabular-nums">
                    {requirement._count.complianceStates}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-subtle">
        Renewal intervals and warning windows are your organization&apos;s own policy. OLBOS does
        not set them from any regulation.
      </p>
    </>
  );
}
