# Billing and entitlements

## The rule

No code branches on a plan name. §34 says it directly, and it is right: the day a
customer negotiates SSO on a Professional plan, `if (plan === 'PRO')` becomes a
deploy instead of a row.

```ts
if (entitlements.allows('SAFETY_MODULE')) { ... }
assertWithinLimit(entitlements, 'MAX_USERS', currentCount);
```

## Resolution

```
Plan entitlements  →  tenant overrides  →  effective set
```

An override always wins, whether it widens or narrows. That single rule covers
adding SSO to a Professional plan, capping seats below the plan default for a
pilot, and time-boxing a trial of the safety module — an override may carry
`expiresAt`, after which the plan default returns.

Subscription status gates the plan's grants but not overrides:

| Status                           | Plan features | Overrides |
| -------------------------------- | ------------- | --------- |
| `TRIALING`, `ACTIVE`, `PAST_DUE` | Yes           | Yes       |
| `CANCELLED`, `EXPIRED`           | No            | Yes       |

`PAST_DUE` keeps access deliberately. Cutting off access to safety training
records over a failed card is the wrong trade for this product; dunning belongs
in the billing workflow, not in the authorization path.

## Value types

| Type        | Meaning                             |
| ----------- | ----------------------------------- |
| `BOOLEAN`   | On or off                           |
| `NUMERIC`   | A ceiling; `0` means "not included" |
| `UNLIMITED` | No ceiling                          |

## Plans

| Key            | Includes                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `free`         | 10 users, 5 courses, core LMS                                                                            |
| `starter`      | 50 users, certificates                                                                                   |
| `professional` | Safety module, training matrix, practical assessments, incidents, advanced analytics, AI, API, 500 users |
| `enterprise`   | Everything plus SSO/SAML/SCIM, LTI, SCORM, xAPI, custom branding, unlimited users                        |

Edit them freely — nothing in the codebase depends on a particular plan existing.

## Failing well

An entitlement failure is **402**, not 403, because "your plan does not include
this" and "you are not allowed to do this" are different problems with different
fixes. The UI shows a plan message rather than a permission error.

`GET /billing/subscription` returns every entitlement with its **source** — plan,
override, or not granted — which is how support answers "why can't I see the
training matrix?" without opening the database.

## Metering

The worker records per-tenant counters every six hours: users, courses, storage
bytes, AI requests. `assertWithinLimit` reads live counts at the point of use, so
a limit is enforced when it is crossed rather than at the next meter run.

## Not implemented

Payment collection, invoice generation, plan self-service upgrade and downgrade,
proration, dunning. `BILLING_DRIVER` and the Stripe configuration exist as an
extension point; the provider integration does not. Invoices are readable but
nothing writes them.
