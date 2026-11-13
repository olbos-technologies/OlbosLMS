# Repository audit (Phase 0)

Performed before any code was written, as §60 requires.

## What existed

Nothing. `github.com/mangpijasuan/OlbosLMS` was an empty repository: no commits, no
branches, no remote refs. `git ls-remote` returned nothing and the working tree
contained only `.git/`.

There was therefore no existing application to inspect, preserve or refactor —
no `package.json`, no source tree, no database, no deployment configuration, no
tests. The instruction in §54 ("if the repository already contains a working
application, do not rebuild it") did not apply.

This document records that finding so the decision is auditable, and so a later
reader does not assume a prior codebase was discarded.

## Consequences for the plan

Because this is a greenfield build, §55's recommended monorepo was adopted
directly rather than adapted:

```
apps/       web (Next.js) · api (Fastify) · worker (scheduled jobs)
packages/   config · database · permissions · core · auth · billing
            notifications · storage · ai · ui
docs/       this directory
tests/      cross-package integration and tenant-isolation suites
```

## Toolchain found in the environment

| Tool       | Version | Used for                                   |
| ---------- | ------- | ------------------------------------------ |
| Node       | 22.22.2 | Runtime for all three apps                 |
| pnpm       | 10.33.0 | Workspace package manager                  |
| PostgreSQL | 16.13   | Primary datastore (local cluster started)  |
| Docker     | 29.3.1  | `docker compose` for local dependencies    |
| Chromium   | bundled | Playwright verification of the running app |

## Risks identified up front

| Risk                                                                | Mitigation adopted                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant data leakage — the highest-severity failure for this product | Tenant scoping enforced in one place (`packages/database/src/tenancy.ts`) and proven by 111 integration tests against Postgres                                     |
| Compliance history being rewritten by a later course edit           | Course versioning plus snapshot fields on training records; append-only audit tables enforced by database triggers                                                 |
| Misrepresenting regulatory authorisation (§10)                      | `packages/core/src/representation.ts` blocks the claim at course creation and again at publication                                                                 |
| AI asserting compliance or legal conclusions                        | `packages/ai/src/guardrails.ts` — prompt rules plus an output review that blocks, not merely warns                                                                 |
| Scope: the specification describes several years of product         | Built the compliance core to production quality; everything else is either implemented, explicitly marked planned, or documented as not started (see `roadmap.md`) |

## Verification performed

Every claim in these documents was checked against a running system, not
inferred:

- 445 unit tests and 131 integration tests against a real PostgreSQL database.
- The API booted and driven end to end with `curl`.
- The web application built, served, and driven with Playwright across six
  screens and two roles.
- The worker run with `--once` against seeded data, and confirmed idempotent.
