# Multi-tenancy

Tenant isolation is the single property this system cannot get wrong. A bug in
the gradebook produces a wrong number; a bug here shows one manufacturer another
manufacturer's injury records.

## The model

One PostgreSQL database, one schema, `organizationId` on every tenant-owned
table. Not schema-per-tenant and not database-per-tenant, because a compliance
product needs cross-tenant platform analytics, and because thousands of schemas
make migrations a operational hazard rather than a routine deploy.

The trade is that isolation becomes an application property, so it is enforced
in exactly one place and tested exhaustively.

## Enforcement: the tenant client

`packages/database/src/tenancy.ts` lists every tenant-owned model.
`forTenant(organizationId)` returns a Prisma client extension that rewrites every
operation on those models:

| Operation                                                | Rewrite                                                |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `findMany`, `findFirst`, `count`, `aggregate`, `groupBy` | `where.organizationId` injected                        |
| `create`, `createMany`                                   | `data.organizationId` stamped, including nested writes |
| `update`, `delete`, `updateMany`, `deleteMany`, `upsert` | `where.organizationId` injected                        |
| `findUnique`, `findUniqueOrThrow`                        | result verified after the fact (see below)             |

Three details matter:

**Unique lookups are verified, not filtered.** Prisma rejects a non-unique field
in a `findUnique` where-clause, so the tenant filter cannot be added. The
extension instead checks the returned row's `organizationId` and returns `null`
on a mismatch — which makes a cross-tenant id indistinguishable from a
nonexistent one.

**A mismatched explicit tenant is rejected, not honoured.** Passing
`organizationId` that disagrees with the context throws `TenantIsolationError`.
Silently overwriting it would let a request body influence the tenant, which is
the exact class of bug this exists to prevent.

**Nested writes are stamped.** `course.create({ data: { versions: { create: {
modules: { create: [...] } } } } })` stamps the course, the version and every
module. The relation graph comes from the Prisma DMMF, so a new relation is
covered automatically.

## Where the tenant comes from

Only from the authenticated session.

```
cookie -> user_sessions row -> user.organizationId -> forTenant(...)
```

`request.db` is a lazy getter on the Fastify request with no setter. There is no
code path — no header, no query parameter, no body field — that can influence
which tenant a request is bound to. `apps/api/src/plugins/context.ts` is the only
place `forTenant` is called during a request.

## Escaping the guard

Two escape hatches exist, both deliberate and both narrow:

`getPrismaClient()` returns an unscoped client. It is used for authentication
before a tenant is known, by the readiness probe, by the public certificate
verification endpoint (deliberately cross-tenant, and unauthenticated), and by
worker sweeps that iterate tenants explicitly.

Using it inside a request handler is a review failure — and is now enforced by
ESLint rather than by memory. `no-restricted-imports` bans the symbol across
`apps/api/src/routes/v1/**`, which is exactly the authenticated tenant surface;
`routes/health.ts` and `routes/public.ts` sit outside it because neither has a
tenant. The rule was added after a review found `/billing/subscription` reading
a tenant-owned model through the unscoped client: the value it returned was
correct, because the `where` was keyed on the session's `organizationId`, but
the guard's post-read verification was skipped and nothing would have caught a
later change to that query.

`Organization` is the one model a handler may query that the guard does not
rewrite: it _is_ the tenant, keyed by `id` rather than `organizationId`, so it
is deliberately absent from `TENANT_OWNED_MODELS`. Handlers still reach it
through `request.db`, so that anything tenant-owned added beside it is scoped
by default.

`purgeOrganization()` in `packages/database/src/maintenance.ts` deletes a tenant
including its append-only audit trail, for lawful erasure. It requires table
ownership, which a correctly provisioned application role does not have.

A note on a tempting shortcut: `SET session_replication_role = 'replica'` is
**wrong** for the purge. It suspends every non-ALWAYS trigger, including the
referential-integrity triggers implementing `ON DELETE CASCADE`, so it orphans
rows rather than deleting them. (This was found in development by a check that
counted orphaned rows after a purge; the fix disables only the two append-only
triggers and deletes tenant tables in a topological order read from the
catalogue.)

## Testing

`tests/integration/tenant-isolation.test.ts` — 70 tests at the Prisma layer.
`tests/integration/api-tenant-isolation.test.ts` — 41 tests at the HTTP layer,
using the _organization owner_ of tenant B, holding a valid session and CSRF
token. If the most privileged user in a tenant cannot cross the boundary, no
weaker role can.

Covered: users, employees, courses, course versions, training requirements,
training assignments, training records, certificates, files, AI conversations,
audit logs, report runs, analytics, dashboards, the training matrix, and every
write path.

Two assertions are worth calling out:

- Cross-tenant reads return **404, not 403**. A 403 confirms the resource
  exists.
- List and analytics responses are checked by searching the entire serialised
  body for the other tenant's organization id, rather than only the fields the
  test author thought to inspect.

## Adding a tenant-owned table

1. Add `organizationId String @db.Uuid` and a relation to `Organization`.
2. Index it first: `@@index([organizationId, ...])`.
3. Add the model name to `TENANT_OWNED_MODELS`, in sorted order.
4. `packages/database/src/schema-contract.test.ts` fails the build if step 3 is
   forgotten — it compares the list against the live DMMF.

## Known limitation

Isolation is enforced in the application, not by PostgreSQL row-level security.
A direct database connection bypasses it. RLS as defence-in-depth is on the
roadmap; it needs `SET LOCAL app.tenant_id` inside every transaction, which
changes the connection model.
