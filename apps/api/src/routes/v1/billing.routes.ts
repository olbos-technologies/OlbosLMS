import type { FastifyPluginAsync } from 'fastify';
import { getEnv } from '@olbos/config';
import { z } from 'zod';
import {
  beginInstitutionCheckout,
  institutionBillingPortal,
} from '../../services/billing.service.js';
import { ok, parseBody } from '../../lib/http.js';

/** Institution subscriptions: provider-hosted checkout, portal, and local billing records. */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/billing/plans', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('billing:read');
    const plans = await db.plan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: 'asc' },
      include: { entitlements: true },
    });
    return ok(
      plans.map((plan) => ({
        key: plan.key,
        name: plan.name,
        tier: plan.tier,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        selfServiceAvailable:
          getEnv().BILLING_DRIVER === 'stripe' &&
          !!plan.externalPriceId &&
          plan.priceCents > 0 &&
          plan.interval === 'month',
        entitlements: plan.entitlements.map((grant) => ({
          key: grant.key,
          valueType: grant.valueType,
          boolValue: grant.boolValue,
          numValue: grant.numValue,
        })),
      })),
    );
  });

  app.post(
    '/billing/checkout',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request) => {
      const { db, organizationId, principal } = request.requireTenant();
      request.authorize('billing:manage');
      const body = parseBody(request, z.object({ planKey: z.string().min(1).max(64) }).strict());
      const session = await beginInstitutionCheckout(
        db,
        organizationId,
        body.planKey,
        principal.email,
      );
      await request.audit({
        action: 'SUBSCRIPTION_CHANGED',
        entityType: 'subscription',
        summary: 'Opened institution subscription checkout',
      });
      return ok(session);
    },
  );

  app.post('/billing/portal', async (request) => {
    const { db, organizationId } = request.requireTenant();
    request.authorize('billing:manage');
    const session = await institutionBillingPortal(db, organizationId);
    await request.audit({
      action: 'SUBSCRIPTION_CHANGED',
      entityType: 'subscription',
      summary: 'Opened institution billing portal',
    });
    return ok(session);
  });

  app.get('/billing/subscription', async (request) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.authorize('billing:read');

    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      select: {
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        cancelAtPeriodEnd: true,
        seatsPurchased: true,
        externalCustomerId: true,
        externalSubId: true,
        plan: {
          select: {
            key: true,
            name: true,
            tier: true,
            priceCents: true,
            currency: true,
            interval: true,
          },
        },
      },
    });

    const [userCount, courseCount, storageBytes] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.course.count({ where: { deletedAt: null } }),
      db.storedFile.aggregate({ where: { deletedAt: null }, _sum: { byteSize: true } }),
    ]);

    const usedGb = Number(storageBytes._sum.byteSize ?? 0) / 1_073_741_824;

    return ok({
      subscription: subscription
        ? {
            ...subscription,
            status:
              subscription.status === 'TRIALING' &&
              subscription.trialEndsAt &&
              subscription.trialEndsAt <= new Date()
                ? 'EXPIRED'
                : subscription.status,
            externalCustomerId: undefined,
            externalSubId: undefined,
          }
        : null,
      billing: {
        onlineEnabled: getEnv().BILLING_DRIVER === 'stripe',
        portalAvailable: getEnv().BILLING_DRIVER === 'stripe' && !!subscription?.externalCustomerId,
        managedSubscription:
          !!subscription?.externalSubId && !['CANCELLED', 'EXPIRED'].includes(subscription.status),
      },
      // Each entitlement carries where it came from — plan, tenant override, or
      // not granted — which is what makes support answerable.
      entitlements: principal.entitlements.all.map((entitlement) => ({
        key: entitlement.key,
        enabled: entitlement.enabled,
        limit: entitlement.limit,
        valueType: entitlement.valueType,
        source: entitlement.source,
      })),
      usage: {
        users: {
          used: userCount,
          limit: principal.entitlements.limitFor('MAX_USERS'),
        },
        courses: {
          used: courseCount,
          limit: principal.entitlements.limitFor('MAX_COURSES'),
        },
        storageGb: {
          used: Math.round(usedGb * 100) / 100,
          limit: principal.entitlements.limitFor('MAX_STORAGE_GB'),
        },
      },
    });
  });

  app.get('/billing/invoices', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('billing:read');

    return ok(
      await db.invoice.findMany({
        orderBy: { periodStart: 'desc' },
        take: 50,
        select: {
          id: true,
          number: true,
          status: true,
          subtotalCents: true,
          taxCents: true,
          totalCents: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
          dueAt: true,
          paidAt: true,
        },
      }),
    );
  });
};
