'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, Field, Input, Select, Skeleton } from '@olbos/ui';
import { api } from '@/lib/api';
import type { CourseListItem, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/app-shell';
import { formatMinutes, titleCase } from '@/lib/format';

/**
 * Course catalogue.
 *
 * Every card states its training type and its renewal interval, because those
 * two facts decide what a completion actually means — and the §10 disclaimer is
 * shown on the course, not buried in a certificate nobody reads until an audit.
 */
export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');

  const courses = useQuery({
    queryKey: ['courses', { search, type }],
    queryFn: async () => {
      const response = await api.get<CourseListItem[]>('/api/v1/courses', {
        search: search.trim() || undefined,
        type: type || undefined,
        status: 'PUBLISHED',
        pageSize: 60,
      });
      return { data: response.data, meta: response.meta } as Paginated<CourseListItem>;
    },
  });

  return (
    <>
      <PageHeader
        title="Course Catalog"
        description="Published courses available in your organization."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Search" htmlFor="catalog-search">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
                aria-hidden="true"
              />
              <Input
                id="catalog-search"
                type="search"
                className="pl-8"
                placeholder="Course title or description"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Type" htmlFor="catalog-type">
            <Select
              id="catalog-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">All types</option>
              {[
                'SAFETY',
                'COMPLIANCE',
                'ACADEMIC',
                'PROFESSIONAL',
                'CERTIFICATION',
                'ORIENTATION',
                'REFRESHER',
                'MICROLEARNING',
              ].map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {courses.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : courses.error ? (
        <Alert tone="danger" title="Could not load the catalogue">
          {(courses.error as Error).message}
        </Alert>
      ) : (courses.data?.data.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            title="No published courses match"
            description="Try a different search, or ask an administrator to publish a course."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.data!.data.map((course) => {
            const version = course.publishedVersion;
            return (
              <Card key={course.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{course.title}</h2>
                  <Badge tone={course.type === 'SAFETY' ? 'warning' : 'neutral'}>
                    {titleCase(course.type)}
                  </Badge>
                </div>

                {course.summary ? (
                  <p className="mt-1.5 line-clamp-3 text-xs text-ink-muted">{course.summary}</p>
                ) : null}

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  <div>
                    <dt className="text-ink-subtle">Duration</dt>
                    <dd className="font-medium text-ink">
                      {formatMinutes(version?.estimatedMinutes ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Delivery</dt>
                    <dd className="font-medium text-ink">
                      {version ? titleCase(version.deliveryMethod) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Renewal</dt>
                    <dd className="font-medium text-ink">
                      {version?.renewalIntervalDays
                        ? `${version.renewalIntervalDays} days`
                        : 'Does not expire'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Certificate</dt>
                    <dd className="font-medium text-ink">
                      {version?.issuesCertificate ? 'Issued' : 'Not issued'}
                    </dd>
                  </div>
                </dl>

                {version ? (
                  <p className="mt-3 text-[11px]">
                    <span className="text-ink-subtle">Recorded as: </span>
                    <span className="font-medium text-ink">{titleCase(version.trainingType)}</span>
                  </p>
                ) : null}

                {version?.safetyProfile?.hazardCategories?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {version.safetyProfile.hazardCategories.slice(0, 4).map((hazard) => (
                      <Badge key={hazard} tone="neutral">
                        {hazard}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {version?.safetyProfile?.disclaimer ? (
                  // §10: the representation is shown with the course, not only
                  // on a certificate someone reads a year later.
                  <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-ink-subtle">
                    {version.safetyProfile.disclaimer}
                  </p>
                ) : null}

                <p className="mt-auto pt-3 text-[11px] text-ink-subtle">
                  {course._count.requirements} requirement
                  {course._count.requirements === 1 ? '' : 's'} · {course._count.trainingRecords}{' '}
                  completion
                  {course._count.trainingRecords === 1 ? '' : 's'}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
