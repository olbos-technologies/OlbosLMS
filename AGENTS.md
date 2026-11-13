# AGENTS.md

Rules for any coding agent working in this repository — Claude Code, Cursor, or
whatever comes next. `CLAUDE.md` and `.cursor/rules/` defer to this file.

## What this product is

OLBOS is a multi-tenant SaaS platform that organizations use to decide who is
allowed to operate a forklift, enter a confined space, or work on energised
equipment. Its training records are the evidence an organization produces in an
audit, and after an incident.

That framing decides most arguments. A bug in a marketing site is embarrassing.
A bug here can show one manufacturer another's injury records, or record that
someone was trained when they were not.

## Inspect before you change

Read the existing implementation first. This codebase has non-obvious
constraints, and several were discovered the expensive way:

- The tenant guard cannot be applied inside a Prisma transaction — extensions
  must be applied to the client _before_ `$transaction`.
- `SET session_replication_role = 'replica'` also disables foreign-key cascade
  triggers, so using it to bypass an audit trigger orphans rows.
- `z.coerce.boolean()` reads the string `"false"` as `true`.

If something looks redundant, assume it is load-bearing until you have found the
test that covers it.

## Non-negotiable

**Tenant isolation.** Every query serving a request goes through
`request.db` (the tenant-scoped client). `getPrismaClient()` in a route handler
is a review failure. Adding a table with `organizationId` means adding it to
`TENANT_OWNED_MODELS` — the schema-contract test fails the build otherwise.

**Backend authorization.** Every endpoint calls `authorize()`. Hiding a button
is not a control. A cross-tenant read returns **404, not 403** — a 403 confirms
the resource exists.

**Never fabricate regulatory compliance.** OLBOS does not determine that anyone
is compliant with anything. Do not write a claim that a course is OSHA-approved,
that training satisfies a regulation, or that an organization is compliant — not
in code, not in a UI string, not in a comment, not in a commit message. The rules
are enforced in `packages/core/src/representation.ts` and
`packages/ai/src/guardrails.ts`; do not weaken them.

**Never rewrite history.** Training records, certificates, grades and audit logs
are append-or-supersede. Correcting a record writes a new one. `audit_logs` and
`grade_audits` have database triggers that will stop you.

**Never commit a secret.** `.env` is git-ignored. `@olbos/config` rejects the
placeholder values from `.env.example` at boot.

## Tests

Write them. Then verify by running.

- Domain logic goes in `packages/core` or `packages/permissions` as pure
  functions, tested without a database.
- Anything touching the tenant boundary gets an integration test.
- Prefer a real database over a mock: the bugs that matter here are about what
  Postgres actually does.
- Never write an assertion that cannot fail. A test that always passes is worse
  than no test — it costs runtime and buys unearned confidence.

## Verify before claiming

Do not report a feature as working because it compiles. Run it:

```bash
pnpm test:all                  # 445 unit + 131 integration
pnpm typecheck && pnpm lint
pnpm --filter @olbos/api exec tsx --conditions development src/main.ts
curl -s localhost:4000/readyz
```

If you cannot verify something, say so plainly rather than implying you did.
`docs/roadmap.md` states what is not built; keep it accurate.

## Documentation

`docs/` is the source of truth. Change behaviour, change the doc in the same
commit. If you find a doc that no longer matches the code, fix the doc — a wrong
document is worse than a missing one, because someone will trust it.

## Style

Match the surrounding code. Comments explain _why_, never _what_ — assume the
reader can read TypeScript but cannot read your mind about the trade-off you
made. Prefer explicitness over cleverness; this code will be read by someone
debugging a compliance discrepancy under time pressure.

## Do not

- Rewrite working architecture because you prefer a different framework.
- Add a dependency that does one thing you could write in thirty lines. (The S3
  driver implements SigV4 directly for this reason.)
- Introduce `if (plan === 'PRO')`. Entitlements are data.
- Branch on a role name. Ask for a permission.
- Widen scope beyond what was asked. Finish what was asked first.
