# Safety training

## The representation rule (§10)

This is a product constraint before it is a feature. OLBOS must never state or
imply an authorisation it does not hold — that it is OSHA, that a course is
OSHA-approved, that an instructor is OSHA-authorized — unless the authorisation
genuinely exists and is recorded.

It is enforced in code, not in a style guide.

### Training types

Every course version declares what it is:

| Type                        | Means                                                                 | Evidence required |
| --------------------------- | --------------------------------------------------------------------- | ----------------- |
| `ORGANIZATION_TRAINING`     | The organization's own training                                       | No                |
| `COMPANY_POLICY_TRAINING`   | Instruction on the organization's own procedures                      | No                |
| `SAFETY_AWARENESS_TRAINING` | Hazard awareness delivered by the organization                        | No                |
| `REGULATORY_TRAINING`       | Delivered in connection with a regulation the organization identified | No                |
| `THIRD_PARTY_TRAINING`      | Delivered by an external provider                                     | **Yes**           |
| `OSHA_OUTREACH_TRAINING`    | An OSHA Outreach course by an authorized trainer                      | **Yes**           |
| `CERTIFICATION`             | Issued under a named certifying body's scheme                         | **Yes**           |
| `CREDENTIAL`                | Issued by a named issuer                                              | **Yes**           |

Types requiring evidence cannot be published without a provider name and an
authorization identifier, and an expired authorization blocks publication.

### Two gates

**On free text.** Course titles and descriptions are scanned for claims that
cannot be true — "OSHA-approved", "OSHA certified", "federally approved",
"guarantees compliance". OSHA does not approve or certify courses; only an
individual trainer can be OSHA-authorized. Rejected at creation with an
explanation.

**On publication.** `checkRepresentation()` runs again with the evidence, and
refuses:

```
422 This course cannot be published as declared.
  - OSHA Outreach Training requires the name of the authorised provider, trainer or certifying body.
  - OSHA Outreach Training requires the provider's authorization identifier.
```

Supply them, and it publishes with the correct disclaimer:

> OSHA Outreach Training Program course. Department of Labor course completion
> cards are issued by the authorized trainer's OSHA Training Institute Education
> Center, not by OLBOS. This record is not a Department of Labor card.

### Disclaimers travel with the record

The disclaimer is stored on the course version, copied onto the certificate at
issue, and shown on the public verification page. An auditor reading a
certificate in 2029 sees the same representation the learner saw in 2026, even if
the course has since been edited.

Awareness training says so plainly:

> This is safety awareness training delivered by the issuing organization. It is
> not an OSHA course, is not OSHA-approved, and does not by itself satisfy any
> regulatory training requirement.

Regulatory citations are supported (`29 CFR 1910.147` etc.) but stored as _the
organization's own references_, never as a claim that the course satisfies them.

## Safety course metadata (§9)

`SafetyCourseProfile` hangs off the course **version**, so changing a renewal
interval or a citation is itself versioned: safety category, industry, hazard
categories, target audience, regulatory references, company policy references,
instructor requirements, practical requirements, disclaimer, revision.

## Practical assessments (§16)

A template lists criteria; each is PASS / FAIL / N/A. Scoring rules:

- N/A leaves the denominator entirely — it neither helps nor hurts.
- A criterion marked `isCritical` fails the whole assessment when it fails,
  however high the weighted score. Verifying zero energy is not something you can
  average away.
- A partially completed form cannot pass.
- Both signatures are required before it counts as evidence.

**The pass/fail decision is computed server-side from the criteria**, never taken
from the client. A UI that mis-scored a pass would otherwise create a training
record for someone who failed a critical step.

## Incidents → training (§22)

```
Incident → investigation → root cause → corrective action → training → completion
```

OLBOS records; it does not decide. `rootCause` is a field an authorised EHS user
fills in, and remedial training is assigned only when a person names the courses.
No automatic legal or regulatory determination is made anywhere.

## Safety Command Center (§19)

KPIs over `compliance_states`: overall compliance, employees missing training,
items expiring, expired certifications, completed this month, plus open incidents
and corrective actions. Below them, three worklists — expiring, expired, missing —
because the executive number and the operator's queue must come from the same
data or one of them is wrong.

The page ends with the sentence that keeps it honest:

> These figures describe training this organization recorded in OLBOS. They are
> not a determination of compliance with any law or regulation.
