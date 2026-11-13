# Olbos Campus — college management

The college module shares Olbos LMS authentication, organizations, permissions,
auditing, and teaching content. An organization is the institution boundary.

## Phase 1: academic foundation

The `/campus` screen manages programs, academic terms, credit-bearing catalog
courses, and course sections. Existing departments remain organization-wide;
department assignment to programs is not part of this first phase.

Each section belongs to a catalog course and term, has a capacity, and can link
an existing academic LMS course. The optional link establishes content only:
it does not create a classroom roster or enrollment. Multiple sections may link
the same LMS course; section-specific gradebooks and teaching spaces are future
work. The initial catalog supports whole-number credits (including zero-credit
courses); fractional credits and cross-listed programs are not implemented.

The screen provides create and paginated list flows, with real empty, loading,
error, and permission states. Editing, archiving, and deletion are not exposed
in this phase. There are no demo totals or sample student records.

## API and access

`GET` and `POST` under `/api/v1/campus/{programs,terms,courses,sections}` list and
create records. GET uses standard `page` and `pageSize` parameters. POST bodies:

| Resource | Fields                                                         |
| -------- | -------------------------------------------------------------- |
| programs | code, name, award, requiredCredits                             |
| terms    | code, name, startsOn, endsOn (YYYY-MM-DD)                      |
| courses  | code, title, programId, credits                                |
| sections | code, academicCourseId, termId, capacity, optional lmsCourseId |

Awards: CERTIFICATE, ASSOCIATE, BACHELOR, MASTER, DOCTORATE. Codes normalize to
uppercase. End dates cannot precede start dates. Credits and capacities are
validated at the API and database boundary.

`campus:read` controls listing and navigation; `campus:manage` controls creation, which also requires the `CAMPUS_MODULE`
subscription entitlement. Existing academic structure remains readable with
`campus:read` after cancellation or trial expiry.
Organization owners and administrators receive these through the existing
permission catalog. Custom roles can grant either permission. Linking LMS
content also requires `course:read`. The migration adds both permissions to existing built-in administrator roles
without removing their current grants; custom roles are left unchanged.

Every request uses the tenant-scoped database client. Composite foreign keys
also enforce institution ownership of referenced programs, courses, terms,
and LMS content. Cross-institution references return 404. Creation emits audit
events. There are no changes to existing grades or training history.

## Deployment and validation

Apply the additive Prisma migration before deploying the API/web changes,
regenerate the Prisma client, and refresh signed-in navigation.
Back up and rehearse migration on staging as part of the normal release process.
No production migration or deployment is performed by this change.

Run `pnpm test:all`, `pnpm typecheck`, `pnpm lint`, and a web production build.
The Campus integration suite exercises real PostgreSQL tenant isolation,
foreign-key protection, authorization, validation, audit events, pagination,
and linking to academic LMS content.

## Following phases

1. Admissions, applicant documents, central approval, and student identities.
2. Student registration, section rosters, prerequisites, add/drop, waitlists,
   capacity enforcement under concurrency, and LMS enrollment synchronization.
3. Faculty assignments, final-grade submission and approval, institution-defined
   GPA rules, append-or-supersede academic records, and transcript workflows.
4. Tuition charges, scholarships, payments, refunds, and student account balances
   separate from Olbos SaaS subscription billing.
5. Advising, graduation audits, reporting, and institution-specific policies.

These are planned, not delivered features. There is no accreditation, financial
aid processing, or official transcript issuance in this phase.
