'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Field, Input, Select, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';

interface Setup {
  organization: {
    name: string;
    legalName: string | null;
    slug: string;
    type: string;
    contactEmail: string | null;
    billingEmail: string | null;
    websiteUrl: string | null;
    timezone: string;
    brandColor: string | null;
  };
  checklist: { key: string; label: string; complete: boolean; href: string }[];
}

export default function InstitutionSetupPage() {
  const { can, isLoading, refetch } = useSession();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const setup = useQuery({
    queryKey: ['institution-setup'],
    queryFn: async () => (await api.get<Setup>('/api/v1/institutions/setup')).data,
    enabled: can('organization:update'),
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/api/v1/institutions/profile', body),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['institution-setup'] });
      refetch();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    const body: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ['websiteUrl', 'brandColor', 'billingEmail'])
      if (key in body && !body[key]) body[key] = null;
    update.mutate(body);
  };
  if (isLoading || setup.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!can('organization:update'))
    return <Alert tone="warning" title="Institution administrator access required" />;
  if (setup.error)
    return (
      <Alert tone="danger" title="Unable to load institution">
        {setup.error.message}
      </Alert>
    );
  if (!setup.data) return null;
  const { organization, checklist } = setup.data;
  const complete = checklist.filter((step) => step.complete).length;
  return (
    <>
      <PageHeader
        title="Institution Setup"
        description="One workspace for your institution, its administrators, and academic structure."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <h2 className="mb-1 text-base font-semibold text-ink">Institution profile</h2>
          <p className="mb-5 break-all text-xs text-ink-muted">
            Workspace: {organization.slug}. Use this code when signing in to your institution.
          </p>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Institution name" htmlFor="institution-name" required>
              <Input
                id="institution-name"
                name="name"
                defaultValue={organization.name}
                minLength={2}
                maxLength={200}
                required
              />
            </Field>
            <Field label="Legal name" htmlFor="institution-legalName" required>
              <Input
                id="institution-legalName"
                name="legalName"
                defaultValue={organization.legalName ?? ''}
                minLength={2}
                maxLength={200}
                required
              />
            </Field>
            <Field label="Institution type" htmlFor="institution-type">
              <Select
                id="institution-type"
                name="type"
                defaultValue={
                  ['UNIVERSITY', 'COLLEGE', 'SCHOOL', 'TRAINING_CENTER'].includes(organization.type)
                    ? organization.type
                    : 'OTHER'
                }
              >
                {['UNIVERSITY', 'COLLEGE', 'SCHOOL', 'TRAINING_CENTER', 'OTHER'].map((type) => (
                  <option key={type} value={type}>
                    {type.toLowerCase().replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact email" htmlFor="institution-contactEmail" required>
              <Input
                id="institution-contactEmail"
                name="contactEmail"
                type="email"
                defaultValue={organization.contactEmail ?? ''}
                required
              />
            </Field>
            {can('billing:manage') ? (
              <Field label="Billing email" htmlFor="institution-billingEmail">
                <Input
                  id="institution-billingEmail"
                  name="billingEmail"
                  type="email"
                  defaultValue={organization.billingEmail ?? ''}
                />
              </Field>
            ) : null}
            <Field label="Website (optional)" htmlFor="institution-websiteUrl">
              <Input
                id="institution-websiteUrl"
                name="websiteUrl"
                type="url"
                placeholder="https://college.example"
                defaultValue={organization.websiteUrl ?? ''}
              />
            </Field>
            <Field
              label="Timezone"
              htmlFor="institution-timezone"
              hint="IANA timezone, such as America/Chicago."
              required
            >
              <Input
                id="institution-timezone"
                name="timezone"
                defaultValue={organization.timezone}
                required
              />
            </Field>
            <Field
              label="Brand color (optional)"
              htmlFor="institution-brandColor"
              hint="Stored for branding; this phase does not reskin the portal."
            >
              <Input
                id="institution-brandColor"
                name="brandColor"
                pattern="#[0-9a-fA-F]{6}"
                placeholder="#123456"
                defaultValue={organization.brandColor ?? ''}
              />
            </Field>
            <div className="sm:col-span-2">
              {update.error ? (
                <Alert tone="danger" title="Unable to save">
                  {update.error.message}
                </Alert>
              ) : null}
              {saved ? (
                <p role="status" className="mb-3 text-sm text-ink">
                  Institution profile saved.
                </p>
              ) : null}
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save institution profile'}
              </Button>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">Setup progress</h2>
              <Badge>
                {complete} / {checklist.length}
              </Badge>
            </div>
            <ul className="mt-4 space-y-3">
              {checklist.map((step) => (
                <li key={step.key} className="flex items-start gap-2 text-sm">
                  <span aria-label={step.complete ? 'Complete' : 'Pending'}>
                    {step.complete ? '✓' : '○'}
                  </span>
                  <Link className="text-brand-700 underline" href={step.href}>
                    {step.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {can('billing:read') ? (
            <Card className="p-5">
              <h2 className="font-semibold text-ink">Institution subscription</h2>
              <p className="mt-2 text-xs text-ink-muted">
                Review monthly plans, usage, invoices, and payment settings.
              </p>
              <Link
                className="mt-3 inline-block text-sm font-medium text-brand-700 underline"
                href="/admin/billing"
              >
                Open billing
              </Link>
            </Card>
          ) : null}
          <Alert title="Your institution’s workspace">
            Setup progress reflects saved records. Student admissions, registration, transcripts,
            and tuition billing are later phases.
          </Alert>
        </div>
      </div>
    </>
  );
}
