import { z } from 'zod';
import { getEnv } from '@olbos/config';
import { forTenant, getPrismaClient, type TenantClient } from '@olbos/database';
import { StripeBillingClient, hostedBillingUrl, stripeSubscriptionStatus } from '@olbos/billing';
import { ApiError } from '../errors.js';

const id = z.string().regex(/^[A-Za-z0-9_]+$/);
const customerSchema = z.object({ id });
const sessionSchema = z.object({ url: z.string() });
const subscriptionSchema = z.object({
  id,
  customer: id,
  status: z.string(),
  current_period_start: z.number().int(),
  current_period_end: z.number().int(),
  trial_end: z.number().int().nullable(),
  cancel_at_period_end: z.boolean(),
  canceled_at: z.number().int().nullable(),
  items: z.object({
    data: z
      .array(z.object({ quantity: z.number().int().positive(), price: z.object({ id }) }))
      .length(1),
  }),
});
const invoiceSchema = z.object({
  id,
  customer: id,
  subscription: id.nullable(),
  number: z.string().nullable(),
  status: z.string().nullable(),
  subtotal: z.number().int(),
  total: z.number().int(),
  tax: z.number().int().nullable(),
  currency: z.string(),
  period_start: z.number().int(),
  period_end: z.number().int(),
  due_date: z.number().int().nullable(),
  status_transitions: z.object({ paid_at: z.number().int().nullable() }),
});
export const stripeEventSchema = z.object({
  id,
  type: z.string(),
  livemode: z.boolean(),
  data: z.object({
    object: z
      .object({ id, customer: id.nullable().optional(), subscription: id.nullable().optional() })
      .passthrough(),
  }),
});
export type StripeEvent = z.infer<typeof stripeEventSchema>;
const date = (seconds: number) => new Date(seconds * 1000);

export const billingProvider = (): StripeBillingClient => {
  const env = getEnv();
  if (env.BILLING_DRIVER !== 'stripe' || !env.STRIPE_SECRET_KEY || !env.BILLING_RETURN_URL)
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      'Online billing is not configured. Contact Olbos to arrange your institution’s subscription.',
    );
  return new StripeBillingClient(env.STRIPE_SECRET_KEY);
};

export const beginInstitutionCheckout = async (
  db: TenantClient,
  organizationId: string,
  planKey: string,
  actorEmail: string,
) => {
  const provider = billingProvider();
  const plan = await db.plan.findFirst({ where: { key: planKey, isPublic: true } });
  if (!plan || !plan.externalPriceId || plan.priceCents <= 0 || plan.interval !== 'month')
    throw ApiError.unprocessable('This plan is not available for monthly online checkout.');
  const current = await db.subscription.findUnique({ where: { organizationId } });
  if (!current)
    throw ApiError.conflict('Your institution needs an initial subscription before checkout.');
  if (current.externalSubId && !['CANCELLED', 'EXPIRED'].includes(current.status))
    throw ApiError.conflict('Manage your existing subscription in the billing portal.');

  const price = z
    .object({
      active: z.literal(true),
      unit_amount: z.number().int(),
      currency: z.string(),
      recurring: z.object({
        interval: z.literal('month'),
        interval_count: z.literal(1),
        usage_type: z.literal('licensed'),
      }),
    })
    .parse(await provider.request(`/prices/${plan.externalPriceId}`));
  if (
    price.unit_amount !== plan.priceCents ||
    price.currency.toUpperCase() !== plan.currency.toUpperCase()
  )
    throw ApiError.conflict(
      'The configured payment price does not match this plan. Contact Olbos support.',
    );

  // Expired reservations may be replaced; concurrent requests share one UUID.
  await db.billingCheckout.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const reservation = await db.billingCheckout.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, planId: plan.id, expiresAt: new Date(Date.now() + 2 * 60 * 60000) },
  });
  if (reservation.planId !== plan.id)
    throw ApiError.conflict(
      'A checkout for another plan is already open. Complete it or wait for it to expire.',
    );

  let customerId = current.externalCustomerId;
  if (!customerId) {
    const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    customerId = customerSchema.parse(
      await provider.request(
        '/customers',
        {
          name: organization.legalName ?? organization.name,
          email: organization.billingEmail ?? actorEmail,
          'metadata[organizationId]': organizationId,
        },
        `institution-customer-${organizationId}`,
      ),
    ).id;
    await db.subscription.update({
      where: { organizationId },
      data: { externalCustomerId: customerId },
    });
  }
  const returnUrl = getEnv().BILLING_RETURN_URL!;
  const session = sessionSchema.parse(
    await provider.request(
      '/checkout/sessions',
      {
        'payment_method_types[0]': 'card',
        mode: 'subscription',
        customer: customerId,
        client_reference_id: organizationId,
        'line_items[0][price]': plan.externalPriceId,
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][organizationId]': organizationId,
        success_url: returnUrl,
        cancel_url: returnUrl,
        expires_at: String(Math.floor(reservation.expiresAt.getTime() / 1000)),
      },
      `institution-checkout-${reservation.id}`,
    ),
  );
  return { url: hostedBillingUrl(session.url, 'checkout') };
};

export const institutionBillingPortal = async (db: TenantClient, organizationId: string) => {
  const provider = billingProvider();
  const subscription = await db.subscription.findUnique({ where: { organizationId } });
  if (!subscription?.externalCustomerId)
    throw ApiError.conflict('Subscribe before opening the billing portal.');
  const result = sessionSchema.parse(
    await provider.request('/billing_portal/sessions', {
      customer: subscription.externalCustomerId,
      return_url: getEnv().BILLING_RETURN_URL!,
    }),
  );
  return { url: hostedBillingUrl(result.url, 'portal') };
};

/**
 * Only a signed provider event may enter this boundary. The customer lookup is
 * platform-level because no browser session exists; tenant context comes from
 * the stored customer association, never event metadata. All subsequent work
 * uses the scoped client before entering a transaction.
 */
export const reconcileStripeEvent = async (event: StripeEvent): Promise<void> => {
  const supported = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.finalized',
    'invoice.voided',
  ];
  if (!supported.includes(event.type)) return;
  const provider = billingProvider();
  if (event.livemode !== /^(sk|rk)_live_/.test(getEnv().STRIPE_SECRET_KEY!))
    throw ApiError.badRequest('Payment environment does not match.');
  const object = event.data.object;
  if (!object.customer) return;
  const prisma = getPrismaClient();
  const association = await prisma.subscription.findUnique({
    where: { externalCustomerId: object.customer },
    select: { organizationId: true },
  });
  if (!association) return;
  const organizationId = association.organizationId;
  const db = forTenant(organizationId, prisma);
  await db.$transaction(
    async (tx) => {
      // Serializing before retrieving canonical state prevents stale deliveries
      // and concurrent invoices from moving a subscription back in time.
      await tx.$queryRaw`SELECT id FROM subscriptions WHERE "organizationId" = ${organizationId}::uuid FOR UPDATE`;
      if (await tx.billingWebhookEvent.findFirst({ where: { id: event.id } })) return;
      const current = await tx.subscription.findUniqueOrThrow({ where: { organizationId } });
      let invoice: z.infer<typeof invoiceSchema> | undefined;
      if (event.type.startsWith('invoice.'))
        invoice = invoiceSchema.parse(await provider.request(`/invoices/${object.id}`));
      const subId = event.type.startsWith('customer.subscription.')
        ? object.id
        : (invoice?.subscription ?? object.subscription);
      if (!subId) return;
      const remote = subscriptionSchema.parse(await provider.request(`/subscriptions/${subId}`));
      if (
        remote.customer !== current.externalCustomerId ||
        (invoice && invoice.customer !== current.externalCustomerId)
      )
        throw ApiError.badRequest('Payment association does not match.');
      if (
        current.externalSubId &&
        current.externalSubId !== remote.id &&
        !['CANCELLED', 'EXPIRED'].includes(current.status)
      )
        return;
      const item = remote.items.data[0]!;
      const plan = await tx.plan.findUnique({ where: { externalPriceId: item.price.id } });
      if (!plan || item.quantity !== 1)
        throw new ApiError('SERVICE_UNAVAILABLE', 'Subscription price mapping needs attention.');
      const status = stripeSubscriptionStatus(remote.status);
      await tx.subscription.update({
        where: { organizationId },
        data: {
          planId: plan.id,
          status,
          externalSubId: remote.id,
          currentPeriodStart: date(remote.current_period_start),
          currentPeriodEnd: date(remote.current_period_end),
          trialEndsAt: remote.trial_end ? date(remote.trial_end) : null,
          cancelAtPeriodEnd: remote.cancel_at_period_end,
          cancelledAt: remote.canceled_at ? date(remote.canceled_at) : null,
        },
      });
      if (invoice) {
        const data = {
          organizationId,
          number: invoice.number ?? invoice.id,
          status:
            invoice.status === 'paid'
              ? ('PAID' as const)
              : invoice.status === 'void'
                ? ('VOID' as const)
                : invoice.status === 'uncollectible'
                  ? ('UNCOLLECTIBLE' as const)
                  : invoice.status === 'draft'
                    ? ('DRAFT' as const)
                    : ('OPEN' as const),
          subtotalCents: invoice.subtotal,
          taxCents: invoice.tax ?? 0,
          totalCents: invoice.total,
          currency: invoice.currency.toUpperCase(),
          periodStart: date(invoice.period_start),
          periodEnd: date(invoice.period_end),
          dueAt: invoice.due_date ? date(invoice.due_date) : null,
          paidAt: invoice.status_transitions.paid_at
            ? date(invoice.status_transitions.paid_at)
            : null,
          externalId: invoice.id,
        };
        await tx.invoice.upsert({ where: { externalId: invoice.id }, create: data, update: data });
      }
      await tx.billingWebhookEvent.create({
        data: { id: event.id, organizationId, type: event.type },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          action: 'SUBSCRIPTION_CHANGED',
          actorLabel: 'Stripe billing',
          entityType: 'subscription',
          entityId: current.id,
          summary: `Reconciled subscription (${status})`,
        },
      });
    },
    { timeout: 30000, maxWait: 10000 },
  );
};
