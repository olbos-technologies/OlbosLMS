/**
 * Entitlements (§34).
 *
 * Feature access is data, never a branch on a plan name. Code asks
 * `entitlements.allows('SAFETY_MODULE')` or `entitlements.limit('MAX_USERS')`;
 * a sales exception is then a row in `entitlement_overrides`, not a deploy.
 */

export const ENTITLEMENT_KEYS = [
  'AI_TUTOR',
  'AI_COURSE_BUILDER',
  'AI_QUESTION_GENERATOR',
  'AI_SCENARIO_GENERATOR',
  'AI_ANALYTICS_ASSISTANT',
  'SAFETY_MODULE',
  'TRAINING_MATRIX',
  'CERTIFICATES',
  'PRACTICAL_ASSESSMENTS',
  'INCIDENT_MANAGEMENT',
  'ADVANCED_ANALYTICS',
  'SSO',
  'SAML',
  'SCIM',
  'LTI',
  'SCORM',
  'XAPI',
  'CUSTOM_BRANDING',
  'API_ACCESS',
  'WEBHOOKS',
  'PRIORITY_SUPPORT',
  'MAX_USERS',
  'MAX_COURSES',
  'MAX_STORAGE_GB',
  'MAX_AI_REQUESTS_PER_MONTH',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type EntitlementValueType = 'BOOLEAN' | 'NUMERIC' | 'UNLIMITED';

export interface EntitlementGrant {
  readonly key: EntitlementKey;
  readonly valueType: EntitlementValueType;
  readonly boolValue?: boolean | null;
  readonly numValue?: number | null;
  /** Overrides only: the grant stops applying after this instant. */
  readonly expiresAt?: Date | null;
}

export type PlanTier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface PlanDefinition {
  readonly key: string;
  readonly name: string;
  readonly tier: PlanTier;
  readonly description: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly interval: 'month' | 'year';
  readonly isPublic: boolean;
  readonly sortOrder: number;
  readonly entitlements: readonly EntitlementGrant[];
}

const flag = (key: EntitlementKey, value = true): EntitlementGrant => ({
  key,
  valueType: 'BOOLEAN',
  boolValue: value,
});

const limit = (key: EntitlementKey, value: number): EntitlementGrant => ({
  key,
  valueType: 'NUMERIC',
  numValue: value,
});

const unlimited = (key: EntitlementKey): EntitlementGrant => ({ key, valueType: 'UNLIMITED' });

/**
 * The seeded plan catalogue. Deployments may edit these rows freely; nothing in
 * the codebase depends on a particular plan existing.
 */
export const PLAN_CATALOGUE: readonly PlanDefinition[] = [
  {
    key: 'free',
    name: 'Free',
    tier: 'FREE',
    description: 'Evaluate OLBOS with a small group. Core LMS only.',
    priceCents: 0,
    currency: 'USD',
    interval: 'month',
    isPublic: true,
    sortOrder: 0,
    entitlements: [limit('MAX_USERS', 10), limit('MAX_COURSES', 5), limit('MAX_STORAGE_GB', 1)],
  },
  {
    key: 'starter',
    name: 'Starter',
    tier: 'STARTER',
    description: 'Training management, certificates and basic reporting for a small team.',
    priceCents: 9900,
    currency: 'USD',
    interval: 'month',
    isPublic: true,
    sortOrder: 1,
    entitlements: [
      flag('CERTIFICATES'),
      limit('MAX_USERS', 50),
      limit('MAX_COURSES', 50),
      limit('MAX_STORAGE_GB', 20),
    ],
  },
  {
    key: 'professional',
    name: 'Professional',
    tier: 'PROFESSIONAL',
    description:
      'The full safety and compliance suite: training matrix, practical assessments, ' +
      'incidents, advanced analytics and AI assistance.',
    priceCents: 39900,
    currency: 'USD',
    interval: 'month',
    isPublic: true,
    sortOrder: 2,
    entitlements: [
      flag('CERTIFICATES'),
      flag('SAFETY_MODULE'),
      flag('TRAINING_MATRIX'),
      flag('PRACTICAL_ASSESSMENTS'),
      flag('INCIDENT_MANAGEMENT'),
      flag('ADVANCED_ANALYTICS'),
      flag('API_ACCESS'),
      flag('WEBHOOKS'),
      flag('AI_TUTOR'),
      flag('AI_COURSE_BUILDER'),
      flag('AI_QUESTION_GENERATOR'),
      flag('AI_SCENARIO_GENERATOR'),
      limit('MAX_USERS', 500),
      limit('MAX_COURSES', 500),
      limit('MAX_STORAGE_GB', 250),
      limit('MAX_AI_REQUESTS_PER_MONTH', 5000),
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    description:
      'Everything in Professional plus SSO/SAML, SCORM and LTI, custom branding and ' +
      'contracted limits.',
    priceCents: 0,
    currency: 'USD',
    interval: 'year',
    isPublic: true,
    sortOrder: 3,
    entitlements: [
      flag('CERTIFICATES'),
      flag('SAFETY_MODULE'),
      flag('TRAINING_MATRIX'),
      flag('PRACTICAL_ASSESSMENTS'),
      flag('INCIDENT_MANAGEMENT'),
      flag('ADVANCED_ANALYTICS'),
      flag('API_ACCESS'),
      flag('WEBHOOKS'),
      flag('PRIORITY_SUPPORT'),
      flag('AI_TUTOR'),
      flag('AI_COURSE_BUILDER'),
      flag('AI_QUESTION_GENERATOR'),
      flag('AI_SCENARIO_GENERATOR'),
      flag('AI_ANALYTICS_ASSISTANT'),
      flag('SSO'),
      flag('SAML'),
      flag('SCIM'),
      flag('LTI'),
      flag('SCORM'),
      flag('XAPI'),
      flag('CUSTOM_BRANDING'),
      unlimited('MAX_USERS'),
      unlimited('MAX_COURSES'),
      limit('MAX_STORAGE_GB', 2000),
      limit('MAX_AI_REQUESTS_PER_MONTH', 100_000),
    ],
  },
];

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

/**
 * Statuses that still grant plan features. PAST_DUE keeps access deliberately:
 * cutting off safety-training records over a failed card would be the wrong
 * trade for this product. Dunning belongs in the billing workflow, not here.
 */
const ACTIVE_STATUSES = new Set<SubscriptionStatus>(['TRIALING', 'ACTIVE', 'PAST_DUE']);

export interface ResolveEntitlementsInput {
  readonly planEntitlements?: readonly EntitlementGrant[];
  readonly overrides?: readonly EntitlementGrant[];
  readonly subscriptionStatus?: SubscriptionStatus;
  readonly now?: Date;
}

export interface ResolvedEntitlement {
  readonly key: EntitlementKey;
  readonly valueType: EntitlementValueType;
  readonly enabled: boolean;
  /** Null means unlimited (for a NUMERIC-style key) or not applicable. */
  readonly limit: number | null;
  readonly source: 'plan' | 'override' | 'default';
}

export interface EntitlementSet {
  readonly all: readonly ResolvedEntitlement[];
  /** Whether a boolean feature is on. */
  allows(key: EntitlementKey): boolean;
  /** Numeric ceiling; null means unlimited, 0 means "not included". */
  limitFor(key: EntitlementKey): number | null;
  /** True when using one more of the metered resource stays within the plan. */
  withinLimit(key: EntitlementKey, currentUsage: number, requested?: number): boolean;
  /** Keys that are enabled, for the navigation builder and `/me`. */
  enabledKeys(): EntitlementKey[];
  explain(key: EntitlementKey): ResolvedEntitlement;
}

const DISABLED = (key: EntitlementKey): ResolvedEntitlement => ({
  key,
  valueType: 'BOOLEAN',
  enabled: false,
  limit: 0,
  source: 'default',
});

const resolveGrant = (
  key: EntitlementKey,
  grant: EntitlementGrant,
  source: 'plan' | 'override',
): ResolvedEntitlement => {
  switch (grant.valueType) {
    case 'UNLIMITED':
      return { key, valueType: 'UNLIMITED', enabled: true, limit: null, source };
    case 'NUMERIC':
      return {
        key,
        valueType: 'NUMERIC',
        // A numeric entitlement of 0 is "not included".
        enabled: (grant.numValue ?? 0) > 0,
        limit: grant.numValue ?? 0,
        source,
      };
    default:
      return {
        key,
        valueType: 'BOOLEAN',
        enabled: grant.boolValue === true,
        limit: grant.boolValue === true ? null : 0,
        source,
      };
  }
};

/**
 * Combines plan grants with tenant overrides. An override always wins, whether
 * it widens or narrows the plan, so a contract can both add SSO to a
 * Professional plan and cap a seat count below the plan default.
 */
export const resolveEntitlements = (input: ResolveEntitlementsInput): EntitlementSet => {
  const now = input.now ?? new Date();
  const active = ACTIVE_STATUSES.has(input.subscriptionStatus ?? 'ACTIVE');

  const resolved = new Map<EntitlementKey, ResolvedEntitlement>();

  if (active) {
    for (const grant of input.planEntitlements ?? []) {
      resolved.set(grant.key, resolveGrant(grant.key, grant, 'plan'));
    }
  }

  for (const override of input.overrides ?? []) {
    if (override.expiresAt && override.expiresAt <= now) continue;
    resolved.set(override.key, resolveGrant(override.key, override, 'override'));
  }

  const all = ENTITLEMENT_KEYS.map((key) => resolved.get(key) ?? DISABLED(key));

  const explain = (key: EntitlementKey): ResolvedEntitlement => resolved.get(key) ?? DISABLED(key);

  return {
    all,
    explain,
    allows: (key) => explain(key).enabled,
    limitFor: (key) => explain(key).limit,
    withinLimit: (key, currentUsage, requested = 1) => {
      const entitlement = explain(key);
      if (!entitlement.enabled) return false;
      if (entitlement.limit === null) return true;
      return currentUsage + requested <= entitlement.limit;
    },
    enabledKeys: () => all.filter((e) => e.enabled).map((e) => e.key),
  };
};

export class EntitlementRequiredError extends Error {
  readonly statusCode = 402;
  readonly code = 'ENTITLEMENT_REQUIRED';

  constructor(readonly entitlement: EntitlementKey) {
    super(`This feature requires the ${entitlement} entitlement on your plan.`);
    this.name = 'EntitlementRequiredError';
  }
}

export class UsageLimitExceededError extends Error {
  readonly statusCode = 402;
  readonly code = 'USAGE_LIMIT_EXCEEDED';

  constructor(
    readonly entitlement: EntitlementKey,
    readonly currentUsage: number,
    readonly allowed: number,
  ) {
    super(`Your plan allows ${allowed} for ${entitlement}; you are currently at ${currentUsage}.`);
    this.name = 'UsageLimitExceededError';
  }
}

export const assertEntitled = (entitlements: EntitlementSet, key: EntitlementKey): void => {
  if (!entitlements.allows(key)) throw new EntitlementRequiredError(key);
};

export const assertWithinLimit = (
  entitlements: EntitlementSet,
  key: EntitlementKey,
  currentUsage: number,
  requested = 1,
): void => {
  const entitlement = entitlements.explain(key);
  if (!entitlement.enabled) throw new EntitlementRequiredError(key);
  if (entitlement.limit !== null && currentUsage + requested > entitlement.limit) {
    throw new UsageLimitExceededError(key, currentUsage, entitlement.limit);
  }
};
