import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getEnv, __setEnvForTesting, type Env } from '@olbos/config';
import { hashPassword } from '@olbos/auth';
import { buildServer } from '../../apps/api/src/server.js';
import { provisionInstitution } from '../../packages/database/src/provision-institution.js';
import { call, seedTenant, signIn, type Session, type TenantFixtures } from './fixtures.js';
import { db, resetDatabase, disconnect } from './helpers.js';
let app: FastifyInstance;
let alpha: TenantFixtures;
let bravo: TenantFixtures;
let owner: Session;
let learner: Session;
let otherOwner: Session;
let originalEnv: Env;
let remoteStatus = 'active';
let provider: ReturnType<typeof vi.fn<typeof fetch>>;
const secret = 'whsec_integration_fixture';
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const remoteSubscription = () => ({
  id: 'sub_institution',
  customer: 'cus_alpha',
  status: remoteStatus,
  current_period_start: 1800000000,
  current_period_end: 1802592000,
  trial_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  items: { data: [{ quantity: 1, price: { id: 'price_professional' } }] },
});
beforeAll(async () => {
  await resetDatabase();
  originalEnv = getEnv();
  __setEnvForTesting({
    ...originalEnv,
    BILLING_DRIVER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_test_integration',
    STRIPE_WEBHOOK_SECRET: secret,
    BILLING_RETURN_URL: 'http://localhost:3000/admin/billing',
  });
  app = await buildServer();
  await app.ready();
  alpha = await seedTenant({ slug: 'institution-alpha' });
  bravo = await seedTenant({ slug: 'institution-bravo' });
  owner = await signIn(app, alpha.users.ORG_OWNER!.email);
  learner = await signIn(app, alpha.users.LEARNER!.email);
  otherOwner = await signIn(app, bravo.users.ORG_OWNER!.email);
  await db().plan.update({
    where: { key: 'professional' },
    data: { externalPriceId: 'price_professional' },
  });
  provider = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith('/prices/price_professional'))
      return response({
        active: true,
        unit_amount: 39900,
        currency: 'usd',
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      });
    if (path.endsWith('/customers')) return response({ id: 'cus_alpha' });
    if (path.endsWith('/checkout/sessions'))
      return response({ url: 'https://checkout.stripe.com/c/pay/test' });
    if (path.endsWith('/billing_portal/sessions'))
      return response({ url: 'https://billing.stripe.com/p/session/test' });
    if (path.endsWith('/subscriptions/sub_institution')) return response(remoteSubscription());
    if (path.endsWith('/invoices/in_test'))
      return response({
        id: 'in_test',
        customer: 'cus_alpha',
        subscription: 'sub_institution',
        number: 'OLBOS-TEST-001',
        status: 'paid',
        subtotal: 39900,
        total: 39900,
        tax: 0,
        currency: 'usd',
        period_start: 1800000000,
        period_end: 1802592000,
        due_date: null,
        status_transitions: { paid_at: 1800000000 },
      });
    throw new Error('Unexpected provider request');
  });
  vi.stubGlobal('fetch', provider);
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals();
  __setEnvForTesting(originalEnv);
  await app?.close();
  await disconnect();
});
const webhook = async (eventId: string, type: string, object: object) => {
  const body = JSON.stringify({ id: eventId, type, livemode: false, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${signature}` },
    payload: body,
  });
};
describe('institution subscription management', () => {
  it('provisions an isolated college, owner, roles, and trial without reseeding others', async () => {
    const input = {
      name: 'New Institute',
      slug: 'new-institute',
      ownerEmail: 'owner@institute.test',
      ownerFirstName: 'Institute',
      ownerLastName: 'Owner',
      ownerPasswordHash: await hashPassword('secure-institution-password-42'),
      timezone: 'America/Chicago',
      planKey: 'starter',
    };
    const result = await provisionInstitution(db(), input);
    const institution = await db().organization.findUniqueOrThrow({
      where: { id: result.organizationId },
      include: { users: true, subscription: true },
    });
    expect(institution.users).toHaveLength(1);
    expect(institution.type).toBe('COLLEGE');
    expect(institution.subscription?.status).toBe('TRIALING');
    expect(institution.subscription?.trialEndsAt?.getTime()).toBeGreaterThan(
      Date.now() + 13 * 86400000,
    );
    await expect(provisionInstitution(db(), input)).rejects.toThrow();
    expect(await db().organization.count({ where: { slug: 'new-institute' } })).toBe(1);
    expect(await db().organization.count({ where: { id: alpha.organizationId } })).toBe(1);
  });
  it('keeps institution setup scoped and validates administrator updates', async () => {
    const payload = {
      name: 'Alpha College',
      legalName: 'Alpha College Inc.',
      type: 'COLLEGE',
      contactEmail: 'admin@alpha.test',
      billingEmail: 'billing@alpha.test',
      websiteUrl: 'https://alpha.test',
      timezone: 'America/Chicago',
      brandColor: '#123456',
    };
    expect(
      (
        await call(app, {
          method: 'PATCH',
          url: '/api/v1/institutions/profile',
          session: owner,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    const setup = await call(app, { url: '/api/v1/institutions/setup', session: owner });
    expect(setup.json().data.organization.name).toBe('Alpha College');
    expect(
      setup.json().data.checklist.find((step: { key: string }) => step.key === 'profile').complete,
    ).toBe(true);
    expect(
      (await call(app, { url: '/api/v1/institutions/setup', session: otherOwner })).json().data
        .organization.id,
    ).toBe(bravo.organizationId);
    expect(
      (await call(app, { url: '/api/v1/institutions/setup', session: learner })).statusCode,
    ).toBe(403);
    expect(
      (
        await call(app, {
          method: 'PATCH',
          url: '/api/v1/institutions/profile',
          session: owner,
          payload: { ...payload, timezone: 'Invalid/Timezone' },
        })
      ).statusCode,
    ).toBe(422);
  });
  it('authorizes billing and uses database prices', async () => {
    expect((await call(app, { url: '/api/v1/billing/plans', session: learner })).statusCode).toBe(
      403,
    );
    expect(
      (
        await call(app, {
          method: 'POST',
          url: '/api/v1/billing/checkout',
          session: learner,
          payload: { planKey: 'professional' },
        })
      ).statusCode,
    ).toBe(403);
    const plans = await call(app, { url: '/api/v1/billing/plans', session: owner });
    expect(
      plans.json().data.find((plan: { key: string }) => plan.key === 'professional')
        .selfServiceAvailable,
    ).toBe(true);
    expect(
      (
        await call(app, {
          method: 'POST',
          url: '/api/v1/billing/checkout',
          session: owner,
          payload: { planKey: 'enterprise' },
        })
      ).statusCode,
    ).toBe(422);
  });
  it('shares one reservation across concurrent checkout requests', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        call(app, {
          method: 'POST',
          url: '/api/v1/billing/checkout',
          session: owner,
          payload: { planKey: 'professional' },
        }),
      ),
    );
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(
      await db().billingCheckout.count({ where: { organizationId: alpha.organizationId } }),
    ).toBe(1);
    const checkoutCalls = provider.mock.calls.filter(([url]) =>
      String(url).endsWith('/checkout/sessions'),
    );
    expect(checkoutCalls).toHaveLength(2);
    expect(checkoutCalls[0]?.[1]?.headers).toEqual(checkoutCalls[1]?.[1]?.headers);
    expect(checkoutCalls[0]?.[1]?.body).toEqual(checkoutCalls[1]?.[1]?.body);
    // Checkout itself never upgrades or confirms payment.
    expect(
      (
        await db().subscription.findUniqueOrThrow({
          where: { organizationId: alpha.organizationId },
        })
      ).externalSubId,
    ).toBeNull();
  });
  it('reconciles signed events once and fetches canonical state for late deliveries', async () => {
    expect(
      (
        await webhook('evt_active', 'customer.subscription.updated', {
          id: 'sub_institution',
          customer: 'cus_alpha',
          metadata: { organizationId: bravo.organizationId },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await webhook('evt_active', 'customer.subscription.updated', {
          id: 'sub_institution',
          customer: 'cus_alpha',
        })
      ).statusCode,
    ).toBe(200);
    expect(await db().billingWebhookEvent.count({ where: { id: 'evt_active' } })).toBe(1);
    expect(
      (
        await db().subscription.findUniqueOrThrow({
          where: { organizationId: bravo.organizationId },
        })
      ).externalSubId,
    ).toBeNull();
    remoteStatus = 'past_due';
    expect(
      (
        await webhook('evt_delayed', 'customer.subscription.updated', {
          id: 'sub_institution',
          customer: 'cus_alpha',
          status: 'active',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await db().subscription.findUniqueOrThrow({
          where: { organizationId: alpha.organizationId },
        })
      ).status,
    ).toBe('PAST_DUE');
    expect(
      (
        await call(app, {
          method: 'POST',
          url: '/api/v1/billing/checkout',
          session: owner,
          payload: { planKey: 'professional' },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('stores provider invoices under the correct institution and opens its portal', async () => {
    expect(
      (
        await webhook('evt_invoice', 'invoice.paid', {
          id: 'in_test',
          customer: 'cus_alpha',
          subscription: 'sub_institution',
        })
      ).statusCode,
    ).toBe(200);
    const list = await call(app, { url: '/api/v1/billing/invoices', session: owner });
    expect(list.json().data[0].totalCents).toBe(39900);
    expect(
      (await call(app, { url: '/api/v1/billing/invoices', session: otherOwner })).json().data,
    ).toEqual([]);
    expect(
      (await call(app, { method: 'POST', url: '/api/v1/billing/portal', session: owner })).json()
        .data.url,
    ).toContain('billing.stripe.com');
    expect(
      (await call(app, { method: 'POST', url: '/api/v1/billing/portal', session: otherOwner }))
        .statusCode,
    ).toBe(409);
  });
});

it('blocks new academic records after trial expiry while retaining read access', async () => {
  await db().subscription.update({
    where: { organizationId: alpha.organizationId },
    data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() - 1000) },
  });
  const denied = await call(app, {
    method: 'POST',
    url: '/api/v1/campus/programs',
    session: owner,
    payload: { code: 'AFTERTRIAL', name: 'After trial', award: 'BACHELOR', requiredCredits: 120 },
  });
  expect(denied.statusCode).toBe(402);
  expect((await call(app, { url: '/api/v1/campus/programs', session: owner })).statusCode).toBe(
    200,
  );
});
