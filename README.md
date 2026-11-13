# OLBOS LMS

A multi-tenant learning, training and safety compliance platform. One system
serving academic education, corporate training, and — the part that carries the
commercial weight — safety and regulatory training compliance.

The moat is not "a website where people watch training videos". It is the chain:

```
Course → Employee → Requirement → Assignment → Completion → Assessment →
Training Record → Expiration → Certificate → Compliance → Reporting
```

## What is here

```
apps/
  api/      Fastify · auth, authorization, validation, audit, transactions
  web/      Next.js · renders; holds no business rules
  worker/   Scheduled jobs · expiry sweeps, notifications, metering
packages/
  core/         The domain engines. Pure, no I/O
  permissions/  Permissions, roles, policy, the navigation tree
  database/     Prisma schema, tenant client, privileged maintenance
  auth/ billing/ notifications/ storage/ ai/ config/ ui/
docs/       Source of truth
tests/      Integration and tenant-isolation suites
```

## Running it

Needs Node 20+, pnpm and PostgreSQL 16.

```bash
docker compose up -d postgres redis       # or a local PostgreSQL 16

cp .env.example .env
# Set two different 32+ character secrets:
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CERTIFICATE_SIGNING_SECRET

pnpm install
pnpm build              # packages must be built before the apps resolve them
pnpm db:migrate
pnpm db:seed
pnpm dev                # api :4000 · web :3000 · worker
```

Open http://localhost:3000 and sign in. Every demo account uses
`olbos-demo-passphrase`:

| Account                    | Role               | Worth seeing                           |
| -------------------------- | ------------------ | -------------------------------------- |
| `ehs@acme.test`            | EHS Administrator  | Safety Command Center, training matrix |
| `supervisor@acme.test`     | Supervisor         | The same screens, scoped to their team |
| `learner@acme.test`        | Employee           | My Learning, and how little else       |
| `owner@acme.test`          | Organization Owner | Everything, including billing          |
| `professor@northgate.test` | Instructor         | A second tenant, academic side         |

The seeded manufacturer sits at **67.5% compliance** with a deliberate spread of
current, expiring, expired, missing and pending training — a demo where everyone
is compliant shows none of the software that matters.

## Verifying

```bash
pnpm test:all      # 445 unit + 131 integration (needs PostgreSQL)
pnpm typecheck
pnpm lint
```

Integration tests need `TEST_DATABASE_URL` pointing at a throwaway database whose
name contains "test" — the suite truncates every table and refuses to run
otherwise.

## The three properties that matter

**Tenant isolation.** One database, `organizationId` everywhere, enforced by a
Prisma client extension in one file and proven by 111 integration tests. A
cross-tenant read returns 404, never 403 — a 403 would confirm the resource
exists. The tenant comes from the session and nowhere else.

**History is not rewritten.** Training records snapshot the course version they
were taken against, so editing a course in 2027 cannot change what a 2026 record
says. Corrections supersede; they do not mutate. `audit_logs` and `grade_audits`
carry database triggers that reject `UPDATE` and `DELETE`.

**No fabricated compliance.** OLBOS never claims a course is OSHA-approved, that
training satisfies a regulation, or that an organization is compliant. Course
types that assert an external authorisation cannot be published without recorded
evidence, and the resulting disclaimer travels onto the certificate and the
public verification page.

## Documentation

| Document                                        | Read it for                                           |
| ----------------------------------------------- | ----------------------------------------------------- |
| [`architecture.md`](docs/architecture.md)       | How the pieces fit and why                            |
| [`multi-tenancy.md`](docs/multi-tenancy.md)     | Isolation, and how it is proven                       |
| [`security.md`](docs/security.md)               | Auth, authorization, threats, and what is _not_ built |
| [`authorization.md`](docs/authorization.md)     | Permissions, roles, scopes, visibility ladders        |
| [`database.md`](docs/database.md)               | Schema decisions and migrations                       |
| [`safety-training.md`](docs/safety-training.md) | The §10 representation rules                          |
| [`training-matrix.md`](docs/training-matrix.md) | Status semantics and why they were chosen             |
| [`api.md`](docs/api.md)                         | Endpoints and conventions                             |
| [`billing.md`](docs/billing.md)                 | Entitlements as data                                  |
| [`ai.md`](docs/ai.md)                           | Guardrails                                            |
| [`testing.md`](docs/testing.md)                 | Approach, and the bugs the tests caught               |
| [`deployment.md`](docs/deployment.md)           | Processes, roles, health, backups                     |
| [`roadmap.md`](docs/roadmap.md)                 | **What is not built**                                 |

`AGENTS.md` and `CLAUDE.md` hold the rules for coding agents.

## Status

The compliance core is built and verified end to end: multi-tenancy,
authentication, authorization, the requirement and expiration engines, the
training matrix, certificates with public verification, practical assessments,
incidents, the safety command centre, entitlements, AI guardrails and the
scheduled jobs that keep it all true as time passes.

Substantial parts of the specification are **not** built — the assessment and
gradebook HTTP surface (though their engines are written and tested), file
upload, SSO, SCORM/LTI, platform administration, PDF certificates and email
delivery among them. [`docs/roadmap.md`](docs/roadmap.md) lists all of it
honestly rather than leaving you to discover it.

## Licence

Proprietary. All rights reserved.
