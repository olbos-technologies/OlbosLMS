# CLAUDE.md

Instructions for Claude Code in this repository. **Read `AGENTS.md` first** — it
holds the rules that apply to every agent. This file adds what is specific to
working here with Claude Code.

## Orientation

```
apps/api        Fastify. Auth, authorization, validation, audit, transactions
apps/web        Next.js. Renders; holds no business rules
apps/worker     Scheduled jobs: sweeps, notifications, metering
packages/core   The domain engines. Pure functions, no I/O
packages/permissions  Permissions, roles, policy, the navigation tree
packages/database     Prisma schema, tenant client, privileged maintenance
docs/           Source of truth. Start with architecture.md and multi-tenancy.md
```

The two files worth reading before changing anything:
`packages/database/src/tenancy.ts` and `packages/permissions/src/policy.ts`.

## Before you start

```bash
pnpm install
pnpm build            # packages must be built before apps resolve them
pnpm db:migrate
pnpm db:seed
pnpm test:all         # 445 unit + 131 integration; needs PostgreSQL
```

Integration tests need `TEST_DATABASE_URL` pointing at a throwaway database whose
name contains "test". The suite refuses to run otherwise, because it truncates
every table.

## Where things go

| Kind of change                                      | Where                                                  |
| --------------------------------------------------- | ------------------------------------------------------ |
| A rule about expiry, requirements, grading, scoring | `packages/core`, as a pure function with tests         |
| A permission or role change                         | `packages/permissions`                                 |
| A new endpoint                                      | `apps/api/src/routes/v1/` — validate, authorize, audit |
| A screen                                            | `apps/web/src/app/` — data through TanStack Query      |
| A scheduled job                                     | `apps/worker/src/jobs/`                                |
| A schema change                                     | `packages/database/prisma/schema.prisma` + a migration |

Domain logic belongs in `packages/core` even when only one endpoint uses it. It
is testable there without a database, which is why 445 unit tests run in three
seconds.

## Checklist for a new endpoint

1. Zod schema for body, query and params — nothing unvalidated reaches a service.
2. `request.requireTenant()` for the principal and tenant client.
3. `request.authorize(permission, resource)` — with the resource, so scoped roles
   work.
4. `request.requireEntitlement(key)` if the feature is plan-gated.
5. Query through `request.db`, never `getPrismaClient()`.
6. `request.audit({...})` for anything that changes state.
7. Return `ok(data)` or `paginated(items, total, pagination)`.
8. An integration test — including the cross-tenant case.

## Things that will bite you

**The tenant guard and transactions.** `forTenant()` must be applied _before_
`$transaction`, because a Prisma transaction client has no `$extends`. Use
`withTenantTransaction()`.

**Prisma types still want `organizationId`.** The guard supplies it at runtime,
but the generated types require it. Pass it explicitly — the guard then verifies
it matches, which is stronger than silent injection.

**`z.coerce.boolean()` is a trap.** It reads `"false"` as `true`. Use
`booleanQuery` from `apps/api/src/lib/http.ts`.

**Compliance cells only exist where the requirement applies.** Do not write a
`NOT_APPLICABLE` row. A missing cell renders as N/A. The invariant: a sweep over
unchanged data reports zero status changes.

**Audit tables are append-only in the database.** An `UPDATE` or `DELETE` raises.
Lawful erasure goes through `purgeOrganization()`.

## Verifying

Compiling is not working. Before saying something is done:

```bash
pnpm typecheck && pnpm lint && pnpm test:all
pnpm --filter @olbos/api exec tsx --conditions development src/main.ts &
curl -s localhost:4000/readyz
```

For a UI change, run the app and look at it. Playwright with
`executablePath: '/opt/pw-browsers/chromium'` works in this environment.

## Reporting

Say what you verified and how. If a test fails, show the output. If you skipped
something, say which and why. `docs/roadmap.md` lists what is not built — if you
build one of those things, move it; if you find something else missing, add it.

Do not describe partial work as complete. §61 of the product specification is the
standard: a feature is done when the UI, API, database, authorization,
validation, error handling, loading and empty states, tests, audit logging and
documentation all exist.
