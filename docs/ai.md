# AI

## The rule

AI may draft, summarise and explain. It may not decide.

Specifically, and non-negotiably (§30), it must never on its own determine legal
or regulatory compliance, issue a definitive regulatory interpretation, declare
an organization compliant, stand in for a qualified safety professional, or
establish a mandatory training requirement.

## Two mechanisms

A prompt is guidance. The output check is the control. Both exist because the
first is not sufficient.

**System prompts** (`packages/ai/src/guardrails.ts`) state the rules to the model:
never determine compliance; OSHA does not approve or certify courses; never
establish a mandatory requirement; you are not a substitute for a qualified
professional; ground answers in supplied material and say when you go beyond it;
say when you do not know; everything you produce is a draft.

**Output review** inspects what came back and either blocks or annotates:

| Claim shape                                 | Verdict    |
| ------------------------------------------- | ---------- |
| "your organization is compliant"            | `BLOCK`    |
| "OSHA-approved / OSHA certified"            | `BLOCK`    |
| "this training meets the OSHA requirements" | `BLOCK`    |
| "you are legally required to…"              | `BLOCK`    |
| "no further safety review is needed"        | `BLOCK`    |
| "I recommend you bypass the guard"          | `BLOCK`    |
| Cites `29 CFR 1910.147`                     | `ANNOTATE` |
| Uses "must" / "shall"                       | `ANNOTATE` |

A blocked response is **replaced**, not trimmed:

> I cannot answer that here. Determining regulatory compliance, or confirming
> that training satisfies a legal requirement, needs a qualified person at your
> organization — please contact your EHS or compliance team.

Blocks are logged so the prompts can be improved.

## Four gates before a model is called

```
entitlement  → plan includes the feature      (402)
permission   → caller holds ai:*              (403)
usage        → monthly allowance remains      (402)
guardrails   → feature system prompt applied
```

## Classification

Every AI response is classified `AI_RECOMMENDATION`. Only a human action turns it
into a `HUMAN_DECISION`, and only an authorised administrator turns it into an
`ORGANIZATION_POLICY` or an `OFFICIAL_REQUIREMENT`. The UI shows the
classification and the feature's notice with every answer.

## Human review

Anything that would reach a learner — course drafts, questions, scenarios — is
written as an `AiGeneration` with status `PENDING_REVIEW`. Nothing is inserted
into a course until someone with `ai:review` approves it, and both the request
and the decision are audited.

## Grounding

The tutor is given the learner's own course material through the tenant-scoped
client, so it cannot be grounded in another organization's content. Answers cite
the lessons they used.

## Providers

`AiProvider` is an interface. `AnthropicProvider` calls the Messages API;
`NullAiProvider` is the default and **throws** rather than returning a plausible
canned answer — a training platform that invents safety guidance is worse than
one with the feature switched off.

With `AI_DRIVER=null` (the default), AI endpoints return 503 and the AI
navigation section is empty.

## Not implemented

The AI _endpoints_ exist and are guarded. What is not built: applying an approved
generation into a course, the scenario player, the study assistant, and the
analytics assistant's query layer over authorised data.
