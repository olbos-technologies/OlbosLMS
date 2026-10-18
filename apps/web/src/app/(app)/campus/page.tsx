'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Field, Input, Select, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { api, type Envelope } from '@/lib/api';

type Resource = 'programs' | 'terms' | 'courses' | 'sections';
interface Row {
  id: string;
  code: string;
  name?: string;
  title?: string;
  award?: string;
  requiredCredits?: number;
  credits?: number;
  capacity?: number;
  programId?: string;
  termId?: string;
  academicCourseId?: string;
  lmsCourseId?: string | null;
  startsOn?: string;
  endsOn?: string;
}
const labels: Record<Resource, string> = {
  programs: 'Programs',
  terms: 'Academic terms',
  courses: 'Academic courses',
  sections: 'Course sections',
};
const loadOptions = async (resource: Resource | 'lms'): Promise<Row[]> => {
  const rows: Row[] = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await api.get<Row[]>(
      resource === 'lms' ? '/api/v1/courses' : `/api/v1/campus/${resource}`,
      { page, pageSize: 200, ...(resource === 'lms' ? { type: 'ACADEMIC' } : {}) },
    );
    rows.push(...response.data);
    pages = Number(response.meta?.totalPages ?? 1);
    page++;
  } while (page <= pages);
  return rows;
};

export default function CampusPage() {
  const { can, hasEntitlement, isLoading } = useSession();
  const client = useQueryClient();
  const [resource, setResource] = useState<Resource>('programs');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const allowed = can('campus:read');
  const rows = useQuery({
    queryKey: ['campus', resource, page],
    queryFn: () => api.get<Row[]>(`/api/v1/campus/${resource}`, { page, pageSize: 25 }),
    enabled: allowed,
  });
  const programs = useQuery({
    queryKey: ['campus-options', 'programs'],
    queryFn: () => loadOptions('programs'),
    enabled: allowed,
  });
  const terms = useQuery({
    queryKey: ['campus-options', 'terms'],
    queryFn: () => loadOptions('terms'),
    enabled: allowed,
  });
  const courses = useQuery({
    queryKey: ['campus-options', 'courses'],
    queryFn: () => loadOptions('courses'),
    enabled: allowed,
  });
  const lmsCourses = useQuery({
    queryKey: ['campus-options', 'lms'],
    queryFn: () => loadOptions('lms'),
    enabled: allowed && can('course:read'),
  });
  const create = useMutation({
    mutationFn: ({ target, body }: { target: Resource; body: Record<string, unknown> }) =>
      api.post(`/api/v1/campus/${target}`, body),
    onSuccess: async () => {
      setMessage('Saved successfully.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['campus'] }),
        client.invalidateQueries({ queryKey: ['campus-options'] }),
        client.invalidateQueries({ queryKey: ['institution-setup'] }),
      ]);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(data.entries());
    for (const key of ['requiredCredits', 'credits', 'capacity']) {
      if (key in body) body[key] = Number(body[key]);
    }
    if (!body.lmsCourseId) delete body.lmsCourseId;
    create.mutate({ target: resource, body });
  };
  const choose = (value: Resource) => {
    setResource(value);
    setPage(1);
    setMessage('');
    create.reset();
  };
  const lookup = (options: Row[] | undefined, id?: string) =>
    options?.find((row) => row.id === id)?.code ?? '—';
  const optionField = (key: string, label: string, options: Row[] | undefined) => (
    <Field label={label} htmlFor={`campus-${key}`} required>
      <Select id={`campus-${key}`} name={key} required defaultValue="">
        <option value="" disabled>
          Select {label.toLowerCase()}
        </option>
        {options?.map((row) => (
          <option key={row.id} value={row.id}>
            {row.code} · {row.name ?? row.title}
          </option>
        ))}
      </Select>
    </Field>
  );
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!allowed)
    return (
      <Alert tone="warning" title="College administration access required">
        Ask your institution administrator for campus access.
      </Alert>
    );
  const error = rows.error ?? programs.error ?? terms.error ?? courses.error;
  const response = rows.data as Envelope<Row[]> | undefined;
  return (
    <>
      <PageHeader
        title="Olbos Campus"
        description="Manage your institution’s academic programs, terms, courses, and sections."
      />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Academic records">
        {(Object.keys(labels) as Resource[]).map((key) => (
          <Button
            key={key}
            variant={resource === key ? 'primary' : 'secondary'}
            aria-pressed={resource === key}
            onClick={() => choose(key)}
            disabled={create.isPending}
          >
            {labels[key]}
          </Button>
        ))}
      </div>
      {error ? (
        <Alert tone="danger" title="Unable to load academic records">
          {error.message}
        </Alert>
      ) : null}
      {!hasEntitlement('CAMPUS_MODULE') ? (
        <Alert
          className="mb-4"
          tone="warning"
          title="Campus creation is not included in the current subscription"
        >
          Existing academic records remain visible. Ask your institution administrator to review the
          subscription or trial end date.
        </Alert>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">{labels[resource]}</h2>
            <Badge>{Number(response?.meta?.total ?? 0)} records</Badge>
          </div>
          {rows.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : response?.data.length ? (
            <ul className="divide-y divide-border">
              {response.data.map((row) => (
                <li key={row.id} className="py-3">
                  <p className="text-sm font-semibold text-ink">
                    {row.code}
                    {row.name || row.title ? ` · ${row.name ?? row.title}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {resource === 'programs'
                      ? `${row.award?.toLowerCase()} · ${row.requiredCredits} required credits`
                      : null}
                    {resource === 'terms'
                      ? `${row.startsOn?.slice(0, 10)} to ${row.endsOn?.slice(0, 10)}`
                      : null}
                    {resource === 'courses'
                      ? `${lookup(programs.data, row.programId)} · ${row.credits} credits`
                      : null}
                    {resource === 'sections'
                      ? `${lookup(courses.data, row.academicCourseId)} · ${lookup(terms.data, row.termId)} · capacity ${row.capacity} · ${row.lmsCourseId ? 'LMS course linked' : 'No LMS course linked'}`
                      : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">
              No {labels[resource].toLowerCase()} yet.
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={page === 1 || rows.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-ink-muted">
              Page {page} of {Number(response?.meta?.totalPages ?? 1)}
            </span>
            <Button
              variant="secondary"
              disabled={page >= Number(response?.meta?.totalPages ?? 1) || rows.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
        {can('campus:manage') && hasEntitlement('CAMPUS_MODULE') ? (
          <Card className="p-4">
            <h2 className="mb-4 font-semibold text-ink">
              Add{' '}
              {resource === 'programs'
                ? 'program'
                : resource === 'terms'
                  ? 'term'
                  : resource === 'courses'
                    ? 'course'
                    : 'section'}
            </h2>
            <form key={resource} onSubmit={submit} className="space-y-3">
              <Field label="Code" htmlFor="campus-code" required>
                <Input
                  id="campus-code"
                  name="code"
                  required
                  maxLength={32}
                  pattern="[A-Za-z0-9_-]+"
                  placeholder={
                    resource === 'terms' ? 'FALL-2027' : resource === 'sections' ? '001' : 'CS'
                  }
                />
              </Field>
              {resource !== 'sections' ? (
                <Field
                  label={resource === 'courses' ? 'Title' : 'Name'}
                  htmlFor="campus-name"
                  required
                >
                  <Input
                    id="campus-name"
                    name={resource === 'courses' ? 'title' : 'name'}
                    minLength={2}
                    maxLength={200}
                    required
                  />
                </Field>
              ) : null}
              {resource === 'programs' ? (
                <>
                  <Field label="Award" htmlFor="campus-award">
                    <Select id="campus-award" name="award">
                      {['CERTIFICATE', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE'].map(
                        (award) => (
                          <option key={award}>{award}</option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <Field label="Required credits" htmlFor="campus-requiredCredits" required>
                    <Input
                      id="campus-requiredCredits"
                      name="requiredCredits"
                      type="number"
                      min={1}
                      max={500}
                      step={1}
                      required
                    />
                  </Field>
                </>
              ) : null}
              {resource === 'terms' ? (
                <>
                  <Field label="Start date" htmlFor="campus-startsOn" required>
                    <Input id="campus-startsOn" name="startsOn" type="date" required />
                  </Field>
                  <Field label="End date" htmlFor="campus-endsOn" required>
                    <Input id="campus-endsOn" name="endsOn" type="date" required />
                  </Field>
                </>
              ) : null}
              {resource === 'courses' ? (
                <>
                  {optionField('programId', 'Program', programs.data)}
                  <Field label="Credits" htmlFor="campus-credits" required>
                    <Input
                      id="campus-credits"
                      name="credits"
                      type="number"
                      min={0}
                      max={30}
                      step={1}
                      required
                    />
                  </Field>
                </>
              ) : null}
              {resource === 'sections' ? (
                <>
                  {optionField('academicCourseId', 'Academic course', courses.data)}
                  {optionField('termId', 'Term', terms.data)}
                  <Field label="Capacity" htmlFor="campus-capacity" required>
                    <Input
                      id="campus-capacity"
                      name="capacity"
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      required
                    />
                  </Field>
                  {can('course:read') ? (
                    <Field
                      label="LMS teaching course (optional)"
                      htmlFor="campus-lmsCourseId"
                      hint="Link an existing academic LMS course."
                    >
                      <Select
                        id="campus-lmsCourseId"
                        name="lmsCourseId"
                        defaultValue=""
                        disabled={lmsCourses.isLoading || !!lmsCourses.error}
                      >
                        <option value="">No LMS course linked</option>
                        {lmsCourses.data?.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.code ? `${course.code} · ` : ''}
                            {course.title}
                          </option>
                        ))}
                      </Select>
                      {lmsCourses.error ? <p role="alert">{lmsCourses.error.message}</p> : null}
                    </Field>
                  ) : null}
                </>
              ) : null}
              {create.error ? (
                <Alert tone="danger" title="Unable to save">
                  {create.error.message}
                </Alert>
              ) : null}
              {message ? (
                <p role="status" className="text-sm text-ink">
                  {message}
                </p>
              ) : null}
              <Button type="submit" disabled={create.isPending || !!error}>
                {create.isPending ? 'Saving…' : 'Save record'}
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
      <p className="mt-5 text-xs text-ink-subtle">
        Academic foundation · Admissions, student registration, transcripts, and tuition billing are
        planned for later phases.
      </p>
    </>
  );
}
