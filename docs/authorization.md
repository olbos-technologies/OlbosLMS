# Authorization

## The rule

Nothing in the codebase branches on a role name. Code asks whether a permission
is held:

```ts
request.authorize('training_record:create', {
  departmentId: employee.departmentId,
  subjectEmployeeId: employee.id,
});
```

That is what lets a customer build a custom role that works exactly like a
built-in one, and what stops "is this user an admin?" from spreading through the
codebase as a hundred subtly different questions.

## Permissions

`resource:action`, defined once in `packages/permissions/src/permissions.ts`
(~130 of them, grouped by domain). Three shapes:

| Shape        | Example                     | Meaning                                |
| ------------ | --------------------------- | -------------------------------------- |
| Organization | `training_record:read`      | Every record in the tenant             |
| Team         | `training_record:read_team` | Records for people the user supervises |
| Self         | `training_record:read_own`  | The user's own records                 |

A broader permission satisfies a narrower one through an explicit implication
map, so a call site checks what it means rather than enumerating alternatives.
`certificate:issue` implies `certificate:read`; `training_record:read` implies
both team and own.

## Roles

Nine built-in templates (§4–§5), seeded per tenant as editable rows. Separation
is deliberate and tested:

| Role               | Holds                                                        | Does not hold                              |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| Organization Owner | Everything in the tenant, including billing                  | Anything platform-level                    |
| Org Administrator  | Everything except `billing:manage`                           | Platform                                   |
| HR Administrator   | Employees, structure, records, compliance reporting          | Incident investigation, course publishing  |
| EHS Administrator  | Safety, matrix, incidents, JHA, certificate revocation       | User creation, billing, security settings  |
| Instructor         | Courses, assessments, grading, sessions                      | Employee creation, incidents, revocation   |
| Safety Trainer     | Deliver training, attendance, practicals, issue certificates | _Revoke_ certificates, manage requirements |
| Teaching Assistant | Grade, moderate discussions                                  | Publish courses, override grades           |
| Supervisor         | Their team's compliance; assign training                     | Create employees, record completions       |
| Learner            | Their own learning, records and certificates                 | Anyone else's anything                     |

The trainer/EHS split is the one worth noticing: a trainer can _issue_ a
certificate but not _revoke_ one. Issuing is an outcome of doing the job;
revoking is an administrative act with audit weight.

## Scopes

A role grant carries a scope: `ORGANIZATION`, `DEPARTMENT`, `LOCATION` or
`COURSE`. A department-scoped HR administrator manages their department and gets
`out-of-scope` for anything else.

Supervisor scope is resolved recursively through the employee tree, because a
plant manager supervises through their line supervisors and a one-level check
would show them an incomplete team.

## Lists: visibility ladders

Single-resource endpoints check a permission against that resource. List
endpoints cannot — there is no resource yet. They resolve a ladder:

```ts
const { permission, filter } = resolveVisibility(ctx, VISIBILITY_LADDERS.trainingRecords);
// 'training_record:read'      -> filter.unrestricted
// 'training_record:read_team' -> filter.teamOnly
// 'training_record:read_own'  -> filter.selfOnly
```

The filter becomes a database `where`, so scope is applied in the query rather
than by fetching everything and trimming. The resolved permission is returned in
the response `meta.scope`, which is how the UI can say "your team" instead of
leaving a supervisor wondering whether they are seeing everyone.

## Decisions are explainable

`authorize()` returns a decision, not a boolean:

```ts
{ allowed: false, reason: 'not-on-team',
  message: 'Permission training_record:read_team is held but does not reach this resource' }
```

Reasons: `missing-permission`, `out-of-scope`, `not-self`, `not-on-team`,
`cross-tenant`, `no-tenant-context`. Debugging "why can't this user see that?"
is reading a log line rather than reconstructing the logic.

## Navigation is authorization

The sidebar is not a hand-maintained list. `buildNavigation(ctx, entitlements)`
filters the tree in `packages/permissions/src/navigation.ts` using the same
`authorize()` the API enforces, and the web renders whatever
`/api/v1/me/navigation` returns. The menu and the rules cannot drift apart
because they are the same code.

Verified in a browser: an EHS administrator sees 8 links across 10 sections; a
learner signed into the same organization sees 3.

## Entitlements are separate

Permission asks "may this person do it"; entitlement asks "does this plan include
it". Both are checked, and they fail differently — 403 versus 402 — because
"ask your administrator for access" and "your plan does not include this" are
different problems with different fixes.

## Testing

50 unit tests in `packages/permissions`, covering every role's grants and
denials, scope enforcement, implication, ladders and navigation filtering. Plus
the API-level tests, where authorization failures are asserted as 403 and
cross-tenant attempts as 404.
