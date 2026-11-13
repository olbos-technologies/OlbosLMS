# API

Base: `/api/v1`. Versioned in the path so a breaking change ships alongside its
predecessor rather than instead of it.

## Conventions

Success:

```json
{ "data": { ... }, "meta": { "page": 1, "total": 42, "scope": "compliance:read" } }
```

Failure:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to do that.",
    "details": [],
    "requestId": "0f2c..."
  }
}
```

`message` is written for a person to read. `requestId` appears in the response
header and every log line for that request.

| Code                   | Status | Means                                   |
| ---------------------- | ------ | --------------------------------------- |
| `VALIDATION_FAILED`    | 422    | Field-level problems in `details`       |
| `UNAUTHENTICATED`      | 401    | No session, or it expired               |
| `FORBIDDEN`            | 403    | Authenticated, not permitted            |
| `NOT_FOUND`            | 404    | Absent — or in another tenant           |
| `CONFLICT`             | 409    | Unique or relational constraint         |
| `ENTITLEMENT_REQUIRED` | 402    | The plan does not include the feature   |
| `USAGE_LIMIT_EXCEEDED` | 402    | A plan limit is reached                 |
| `RATE_LIMITED`         | 429    | Slow down                               |
| `INTERNAL_ERROR`       | 500    | Something went wrong; check `requestId` |

Pagination: `?page=1&pageSize=25&sort=lastName&order=asc`. `sort` is checked
against a per-endpoint allowlist.

Booleans: `?flag=true|false|1|0|yes|no`. Anything else is a 422 rather than a
guess.

## Authentication

Session cookie (`HttpOnly`) plus `x-csrf-token` on every mutating request, echoed
from the readable `olbos_csrf` cookie.

## Endpoints

### Auth

```
POST   /auth/login                  { email, password, organizationSlug? }
POST   /auth/logout
GET    /auth/session
POST   /auth/password/forgot        always answers the same, account or not
POST   /auth/password/reset         revokes every session
POST   /auth/password/change        keeps this session, revokes the others
GET    /auth/sessions               active devices
POST   /auth/sessions/revoke-others
```

### Me

```
GET    /me                          identity, roles, permissions, entitlements
GET    /me/navigation               the sidebar, built from the same checks
GET    /me/learning                 assignments, enrollments, personal summary
GET    /me/certificates
GET    /me/notifications
POST   /me/notifications/read
```

### Organization and people

```
GET    /organizations/current                 PATCH to update
GET    /organizations/current/settings        warning ladders, disclaimer
GET    /departments · /locations · /job-roles POST to create
GET    /employees                             scoped: org / team / self
GET    /employees/:id                         profile, compliance, records, risk
POST   /employees                             runs the requirement engine
PATCH  /employees/:id                         re-runs it when attributes change
GET    /users · /roles · /roles/catalogue
POST   /users/:id/roles
```

### Courses

```
GET    /courses · /courses/:id
POST   /courses                     representation checked on the title
POST   /courses/:id/publish         representation gate (§10)
GET    /courses/training-types      the rules, so the UI can explain them
```

### Training

```
GET    /training/requirements                 POST · PATCH /:id
POST   /training/requirements/evaluate/:id    recompute one employee now
GET    /training/assignments                  POST to assign
POST   /training/assignments/:id/waive
GET    /training/records
POST   /training/records                      completion -> record -> certificate
POST   /training/records/:id/void
GET    /training/sessions
POST   /training/sessions/:id/attendance
```

### Compliance

```
GET    /compliance/dashboard        rollups by department, location, role, course
GET    /compliance/matrix           the grid
GET    /compliance/matrix.csv       same filters, audited
GET    /compliance/expiring · /expired · /missing
```

### Safety

```
GET    /safety/dashboard            command centre KPIs
GET    /safety/practical-templates
POST   /safety/practical-assessments        server computes pass/fail
GET    /safety/incidents · POST
POST   /safety/corrective-actions/:id/assign-training
GET    /safety/observations · POST          anonymous reports store no reporter
GET    /safety/jha
```

### Certificates

```
GET    /certificates · /certificates/:id    integrity checked on every read
POST   /certificates/:id/revoke
GET    /verify/certificate/:publicId        public, unauthenticated
```

### Analytics, reports, billing, AI

```
GET    /analytics/training · /safety · /learning
GET    /reports                     available reports
GET    /reports/:key?format=csv     export, audited
GET    /audit                       append-only history
GET    /billing/plans · /subscription · /invoices
GET    /ai/status
POST   /ai/tutor                    grounded in the caller's course material
POST   /ai/generate                 always PENDING_REVIEW
POST   /ai/generations/:id/review
```

### Operations

```
GET    /healthz     liveness; touches no dependency
GET    /readyz      readiness; checks the database
```

## Certificate verification

The one public endpoint. Returns enough to confirm a credential and nothing more
about the person: no employee id, no organization id, no score.

```json
{
  "data": {
    "result": "VALID",
    "certificateNumber": "ACME-2026-000031",
    "learnerName": "John Smith",
    "courseTitle": "Forklift Safety",
    "trainingType": "SAFETY_AWARENESS_TRAINING",
    "expiresAt": "2029-09-01T09:47:36.201Z",
    "disclaimer": "This is safety awareness training ...",
    "verifiedAt": "2026-09-02T09:48:02.114Z",
    "message": "This certificate is valid."
  }
}
```

Results: `VALID`, `EXPIRED`, `REVOKED`, `SUPERSEDED`, `NOT_FOUND`, `TAMPERED`.

`TAMPERED` means the row failed its HMAC check — someone edited the database
directly. The response then carries no certificate content at all.

## Not yet implemented

Endpoints the specification describes that are not built: quiz attempts and
grading, assignment submissions, gradebook, discussions, calendar, file upload
and download, learning paths, scenario player, SCORM/LTI/xAPI, webhooks, the
platform administration surface. The domain engines for grading, quizzes and
completion exist and are tested; the HTTP surface over them does not. See
`roadmap.md`.
