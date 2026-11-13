import type { FastifyPluginAsync } from 'fastify';
import { PLAN_CATALOGUE } from '@olbos/billing';
import { ok } from '../../lib/http.js';

/**
 * Billing (§34).
 *
 * Read-only here: plan changes and payment collection belong to the billing
 * provider integration, which is a separate deployment concern. What this
 * exposes is the tenant's current position and, crucially, *why* a feature is
 * or is not available — an entitlement with its source, so support can answer
 * "why can't I see the training matrix?" without reading the database.
 */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/billing/plans', async (request) => {
    request.requireAuth();
    return ok(
      PLAN_CATALOGUE.filter((plan) => plan.isPublic).map((plan) => ({
        key: plan.key,
        name: plan.name,
        tier: plan.tier,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        entitlements: plan.entitlements.map((grant) => ({
          key: grant.key,
          valueType: grant.valueType,
          boolValue: grant.boolValue ?? null,
          numValue: grant.numValue ?? null,
        })),
      })),
    );
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
      db.employee.count({ where: { deletedAt: null } }),
      db.course.count({ where: { deletedAt: null } }),
      db.storedFile.aggregate({ where: { deletedAt: null }, _sum: { byteSize: true } }),
    ]);

    const usedGb = Number(storageBytes._sum.byteSize ?? 0) / 1_073_741_824;

    return ok({
      subscription,
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
