# Olbos for institutions — SaaS foundation

An institution receives an isolated organization workspace, an owner account,
role templates, a 14-day evaluation subscription, a guided setup page, and a
subscription dashboard. Institutions share the application deployment; tenant
identity always comes from the authenticated session.

## What is implemented

- Operator-assisted institution provisioning without reseeding other customers.
- `/admin/institution`: profile, legal name, contact and billing email, website,
  timezone, stored brand color, and a checklist derived from saved academic data.
- `/admin/billing`: database-backed plans, subscription status, renewal/trial end,
  usage, local invoice history, monthly checkout review, and a hosted billing portal.
- Monthly Stripe Checkout for configured, public, paid monthly plans. Each plan
  uses an operator-configured `plans.externalPriceId`. A server-side price check
  rejects a mismatch in price, currency, interval, or billing model.
- Institution-level flat subscriptions (quantity one), not per-student charges.
- Stripe portal for payment methods, invoices, and cancellation, according to the
  portal configuration. Plan changes remain assisted; disable self-service plan
  switching until downgrade/proration policies have been reviewed and tested.
- Verified raw-body webhooks, durable event receipts, serialized canonical-state
  reconciliation, customer-to-institution binding, invoice synchronization, and
  audit events. Checkout redirects never activate subscriptions.
- A `CAMPUS_MODULE` entitlement gates academic record creation. Reading existing
  academic structure remains permission-controlled after cancellation or expiry.
  Trials expire at `trialEndsAt`; past-due subscriptions retain features while
  billing is resolved. Records are not deleted because of a payment failure.

This is not a complete college information system or a production certification.
Admissions, registration, student-specific records, tuition, official transcripts,
faculty scheduling, and graduation audits remain later academic phases.

## Provision a new institution

Use an authorized operator workstation with database access. Deploy migrations
and generate Prisma first. Supply these environment variables securely:

| Variable                     | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| INSTITUTION_NAME             | Display name                                             |
| INSTITUTION_SLUG             | Unique lowercase workspace code, such as example-college |
| INSTITUTION_OWNER_EMAIL      | Administrator email                                      |
| INSTITUTION_OWNER_FIRST_NAME | Administrator first name                                 |
| INSTITUTION_OWNER_LAST_NAME  | Administrator last name                                  |
| INSTITUTION_OWNER_PASSWORD   | Initial password meeting the existing policy             |
| INSTITUTION_TIMEZONE         | IANA timezone; defaults to UTC                           |
| INSTITUTION_PLAN_KEY         | Existing plan key; defaults to starter                   |

Run `pnpm --filter @olbos/database provision:institution`.
The command never prints the password, never overwrites an existing institution,
and commits the organization, roles, owner, trial, and audit event atomically.
A missing built-in plan is inserted from the existing catalog; existing plans
are not overwritten. The operator must verify the administrator's identity and
arrange credential handoff outside this tool. No invitation or email is sent.
The administrator should change the initial password on first sign-in; a forced
first-login password-change flow is not implemented.

The administrator signs in with email, password, and the workspace code, then
completes the institution setup page. Public self-registration, automated email
verification, and invitation delivery are not delivered by this phase.

## Configure monthly payments

Payments are disabled by default (`BILLING_DRIVER=manual`). Before enabling:

1. Use your Stripe sandbox to create products and fixed monthly recurring prices.
   Review the existing catalog prices; they are defaults, not approved commercial
   pricing. Configure the actual `plans` rows and their `externalPriceId` values.
2. Configure `BILLING_DRIVER=stripe`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, and `BILLING_RETURN_URL`. The return URL must have an
   origin in `WEB_ORIGIN`, such as `https://learn.olbos.us/admin/billing`.
3. Configure a Stripe customer portal for payment methods, invoice access, and
   cancellation. Keep plan switching disabled initially. Review cancellation,
   refunds, taxes, and renewal terms before any live launch.
4. Deliver snapshot events using API version `2025-02-24.acacia` to
   `/api/webhooks/stripe`: customer.subscription.created/updated/deleted,
   checkout.session.completed, invoice.paid/payment_failed/finalized/voided.
5. Test successful payment, rejected payment, renewal, past due, cancellation,
   replay, late delivery, provider outage, and reconciliation recovery.

The server creates the checkout and pins the provider API version. The browser
cannot choose an amount, customer ID, institution ID, or return URL. Concurrent
checkout requests for the same institution share a two-hour reservation and
provider idempotency key. A second plan cannot be checked out while the first
reservation is open. Customer and subscription IDs are uniquely bound locally.

Configure webhooks for the pinned API version, not a newer default schema.
The handler retrieves current subscription and invoice state from Stripe while
holding a per-institution lock. Unknown customer events are ignored; unconfigured
prices fail for retry and require operator attention. Stripe availability and
latency affect webhook processing; monitor delivery failures and replay failed
events after recovery. No paid Stripe calls were made during implementation.

## Usage and plan limits

The billing screen counts non-deleted user accounts, LMS courses, and stored
bytes. Suspended accounts still count until deleted. Academic catalog records
are separate from LMS content counts. Existing employee creation still applies
its training-user allowance; unified student/staff licensing and concurrent
seat enforcement are future work. Do not sell a per-student licensing guarantee
based on this first dashboard.

## Rollout and verification

Apply the entitlement-enum migration, then the additive subscription migration,
after the Campus migration. The enum change is committed separately because
PostgreSQL cannot use a new enum value in the transaction that introduces it.
The subscription migration adds
profile fields, price mappings, checkout reservations, webhook receipts, and
unique customer/subscription/invoice identifiers. First check existing external
IDs for duplicates; migrate does not silently merge or discard billing records.
The migration grants the Campus entitlement to existing paid-tier plan rows
without replacing existing entitlements or exceptions.

Run `pnpm test:all`, formatting, lint, type checking, and production builds, then
exercise the UI and Stripe sandbox against a staging PostgreSQL deployment.
Integration tests use a mocked provider with a real throwaway PostgreSQL database;
these do not replace an actual Stripe sandbox rehearsal.

Before calling the service institution-grade, finish browser/accessibility and
load testing, backup/restore drills, monitoring and incident response, secure
onboarding and recovery, verified administrative MFA, data retention/export
policies, and any institution-specific legal/privacy review. Do not advertise
unimplemented SSO, accreditation, regulatory approval, or service guarantees.
