# Roadmap and honest status

What is built, what is partly built, and what is not — so nobody has to read the
source to find out.

## Built and verified

| Area                  | State                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Multi-tenancy         | Tenant client with query rewriting; 111 integration tests                                                     |
| Authentication        | Argon2id, server-side sessions, lockout, reset, change, device list                                           |
| Authorization         | ~130 permissions, 9 roles, scopes, visibility ladders, explainable decisions                                  |
| Database              | 76 tables, 2 migrations, append-only audit triggers, seed                                                     |
| Expiration engine     | Renewal intervals, warning ladders, timezone-correct day boundaries                                           |
| Requirement engine    | 9 scope types, attribute-change re-evaluation, diffing                                                        |
| Compliance & matrix   | Materialised states, rollups, filters, CSV export                                                             |
| Certificates          | HMAC integrity, public verification, revocation, tamper detection                                             |
| Representation (§10)  | Enforced at course creation and publication                                                                   |
| Practical assessments | Criteria scoring, critical-criterion rule, signatures                                                         |
| Grading engines       | Weighted categories, drop-lowest, late penalties, letter scales                                               |
| Quiz auto-grading     | 8 question types, partial credit, manual-grading fallback                                                     |
| Billing               | Plans, entitlements, overrides, usage limits                                                                  |
| AI guardrails         | Prompts plus output review; human review for learner-facing content                                           |
| Notifications         | Content, preferences, cooldowns, digests, transports                                                          |
| Storage               | Local driver; S3 driver with hand-rolled SigV4                                                                |
| Worker                | Sweep, recalculation, notifications, cleanup, metering                                                        |
| Web                   | Login, command centre, safety centre, matrix, compliance, learning, catalogue, employees, public verification |

## Engines built, HTTP surface not

The domain logic is written and unit-tested; the endpoints and screens over it
are not:

- Quiz attempts and grading (`packages/core/src/quiz.ts`)
- Gradebook calculation (`packages/core/src/grading.ts`)
- Course completion gating (`packages/core/src/completion.ts`)
- At-risk scoring (`packages/core/src/risk.ts` — used in the employee profile only)

## Schema exists, application does not

Modelled in the database and reachable through the tenant client, with no
endpoint or screen: assignments and submissions, discussions, announcements,
calendar events, learning paths, question banks as a managed surface, safety
scenarios and attempts, credentials beyond certificates, integrations, API keys,
webhooks, invoices.

## College management

Olbos Campus academic foundation is implemented: programs, terms, catalog
courses, sections, permissions, API, and `/campus` screen. Validation and rollout
are described in [olbos-campus.md](olbos-campus.md). Admissions, student
registration, transcripts, GPA, and tuition remain future phases.

## Institution SaaS foundation

Operator-assisted institution provisioning, guided setup, a billing dashboard,
monthly hosted checkout, a billing portal, and signed provider-event
reconciliation are implemented. Payments default to disabled. See
[institution-saas.md](institution-saas.md) for configuration, tests, limitations,
and production release prerequisites. Public signup and invitation delivery are
not implemented, and production readiness has not been established.

## Not started

- Platform administration (organizations, plans, platform analytics, support access)
- SSO / SAML / OIDC / SCIM
- SCORM, LTI, xAPI
- File upload and download endpoints (storage drivers exist; routes do not)
- Report generation as background jobs with stored artefacts (reports are synchronous)
- PDF certificate rendering (data and verification exist; no PDF)
- QR check-in for sessions (`checkInCode` is generated; no scan flow)
- Email delivery (transport interface exists; the worker logs what it would send)
- Mobile-specific flows: bottom sheets, QR scanning
- Committed Playwright suite (the app was driven with Playwright during the build,
  but that script is not in the repository)
- Load, performance, accessibility (axe) and backup/restore testing
- PostgreSQL row-level security as defence-in-depth
- Malware scanning implementation

## Known dependency advisories

`pnpm audit --prod --audit-level high` is clean and is the blocking CI gate:
nothing a deployed process loads carries a high or critical advisory.
`deepmerge-ts` reached production through `prisma > @prisma/config` and is
pinned forward via a `pnpm.overrides` entry.

Advisories remaining in **test and build tooling** are reported by CI as a
warning rather than a failure, because none is reachable by a deployed process:

| Package   | Advisory                                                       | Clearing it needs                |
| --------- | -------------------------------------------------------------- | -------------------------------- |
| `vitest`  | RCE / arbitrary file read when the API or UI server listens    | Major upgrade 2.1.8 → ≥3.2.6     |
| `vite`    | `server.fs.deny` bypass on Windows alternate paths             | Follows the vitest upgrade       |
| `postcss` | Arbitrary file read via attacker-controlled `sourceMappingURL` | Bump once Tailwind's tree allows |

The vitest upgrade is deliberately not bundled with the initial build: 3.x
replaces `vitest.workspace.ts` with in-config `projects`, and that migration
should land as a change whose test run can be judged on its own rather than
inside a 196-file diff. Both vitest advisories require the test server to be
listening while the developer browses a hostile page; CI runs the suite
headless and does not start it.

## Phase alignment

| Phase               | Status                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| 0 · Audit           | Complete — `repository-audit.md`                                              |
| 1 · Foundation      | Complete                                                                      |
| 2 · LMS core        | Partial — schema and engines complete; assessment/gradebook APIs not built    |
| 3 · Safety training | Complete                                                                      |
| 4 · Certification   | Complete except PDF rendering                                                 |
| 5 · Advanced safety | Partial — practicals, incidents, JHA, observations built; scenario player not |
| 6 · AI              | Guardrails and endpoints built; applying approved output is not               |
| 7 · Billing         | Entitlements and provider integration implemented; staging validation pending |
| 8 · Enterprise      | Not started                                                                   |
| 9 · Hardening       | Partial — security review done; load, accessibility and DR testing not        |

## What to do next

1. **File upload/download endpoints.** Several features are blocked on evidence
   attachments; the drivers are ready.
2. **Assessment surface.** The quiz and gradebook engines are tested and unused —
   the highest ratio of value to remaining work.
3. **Email delivery.** Notifications are generated and dispatched but only
   logged; without a transport the expiry-warning ladder does nothing for users.
4. **Committed browser tests.** The critical workflow is covered at the API
   layer; the UI is not covered by anything in the repository.
5. **Row-level security.** Application-layer isolation is proven, but a second
   layer in the database would make a direct-connection mistake survivable.
