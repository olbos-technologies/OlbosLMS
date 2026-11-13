# Database

PostgreSQL 16, Prisma 6. 76 tables.

## Conventions

- UUID primary keys everywhere. Sequential ids leak volume and invite
  enumeration; both matter for a compliance product.
- `organizationId` first in every index on a tenant-owned table, so tenant-scoped
  reads stay index-covered.
- `snake_case` table names via `@@map`; camelCase columns, which Prisma quotes.
- Money in integer minor units, never floats.
- Soft delete (`deletedAt`) where history matters; hard delete where it does not.

## Shape

```
Organization ──┬── User ── UserRole ── Role
               ├── Department / Location / JobRole
               ├── Employee ──┬── TrainingAssignment
               │              ├── TrainingRecord ── Certificate ── Credential
               │              ├── ComplianceState
               │              └── PracticalAssessment
               ├── Course ── CourseVersion ──┬── CourseModule ── Lesson
               │                             ├── SafetyCourseProfile
               │                             └── Quiz ── QuizQuestion ── Question
               ├── TrainingRequirement
               ├── Incident ── CorrectiveAction
               ├── JhaJsa ── JhaTask ── JhaHazard
               ├── Subscription ── Plan ── PlanEntitlement
               └── AuditLog (append-only)
```

## Decisions worth explaining

**Course versioning.** `Course` is the catalogue identity; `CourseVersion` holds
content. Publishing creates a version. Training records reference the version
they were taken against **and snapshot its title and number as values**. Editing a
course in 2027 must not change what a 2026 record says.

**`ComplianceState` is denormalised on purpose.** One row per (employee ×
requirement). The matrix and every dashboard read it directly. The worker keeps
it true.

**Append-only audit, enforced by the database.** `audit_logs` and `grade_audits`
carry `BEFORE UPDATE OR DELETE` triggers that raise. Not a convention — a bug or
a compromised application account cannot rewrite compliance history.

**Record supersession, not mutation.** Correcting a training record writes a new
row and points the old one at it via `supersededById`. Voiding sets `voidedAt`
and a reason. Nothing is deleted, so an audit can reconstruct what was believed
and when.

**Restrict where history depends on it.** `TrainingRecord → Course` is
`onDelete: Restrict`: a course with completions cannot be deleted out from under
its records. This is why tenant deletion needs an ordered delete rather than one
cascade — see `multi-tenancy.md`.

## Migrations

```
20260902043804_init                    the schema
20260902044500_integrity_guardrails    triggers, partial indexes, trigram search
```

The second is hand-written because Prisma's schema language cannot express it:

- A partial unique index on `users(emailNormalized) WHERE organizationId IS NULL`,
  because platform staff have a null tenant and Postgres treats every NULL as
  distinct — without it, two platform accounts could share an email.
- The append-only triggers, left at their default (ORIGIN) enable state so a
  privileged maintenance role can bypass them for lawful erasure while the
  application role cannot.
- `pg_trgm` GIN indexes backing name and title search.

```bash
pnpm db:migrate           # create and apply in development
pnpm db:migrate:deploy    # apply in CI and production
pnpm db:seed              # demo data; safe to re-run
```

## Indexing

Every tenant-owned table has `@@index([organizationId, ...])` led by the tenant
column. Hot paths are additionally indexed:

```
compliance_states   (organizationId, status) · (organizationId, expiresAt)
training_records    (organizationId, employeeId, completedAt) · (organizationId, expiresAt)
certificates        (organizationId, status, expiresAt)
employees           (organizationId, departmentId | locationId | jobRoleId | supervisorId)
audit_logs          (organizationId, occurredAt) · (organizationId, entityType, entityId)
```

`employees(organizationId, requirementsStaleAt)` is what makes the recalculation
job's work-list query cheap.

## Seed

Two tenants that exercise the whole product:

- **Acme Manufacturing** (Professional plan) — 10 employees, 10 safety courses,
  8 requirements, 30 records and certificates, a practical assessment, sessions,
  an incident with a corrective action, a JHA, and a compliance position of
  **67.5%** spanning current, expiring, expired, missing and pending.
- **Northgate Community College** (Starter) — an academic course with a weighted
  gradebook, assignments, submissions and grades.

Deliberately not uniform: a demo where everyone is compliant shows none of the
software that matters.

All demo accounts use `olbos-demo-passphrase`. Re-running the seed purges and
rebuilds only those two tenants.
