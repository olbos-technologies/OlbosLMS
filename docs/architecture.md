# Architecture

## Shape

Three processes over one PostgreSQL database, with the domain logic in packages
that none of them own.

```
                    ┌──────────────┐
   browser ────────▶│  apps/web    │  Next.js 16 · React 19 · Tailwind 4
                    │  (port 3000) │  Renders; holds no business rules
                    └──────┬───────┘
                           │ fetch, session cookie + CSRF header
                    ┌──────▼───────┐
                    │  apps/api    │  Fastify 5 · Zod
                    │  (port 4000) │  AuthN/Z, validation, audit, transactions
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐   ┌───────▼───────┐  ┌───────▼────────┐
│ packages/*   │   │  PostgreSQL   │  │  apps/worker   │
│ domain logic │   │   16 + Prisma │  │ scheduled jobs │
└──────────────┘   └───────────────┘  └────────────────┘
```

The web application contains no business rules. It cannot: every rule it would
need is enforced by the API anyway, and duplicating one is how the two drift
apart. Even the sidebar comes from `/api/v1/me/navigation`, built by the same
permission checks the API enforces.

## Packages

| Package                | Responsibility                                                    | Dependencies    |
| ---------------------- | ----------------------------------------------------------------- | --------------- |
| `@olbos/config`        | Environment schema; fails the boot on a bad or placeholder secret | zod             |
| `@olbos/core`          | The domain engines. Pure functions, no I/O                        | none            |
| `@olbos/permissions`   | Permission catalogue, roles, policy engine, navigation tree       | none            |
| `@olbos/database`      | Prisma schema, tenant client, privileged maintenance              | config, prisma  |
| `@olbos/auth`          | Argon2id hashing, opaque tokens, password and session policy      | @node-rs/argon2 |
| `@olbos/billing`       | Plans, entitlement resolution, usage limits                       | none            |
| `@olbos/notifications` | Message content, delivery policy, batching, transports            | none            |
| `@olbos/storage`       | Storage driver interface, local driver, S3 driver (SigV4, no SDK) | config          |
| `@olbos/ai`            | Provider abstraction and the guardrails around it                 | config          |
| `@olbos/ui`            | React design system                                               | react, tailwind |

`@olbos/core` and `@olbos/permissions` depend on nothing. That is what lets the
compliance rules be tested exhaustively — 445 unit tests run in under three
seconds because none of them touch a database.

## The compliance pipeline

The product's core, and the reason the schema looks the way it does:

```
TrainingRequirement          "Maintenance Technicians need Lockout/Tagout"
        │  requirement engine evaluates employee attributes
        ▼
TrainingAssignment           "Nadia owes it, due 14 March"
        │  learner completes; or an instructor records it
        ▼
TrainingRecord               permanent, snapshotted, never rewritten
        │  if the course issues one
        ▼
Certificate                  HMAC-signed, publicly verifiable
        │  computed from record + policy
        ▼
ComplianceState              one row per (employee × requirement) — the matrix cell
```

Two decisions shape everything downstream.

**Course content is versioned; records snapshot it.** A `TrainingRecord` stores
`courseTitle` and `courseVersionNumber` as values, not as joins. Editing a
course in 2027 must not change what a 2026 record says the person was taught.

**Compliance is materialised, not computed on read.** `ComplianceState` is
denormalised so the training matrix for 5,000 employees is one indexed query.
The sweep keeps it true as time passes — which is what makes a dashboard correct
at 09:00 without anyone having opened the app.

## Request lifecycle

```
onRequest  request id            → x-request-id, echoed and logged
onRequest  session               → cookie → session row → principal
onRequest  CSRF                  → double-submit, mutating methods only
handler    parse                 → Zod; unvalidated input never reaches a service
handler    authorize             → assertCan(principal, permission, resource)
handler    entitlement           → assertEntitled(plan)
handler    request.db            → tenant-scoped client, from the session only
handler    audit                 → append-only, redacted
onError    normalise             → one error contract; internals never escape
```

## Why Fastify and not Next API routes

The API is a separate process because the worker needs the same services, and
because a compliance API is a product surface with its own versioning, rate
limits and audit obligations. Co-locating it with page rendering would tie the
two deploy cadences together and make the audit boundary fuzzy.

## Why Prisma

Type-safe queries over a normalised schema, and — decisively — client extensions,
which make tenant scoping a property of the client rather than a discipline
applied at 400 call sites.

The cost is that Prisma's generated types still require `organizationId` on
creates even though the extension supplies it. Rather than casting it away, the
services pass it explicitly; the guard then _verifies_ the value instead of
silently supplying it, which is stronger.

## Verification status

| Layer            | How it was verified                                       |
| ---------------- | --------------------------------------------------------- |
| Domain engines   | 445 unit tests                                            |
| Tenant isolation | 111 integration tests against PostgreSQL                  |
| API              | Booted; every core flow driven end to end                 |
| Web              | Built, served, driven with Playwright across 6 screens    |
| Worker           | Run with `--once`; sweep confirmed idempotent             |
| Certificates     | Issued, verified publicly, and tamper-detection confirmed |
