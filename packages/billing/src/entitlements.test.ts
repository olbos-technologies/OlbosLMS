import { describe, expect, it } from 'vitest';
import {
  assertEntitled,
  assertWithinLimit,
  ENTITLEMENT_KEYS,
  EntitlementRequiredError,
  PLAN_CATALOGUE,
  resolveEntitlements,
  UsageLimitExceededError,
  type PlanDefinition,
} from './entitlements.js';

const plan = (key: string): PlanDefinition =>
  PLAN_CATALOGUE.find((p) => p.key === key) as PlanDefinition;

const forPlan = (
  key: string,
  overrides: Parameters<typeof resolveEntitlements>[0]['overrides'] = [],
) => resolveEntitlements({ planEntitlements: plan(key).entitlements, overrides });

describe('plan catalogue', () => {
  it('offers the four tiers named in the specification', () => {
    expect(PLAN_CATALOGUE.map((p) => p.tier)).toEqual([
      'FREE',
      'STARTER',
      'PROFESSIONAL',
      'ENTERPRISE',
    ]);
  });

  it('references only known entitlement keys', () => {
    const known = new Set<string>(ENTITLEMENT_KEYS);
    for (const definition of PLAN_CATALOGUE) {
      for (const grant of definition.entitlements) {
        expect(`${definition.key}:${grant.key}:${known.has(grant.key)}`).toBe(
          `${definition.key}:${grant.key}:true`,
        );
      }
    }
  });

  it('never grants the same key twice within a plan', () => {
    for (const definition of PLAN_CATALOGUE) {
      const keys = definition.entitlements.map((g) => g.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('resolveEntitlements', () => {
  it('denies everything not granted', () => {
    const free = forPlan('free');
    expect(free.allows('SAFETY_MODULE')).toBe(false);
    expect(free.allows('AI_TUTOR')).toBe(false);
    expect(free.allows('SSO')).toBe(false);
    expect(free.allows('CERTIFICATES')).toBe(false);
  });

  it('grants what the plan includes', () => {
    const professional = forPlan('professional');
    expect(professional.allows('SAFETY_MODULE')).toBe(true);
    expect(professional.allows('TRAINING_MATRIX')).toBe(true);
    expect(professional.allows('AI_TUTOR')).toBe(true);
    expect(professional.allows('SSO')).toBe(false);
  });

  it('treats an unlimited grant as no ceiling', () => {
    const enterprise = forPlan('enterprise');
    expect(enterprise.allows('MAX_USERS')).toBe(true);
    expect(enterprise.limitFor('MAX_USERS')).toBeNull();
    expect(enterprise.withinLimit('MAX_USERS', 1_000_000)).toBe(true);
  });

  it('enforces numeric ceilings', () => {
    const starter = forPlan('starter');
    expect(starter.limitFor('MAX_USERS')).toBe(50);
    expect(starter.withinLimit('MAX_USERS', 49)).toBe(true);
    expect(starter.withinLimit('MAX_USERS', 50)).toBe(false);
    expect(starter.withinLimit('MAX_USERS', 45, 10)).toBe(false);
  });

  it('lists the enabled keys for the navigation builder', () => {
    const keys = forPlan('professional').enabledKeys();
    expect(keys).toContain('SAFETY_MODULE');
    expect(keys).toContain('CERTIFICATES');
    expect(keys).not.toContain('SAML');
  });
});

describe('tenant overrides', () => {
  it('adds a feature the plan does not include', () => {
    const set = forPlan('professional', [{ key: 'SSO', valueType: 'BOOLEAN', boolValue: true }]);
    expect(set.allows('SSO')).toBe(true);
    expect(set.explain('SSO').source).toBe('override');
  });

  it('removes a feature the plan includes', () => {
    const set = forPlan('professional', [
      { key: 'AI_TUTOR', valueType: 'BOOLEAN', boolValue: false },
    ]);
    expect(set.allows('AI_TUTOR')).toBe(false);
  });

  it('raises and lowers a numeric ceiling', () => {
    expect(
      forPlan('starter', [{ key: 'MAX_USERS', valueType: 'NUMERIC', numValue: 250 }]).limitFor(
        'MAX_USERS',
      ),
    ).toBe(250);
    expect(
      forPlan('professional', [{ key: 'MAX_USERS', valueType: 'NUMERIC', numValue: 25 }]).limitFor(
        'MAX_USERS',
      ),
    ).toBe(25);
  });

  it('ignores an expired override and falls back to the plan', () => {
    const set = resolveEntitlements({
      planEntitlements: plan('starter').entitlements,
      overrides: [
        {
          key: 'SAFETY_MODULE',
          valueType: 'BOOLEAN',
          boolValue: true,
          expiresAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(set.allows('SAFETY_MODULE')).toBe(false);
  });

  it('honours an override that has not yet expired', () => {
    const set = resolveEntitlements({
      planEntitlements: plan('starter').entitlements,
      overrides: [
        {
          key: 'SAFETY_MODULE',
          valueType: 'BOOLEAN',
          boolValue: true,
          expiresAt: new Date('2026-12-01T00:00:00Z'),
        },
      ],
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(set.allows('SAFETY_MODULE')).toBe(true);
  });
});

describe('subscription status', () => {
  it('keeps access while trialing and while past due', () => {
    for (const status of ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const) {
      const set = resolveEntitlements({
        planEntitlements: plan('professional').entitlements,
        subscriptionStatus: status,
      });
      expect(`${status}:${set.allows('SAFETY_MODULE')}`).toBe(`${status}:true`);
    }
  });

  it('withdraws plan features once cancelled or expired', () => {
    for (const status of ['CANCELLED', 'EXPIRED'] as const) {
      const set = resolveEntitlements({
        planEntitlements: plan('professional').entitlements,
        subscriptionStatus: status,
      });
      expect(`${status}:${set.allows('SAFETY_MODULE')}`).toBe(`${status}:false`);
    }
  });

  it('still honours an explicit override after cancellation', () => {
    const set = resolveEntitlements({
      planEntitlements: plan('professional').entitlements,
      overrides: [{ key: 'CERTIFICATES', valueType: 'BOOLEAN', boolValue: true }],
      subscriptionStatus: 'CANCELLED',
    });
    expect(set.allows('CERTIFICATES')).toBe(true);
    expect(set.allows('SAFETY_MODULE')).toBe(false);
  });
});

describe('assertions', () => {
  it('throws a 402 for a missing entitlement', () => {
    expect(() => assertEntitled(forPlan('free'), 'SAFETY_MODULE')).toThrow(
      EntitlementRequiredError,
    );
    try {
      assertEntitled(forPlan('free'), 'SAFETY_MODULE');
    } catch (error) {
      expect((error as EntitlementRequiredError).statusCode).toBe(402);
    }
  });

  it('passes when the entitlement is present', () => {
    expect(() => assertEntitled(forPlan('professional'), 'SAFETY_MODULE')).not.toThrow();
  });

  it('throws when a usage limit would be exceeded', () => {
    expect(() => assertWithinLimit(forPlan('starter'), 'MAX_USERS', 50)).toThrow(
      UsageLimitExceededError,
    );
    expect(() => assertWithinLimit(forPlan('starter'), 'MAX_USERS', 10)).not.toThrow();
  });

  it('reports the current usage and the ceiling in the error', () => {
    try {
      assertWithinLimit(forPlan('starter'), 'MAX_USERS', 60);
    } catch (error) {
      const typed = error as UsageLimitExceededError;
      expect(typed.currentUsage).toBe(60);
      expect(typed.allowed).toBe(50);
      expect(typed.message).toMatch(/allows 50 .* you are currently at 60/);
    }
  });

  it('never blocks an unlimited entitlement', () => {
    expect(() => assertWithinLimit(forPlan('enterprise'), 'MAX_USERS', 999_999)).not.toThrow();
  });
});
