# Deployment

## Local development

```bash
docker compose up -d postgres redis        # or use a local PostgreSQL 16
cp .env.example .env
openssl rand -hex 32                       # SESSION_SECRET
openssl rand -hex 32                       # CERTIFICATE_SIGNING_SECRET (must differ)

pnpm install
pnpm db:migrate
pnpm db:seed
pnpm build                                 # packages must be built before the apps run
pnpm dev                                   # api :4000 · web :3000 · worker
```

Demo accounts all use `olbos-demo-passphrase`:

| Account                    | Role                         |
| -------------------------- | ---------------------------- |
| `owner@acme.test`          | Organization Owner           |
| `ehs@acme.test`            | EHS Administrator            |
| `hr@acme.test`             | HR Administrator             |
| `supervisor@acme.test`     | Supervisor                   |
| `trainer@acme.test`        | Safety Trainer               |
| `learner@acme.test`        | Employee                     |
| `professor@northgate.test` | Instructor (academic tenant) |
| `platform@olbos.test`      | Platform Owner               |

## Processes

| Process | Command             | Scale            | Notes                                   |
| ------- | ------------------- | ---------------- | --------------------------------------- |
| api     | `node dist/main.js` | Horizontal       | Stateless; sessions are in the database |
| web     | `next start`        | Horizontal       | Stateless                               |
| worker  | `node dist/main.js` | **One instance** | Jobs are not distributed-safe yet       |

The worker's single-instance constraint is real: the runtime has no leader
election or distributed lock. Two instances would run the same sweep
concurrently. Making it horizontal means putting the queue behind Redis — the
`JobQueue` interface is the seam for that.

`node dist/main.js --once` runs every job once and exits, for an operator who
needs a sweep now.

## Environment

Validated at boot by `@olbos/config`. A missing or placeholder secret fails the
start rather than the first request.

Required: `DATABASE_URL`, `SESSION_SECRET`, `CERTIFICATE_SIGNING_SECRET`.
Production additionally enforces: the two secrets must differ, and every
`WEB_ORIGIN` must be `https://`.

## Database roles

Provision two:

| Role        | Grants                                | Used by                 |
| ----------- | ------------------------------------- | ----------------------- |
| `olbos_app` | SELECT/INSERT/UPDATE/DELETE on tables | api, worker             |
| `olbos_ddl` | Table ownership, migrations           | `migrate deploy`, purge |

This matters. `ALTER TABLE ... DISABLE TRIGGER` requires ownership, so an
application running as `olbos_app` **cannot** bypass the append-only audit
triggers, whatever a bug does. Running the application as the owner throws that
guarantee away.

## Migrations

`pnpm db:migrate:deploy` before rolling the new version. Migrations are additive
and forward-only; a destructive change is two deploys (add, backfill, then
remove).

## Health

| Endpoint   | Answers                         | Should gate                     |
| ---------- | ------------------------------- | ------------------------------- |
| `/healthz` | Is the process alive            | Liveness probe / restarts       |
| `/readyz`  | Can it serve traffic (DB check) | Readiness probe / load balancer |

`/healthz` deliberately touches no dependency: a slow database should not cause
an orchestrator to restart a healthy process.

## Reverse proxy

The API sets `trustProxy`. Without a proxy that sets `x-forwarded-for`, every
client shares one rate-limit bucket and every audit row records the proxy's
address.

Terminate TLS at the proxy; the API sets HSTS in production.

## Backups

Not configured here — it is a platform decision. What the schema needs from one:
point-in-time recovery, because training records and certificates are the system
of record for regulatory training, and a restore that loses a day loses evidence
someone was trained.

Restore drills are a roadmap item, and the roadmap says so rather than implying
they have been done.

## Not configured

CDN, WAF, secret manager integration, log shipping, metrics export, tracing,
error monitoring, autoscaling. The application emits structured JSON logs with
request ids and exposes health endpoints; wiring them to a platform is
deployment work that has not been done in this environment.
