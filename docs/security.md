# Security

## Authentication

**Passwords** — Argon2id at the OWASP floor (19 MiB, t=2, p=1). Parameters live
in the stored PHC string, so raising them later re-hashes transparently on the
next successful sign-in (`needsUpgrade`). Nothing else is accepted; a legacy
bcrypt hash would be flagged for upgrade on first use.

**Login is not an oracle.** Unknown email, wrong password, disabled account and
suspended organization all return the same 401 with the same message, and every
attempt pays the Argon2 cost — an unknown email is verified against a dummy hash
so the response time does not distinguish it. Verified by an integration test
that asserts the two responses are byte-identical.

**Sessions** are server-side rows. The cookie carries an opaque 256-bit token;
the database stores only its SHA-256. A database disclosure therefore does not
hand out live sessions, and revocation is immediate. A successful login issues a
fresh token, which closes session fixation.

**Throttling** — ten failed attempts locks the account, with exponential backoff
across repeated lockouts (15 min, 30, 60, …, capped). `/auth/login` additionally
has its own rate limit, far tighter than the global one.

**Password reset** invalidates every session for that user. If the reset was
driven by a compromise, the attacker's session must not survive it. A password
_change_ keeps the current session and revokes the others, so the user is not
thrown out of the page they are on.

## Authorization

Three layers, all enforced server-side:

1. **RBAC** — `can(ctx, 'training_record:create')`. Nothing branches on a role
   name, so a customer's custom role behaves exactly like a built-in one.
2. **Resource scope** — a `DEPARTMENT`-scoped role only reaches resources in that
   department; a supervisor only reaches their own reports (resolved recursively
   through the supervisor tree).
3. **Tenant isolation** — see `multi-tenancy.md`.

List endpoints resolve a _visibility ladder_ rather than guessing which permission
variant to check: `training_record:read` → `read_team` → `read_own`, taking the
widest the caller holds and converting it into a database filter. A supervisor
asking for another department gets their own team back, not an error and not the
other department.

The frontend calls the same `can()`, but only to decide what to render. Hiding a
button is not what stops an unauthorised call.

## CSRF

Double-submit. The session cookie is `HttpOnly` (unreadable by script); the CSRF
cookie deliberately is not, because the SPA must echo it in `x-csrf-token`. A
cross-site request can carry the cookies but cannot set the header, so it cannot
produce both. Enforced on every mutating method for every cookie-authenticated
request; the comparison is constant-time.

## Input and output

Every handler parses `request.body`, `.query` and `.params` through Zod. An
unvalidated value never reaches a service.

`sort` is checked against an explicit allowlist per endpoint — otherwise a caller
could order by a column they should not know exists.

Query booleans use `booleanQuery`, not `z.coerce.boolean()`. The latter applies
JavaScript truthiness, so the string `"false"` becomes `true` and every
`?flag=false` silently means its opposite. (This was a live bug, found by a
browser test noticing 404s from a `?includePlanned=false` request that was being
read as `true`; there is now a regression test.)

CSV exports neutralise leading `=`, `+`, `-` and `@`, which a spreadsheet would
otherwise execute as a formula.

## Errors

One contract: `{ error: { code, message, details?, requestId } }`. Stack traces,
SQL and internal identifiers never cross the boundary.

A `TenantIsolationError` becomes a **500 with an alert**, never a 403 — a 403
would confirm to the caller that the resource exists in another tenant. It is a
programming error, and it is treated as an incident.

## Transport

| Header                      | Value                                        |
| --------------------------- | -------------------------------------------- |
| `content-security-policy`   | `default-src 'none'; frame-ancestors 'none'` |
| `strict-transport-security` | 2 years, includeSubDomains, preload (prod)   |
| `x-content-type-options`    | `nosniff`                                    |
| `x-frame-options`           | `DENY`                                       |
| `referrer-policy`           | `no-referrer`                                |
| `cache-control`             | `no-store` on every API response             |

CORS is an allowlist read from `WEB_ORIGIN`, never a reflection of the `Origin`
header. Credentials are enabled, which makes a permissive origin policy actively
dangerous, so one is not offered even in development. Production additionally
refuses to boot with an `http://` origin.

## Files

Object keys are `tenants/<organizationId>/...`, so even a bug that let a caller
name a key keeps tenants in separate namespaces. Uploads are checked against a
content-type allowlist; filenames are stripped of control characters (including
U+202E, the right-to-left override used to disguise `exe` as `png`), path
separators and leading dots. Downloads go through short-lived signed URLs so
access is re-evaluated per request. SVG and HTML are always served as
attachments — they execute script in the storage origin otherwise.

Malware scanning is an interface with a default that reports `SKIPPED` rather
than pretending a file is clean. Wiring a scanner is a deployment task.

## Secrets

Validated at boot by `@olbos/config`: minimum 32 characters, and the placeholder
from `.env.example` is rejected outright. Production additionally refuses to
start if `SESSION_SECRET` and `CERTIFICATE_SIGNING_SECRET` are the same value.
`.env` is git-ignored; no secret is committed.

## Audit

`audit_logs` and `grade_audits` carry `BEFORE UPDATE OR DELETE` triggers that
raise. The application cannot rewrite compliance history — not by bug, not by a
compromised application account. Proven by an integration test that attempts
both and expects failure.

Payloads are redacted before write (passwords, tokens, keys, secrets) at the
audit service, not at each call site.

## Threats and where they are handled

| Threat                | Control                                                              |
| --------------------- | -------------------------------------------------------------------- |
| SQL injection         | Prisma query builders; `$queryRawUnsafe` banned by an ESLint rule    |
| XSS                   | React escaping; CSP; no `dangerouslySetInnerHTML`                    |
| CSRF                  | Double-submit token, constant-time compare                           |
| IDOR                  | Tenant client + resource-level authorization; 404 on cross-tenant    |
| Broken access control | Every endpoint calls `authorize()`; visibility ladders for lists     |
| Session fixation      | Token rotated on login                                               |
| Brute force           | Per-account lockout with backoff + per-endpoint rate limit           |
| User enumeration      | Identical response and timing for every login failure                |
| Malicious upload      | Type allowlist, filename sanitising, forced attachment, scanner hook |
| Privilege escalation  | Role grants require `user:manage_roles`; audited                     |
| Tenant leakage        | See `multi-tenancy.md`; 111 tests                                    |
| Formula injection     | CSV values neutralised                                               |

## Not yet implemented

Stated plainly rather than implied (§39: technical controls are not compliance):

- MFA — schema and policy exist; enrolment and challenge flows do not.
- SSO/SAML/OIDC — `UserIdentity` and the integration model exist; no provider.
- PostgreSQL row-level security as defence-in-depth.
- Malware scanning — interface only.
- Field-level encryption for the most sensitive columns.
- Automated dependency and secret scanning is wired into CI but has not been run
  against a real advisory database in this environment.
