# Training matrix

The grid of employees against training requirements (§12). Commercially, the
most important screen in the product.

## Statuses

| Status           | Means                                                  | Counts as compliant |
| ---------------- | ------------------------------------------------------ | ------------------- |
| `CURRENT`        | Completed and valid                                    | Yes                 |
| `EXPIRING_SOON`  | Valid, inside the organization's warning window        | Yes                 |
| `EXPIRED`        | Was completed; past its renewal date                   | No                  |
| `MISSING`        | Required, not completed, no open assignment or overdue | No                  |
| `IN_PROGRESS`    | Started, not finished                                  | No                  |
| `PENDING`        | Assigned, not yet due                                  | No                  |
| `NOT_APPLICABLE` | The requirement does not apply to this person          | Excluded            |

Two decisions in that table are worth defending.

**Expiring counts as compliant.** The training is still valid. Counting it as a
failure would make a dashboard that is 100% only in the moment after everyone
renews, which trains people to ignore it.

**N/A leaves the denominator.** Waiving a requirement, or having one that does not
apply, must not make an organization look _less_ compliant than one that never
had the requirement at all.

`compliancePercent = compliant / applicable`, where applicable excludes N/A.

## A compliance cell exists only where the requirement applies

This is the engine's contract. `syncEmployeeRequirements` creates a
`ComplianceState` row for each applicable requirement and deletes rows for
requirements that stop applying. A missing cell renders as N/A.

A seed that wrote `NOT_APPLICABLE` rows directly broke this: the sweep, which
treats every stored cell as applicable, reported 39 spurious status changes on
freshly seeded data. The fix was to make the seed obey the contract. The
invariant to hold onto: **a sweep over unchanged data must report zero status
changes.**

## Why it is materialised

`ComplianceState` is denormalised — one row per (employee × requirement) — so the
matrix for 5,000 employees against 20 courses is one indexed query rather than
100,000 recomputations. The sweep keeps it true as time passes.

## Filtering

Employee, department, location, supervisor, job role, course, status, expiry
window, and free-text search. Applied _after_ the caller's visibility scope, so a
filter can narrow what someone sees but never widen it.

One subtlety: "expiring within 30 days" excludes items that already expired.
They belong in the Expired view, and mixing them makes the number meaningless.

## Reading it

Every cell carries a text label and a glyph, not only a colour:

```
✓ Current   ! Expiring   × Expired   — Missing   ◐ In progress   ○ Pending   · N/A
```

A safety manager who is colour blind, or who printed the grid in greyscale for a
meeting, must still be able to read it. The employee column is sticky, because
the grid is wider than any screen once an organization has a dozen courses.

## Export

`GET /api/v1/compliance/matrix.csv` — same filters, same scope, audited as
`EXPORT_CREATED`. Values are neutralised against spreadsheet formula injection.
