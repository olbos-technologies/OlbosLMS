# Testing

## Layout

| Suite         | Command                 | What it covers                                    |
| ------------- | ----------------------- | ------------------------------------------------- |
| `unit`        | `pnpm test:unit`        | Domain engines, policy, helpers. No I/O           |
| `integration` | `pnpm test:integration` | Real PostgreSQL; tenant isolation; full workflows |
| both          | `pnpm test:all`         | What CI runs                                      |

Unit tests alias workspace packages to their TypeScript sources, so they run
without a build step. Integration tests run in a single fork against one
database, because they truncate between suites.

## Current state

```
Unit          445 tests   ~3s
Integration   131 tests   ~11s (against PostgreSQL 16)
```

Every number in the documentation was taken from a run, not estimated.

## Integration setup

`tests/integration/setup.ts` requires `TEST_DATABASE_URL` and **refuses to run
unless the database name contains "test"** — the suite truncates every table, and
that guard is what stands between a mistyped variable and a developer's data.

It applies migrations with `prisma migrate deploy` before the first suite, sets
`LOG_LEVEL=silent` (assigned, not defaulted — `.env` is loaded first, so `??=`
would leave a developer's setting in place and bury the output), and provides
fixtures that build a complete tenant.

## What the integration tests prove

**Tenant isolation (§52, mandatory).** 70 tests at the Prisma layer and 37 at the
HTTP layer. The HTTP suite signs in as tenant B's _organization owner_ — the most
privileged actor available — and tries to reach tenant A by id across every
resource and every write path.

Two assertions worth repeating:

- Cross-tenant reads must return **404, not 403**. A 403 confirms existence.
- List and analytics responses are checked by searching the whole serialised body
  for tenant A's organization id, not just the fields the author thought of.

**The critical workflow (§51).** One test file walks it end to end through the
API: create an employee → the requirement engine assigns training → matrix shows
PENDING → record the completion → certificate issued → matrix shows CURRENT →
audit trail written → certificate verifies publicly → the employee changes job
role and the obligation is withdrawn while the historical record survives.

**Login hardening.** Wrong password and unknown account return byte-identical
responses. Logout revokes the session. Both outcomes are audited.

**Database guarantees.** `UPDATE` and `DELETE` on `audit_logs` raise.

## Writing a test

Prefer a real database over a mock. The bugs that matter in this product are
about what the database actually does — cascade behaviour, unique constraints,
trigger enforcement — and a mock agrees with whatever the author assumed.

Prefer asserting on behaviour over structure. `expect(response.statusCode).toBe(404)`
survives a refactor; asserting on an internal call does not.

Make failures readable. Where a loop asserts over cases, embed the case name in
the assertion:

```ts
expect(`${label}:${response.statusCode}`).toBe(`${label}:404`);
```

Never write an assertion that cannot fail. `expect(x.length).toBeGreaterThanOrEqual(0)`
is worse than no test: it costs runtime and buys confidence it has not earned.
(One was written during this build and removed for exactly that reason.)

## Bugs these tests caught

Documented because they are the argument for the tests existing:

| Bug                                                              | Found by                                          |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `splitApiKey` split on `_`, which base64url secrets contain      | Unit test round-tripping 200 generated keys       |
| Path traversal in the storage driver reported as `NOT_FOUND`     | Unit test asserting the error, not just the throw |
| `session_replication_role = 'replica'` orphaned 30 rows on purge | Orphan count check after a tenant delete          |
| `finally` re-enabling triggers masked the real transaction error | Seed failure with a misleading message            |
| Tenant guard could not be applied inside a Prisma transaction    | The completion endpoint returning 500             |
| `z.coerce.boolean()` read `"false"` as `true`                    | Browser test noticing unexpected 404 prefetches   |
| Seed wrote `NOT_APPLICABLE` cells the engine would never create  | Sweep reporting 39 status changes on fresh data   |
| Expiry-window filter matched already-expired items               | Unit test on `filterMatrix`                       |

## Not yet built

- Browser end-to-end tests as a committed suite. The application _was_ driven
  with Playwright across six screens and two roles during this build, but that
  script lives outside the repository; committing it as a Playwright project is
  a roadmap item.
- Load and performance testing.
- Accessibility testing with axe. The components were built to WCAG 2.2 AA
  principles — semantic HTML, visible focus, status conveyed by text and glyph as
  well as colour — but this is not the same as having tested it.
- Backup and restore drills.
