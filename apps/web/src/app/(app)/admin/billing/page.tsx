'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Skeleton } from '@olbos/ui';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';

interface Plan {
  key: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: string;
  selfServiceAvailable: boolean;
  entitlements: { key: string; valueType: string; numValue: number | null }[];
}
interface Billing {
  subscription: {
    status: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    plan: Plan;
  } | null;
  billing: { onlineEnabled: boolean; portalAvailable: boolean; managedSubscription: boolean };
  usage: Record<string, { used: number; limit: number | null }>;
}
interface Invoice {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  currency: string;
  periodStart: string;
}
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
const usageLabels: Record<string, string> = {
  users: 'User accounts',
  courses: 'LMS courses',
  storageGb: 'Storage (GB)',
};

export default function InstitutionBillingPage() {
  const { can, isLoading } = useSession();
  const [selected, setSelected] = useState<Plan | null>(null);
  const billing = useQuery({
    queryKey: ['institution-billing'],
    refetchInterval: 30000,
    queryFn: async () => (await api.get<Billing>('/api/v1/billing/subscription')).data,
    enabled: can('billing:read'),
  });
  const plans = useQuery({
    queryKey: ['institution-plans'],
    queryFn: async () => (await api.get<Plan[]>('/api/v1/billing/plans')).data,
    enabled: can('billing:read'),
  });
  const invoices = useQuery({
    queryKey: ['institution-invoices'],
    refetchInterval: 30000,
    queryFn: async () => (await api.get<Invoice[]>('/api/v1/billing/invoices')).data,
    enabled: can('billing:read'),
  });
  const openPayment = useMutation({
    mutationFn: async ({ action, planKey }: { action: 'checkout' | 'portal'; planKey?: string }) =>
      (
        await api.post<{ url: string }>(
          `/api/v1/billing/${action}`,
          action === 'checkout' ? { planKey } : undefined,
        )
      ).data,
    onSuccess: ({ url }) => {
      const target = new URL(url);
      if (
        target.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(target.hostname)
      )
        throw new Error('Invalid payment destination.');
      window.location.assign(url);
    },
  });
  if (isLoading || billing.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!can('billing:read')) return <Alert tone="warning" title="Billing access required" />;
  if (billing.error)
    return (
      <Alert tone="danger" title="Unable to load billing">
        {billing.error.message}
      </Alert>
    );
  if (!billing.data) return null;
  const data = billing.data;
  const subscription = data.subscription;
  return (
    <>
      <PageHeader
        title="Institution Billing"
        description="Your institution’s Olbos subscription, monthly plans, and payment history."
      />
      <Alert title="Institution subscription">
        These charges pay for your institution’s use of Olbos. Student tuition and student payment
        accounts are separate future features.
      </Alert>
      {!data.billing.onlineEnabled ? (
        <Alert className="mt-4" tone="warning" title="Online payments are not enabled">
          Your subscription is managed by Olbos. Monthly checkout becomes available after the
          payment provider and plan prices are configured.
        </Alert>
      ) : null}
      {openPayment.error ? (
        <Alert className="mt-4" tone="danger" title="Unable to open payment service">
          {openPayment.error.message}
        </Alert>
      ) : null}
      <Card className="my-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-ink-muted">Current institution plan</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {subscription?.plan.name ?? 'No subscription assigned'}
            </h2>
            {subscription ? (
              <>
                <Badge className="mt-2">
                  {subscription.status.toLowerCase().replaceAll('_', ' ')}
                </Badge>
                <p className="mt-2 text-xs text-ink-muted">
                  {subscription.trialEndsAt && subscription.status === 'TRIALING'
                    ? `Trial ends ${subscription.trialEndsAt.slice(0, 10)}`
                    : `${subscription.cancelAtPeriodEnd ? 'Access scheduled to end' : 'Current period ends'} ${subscription.currentPeriodEnd.slice(0, 10)}`}
                </p>
              </>
            ) : null}
          </div>
          {can('billing:manage') && data.billing.portalAvailable ? (
            <Button
              disabled={openPayment.isPending}
              onClick={() => openPayment.mutate({ action: 'portal' })}
            >
              Manage subscription and payments
            </Button>
          ) : null}
        </div>
        {subscription?.status === 'PAST_DUE' ? (
          <Alert className="mt-4" tone="warning" title="Payment needs attention">
            Update your payment method in the billing portal. Existing academic and training records
            are retained.
          </Alert>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Object.entries(data.usage).map(([key, usage]) => (
            <div key={key} className="rounded-md border border-border p-3">
              <p className="text-xs text-ink-muted">{usageLabels[key] ?? key}</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {usage.used} / {usage.limit ?? 'Unlimited'}
              </p>
              {usage.limit !== null && usage.used > usage.limit ? (
                <p className="mt-1 text-xs text-status-expired">Above current plan allowance</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
      <h2 className="mb-3 font-semibold text-ink">Plans for your institution</h2>
      {plans.error ? (
        <Alert tone="danger">{plans.error.message}</Alert>
      ) : plans.isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.data?.map((plan) => (
            <Card key={plan.key} className="flex flex-col p-5">
              <h3 className="font-semibold text-ink">{plan.name}</h3>
              <p className="mt-3 text-xl font-semibold text-ink">
                {plan.priceCents > 0
                  ? money(plan.priceCents, plan.currency)
                  : plan.interval === 'year'
                    ? 'Contact Olbos'
                    : 'Free'}
                {plan.priceCents > 0 ? (
                  <span className="text-xs font-normal text-ink-muted"> / {plan.interval}</span>
                ) : null}
              </p>
              <ul className="my-4 space-y-2 text-xs text-ink-muted">
                {plan.entitlements
                  .filter((grant) =>
                    ['MAX_USERS', 'MAX_COURSES', 'MAX_STORAGE_GB'].includes(grant.key),
                  )
                  .map((grant) => (
                    <li key={grant.key}>
                      {grant.valueType === 'UNLIMITED' ? 'Unlimited' : grant.numValue}{' '}
                      {grant.key === 'MAX_USERS'
                        ? 'user accounts'
                        : grant.key === 'MAX_COURSES'
                          ? 'LMS courses'
                          : 'GB storage'}
                    </li>
                  ))}
              </ul>
              {can('billing:manage') &&
              plan.selfServiceAvailable &&
              !data.billing.managedSubscription ? (
                <Button
                  className="mt-auto"
                  disabled={openPayment.isPending}
                  onClick={() => setSelected(plan)}
                >
                  Choose monthly plan
                </Button>
              ) : (
                <p className="mt-auto text-xs text-ink-subtle">
                  {data.billing.managedSubscription && plan.priceCents > 0
                    ? 'Contact Olbos for plan changes.'
                    : plan.priceCents === 0 && plan.interval === 'year'
                      ? 'Institution contract available on request.'
                      : !data.billing.onlineEnabled
                        ? 'Managed by Olbos.'
                        : 'Contact Olbos to arrange this plan.'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
      {selected ? (
        <Card className="mt-5 p-5" role="region" aria-label="Review monthly subscription">
          <h3 className="font-semibold text-ink">Review {selected.name}</h3>
          <p className="my-3 text-sm text-ink-muted">
            {money(selected.priceCents, selected.currency)} per month for this institution, plus any
            taxes shown at checkout. This subscription renews monthly until canceled. Review the
            final terms and total on Stripe before paying.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={openPayment.isPending}
              onClick={() => openPayment.mutate({ action: 'checkout', planKey: selected.key })}
            >
              {openPayment.isPending ? 'Opening checkout…' : 'Continue to secure checkout'}
            </Button>
            <Button
              variant="secondary"
              disabled={openPayment.isPending}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
      <Card className="mt-5 p-5">
        <h2 className="mb-4 font-semibold text-ink">Subscription invoices</h2>
        {invoices.error ? (
          <Alert tone="danger">{invoices.error.message}</Alert>
        ) : invoices.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : invoices.data?.length ? (
          <ul className="divide-y divide-border">
            {invoices.data.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{invoice.number}</p>
                  <p className="text-xs text-ink-muted">
                    {invoice.periodStart.slice(0, 10)} · {invoice.status.toLowerCase()}
                  </p>
                </div>
                <span className="text-ink">{money(invoice.totalCents, invoice.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No subscription invoices yet.</p>
        )}
        <p className="mt-4 text-xs text-ink-subtle">
          Payment updates appear after Stripe confirms them. Returning from checkout does not itself
          activate a plan.
        </p>
      </Card>
    </>
  );
}
