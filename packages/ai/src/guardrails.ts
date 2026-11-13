/**
 * AI guardrails (§30).
 *
 * The product rule is simple and absolute: AI may draft, summarise and explain;
 * it may not decide. Specifically it must never, on its own:
 *   * determine legal or regulatory compliance,
 *   * issue a definitive regulatory interpretation,
 *   * declare an organization compliant with anything,
 *   * stand in for a qualified safety professional,
 *   * establish a mandatory training requirement.
 *
 * Two mechanisms enforce that here: the system prompts below tell the model
 * what it is and is not; `reviewOutput` inspects what came back and downgrades
 * or blocks anything that reads as a determination. Both matter — a prompt is
 * guidance, the output check is the control.
 */

export type AiFeature =
  | 'TUTOR'
  | 'COURSE_BUILDER'
  | 'QUESTION_GENERATOR'
  | 'SCENARIO_GENERATOR'
  | 'ANALYTICS_ASSISTANT'
  | 'STUDY_ASSISTANT';

/** How the product must label an AI output when it is shown to a person. */
export type OutputClassification =
  | 'AI_RECOMMENDATION'
  | 'HUMAN_DECISION'
  | 'OFFICIAL_REQUIREMENT'
  | 'ORGANIZATION_POLICY';

export interface FeatureGuardrails {
  readonly feature: AiFeature;
  /** Entitlement key gating the feature. */
  readonly entitlement: string;
  /** Permission the caller must hold. */
  readonly permission: string;
  /** Whether output must be reviewed by a human before it reaches learners. */
  readonly requiresHumanReview: boolean;
  readonly systemPrompt: string;
  /** Shown alongside every response from this feature. */
  readonly userFacingNotice: string;
}

const SHARED_RULES = `
You are an assistant inside OLBOS, a learning, training and safety compliance
platform. You operate under these non-negotiable rules:

1. You never determine whether an organization, a person, a course or a record
   is compliant with any law, regulation or standard. You may describe what a
   regulation says an organization should consider, and you must attribute it.
2. You never state or imply that a course, a trainer or an organization is
   OSHA-approved, OSHA-certified, OSHA-authorized, government-approved or
   accredited. OSHA does not approve or certify courses.
3. You never establish a mandatory training requirement. You may suggest topics
   an authorised administrator might choose to require.
4. You are not a substitute for a qualified safety professional, an attorney or
   a physician. When a question needs one, say so plainly.
5. You ground answers in the organization's own approved course material where
   it is supplied. When you go beyond it, say that you are doing so.
6. When you do not know, you say you do not know. You never invent a regulation,
   a citation, a statistic or a course.
7. Everything you produce is a draft or a suggestion for a human to accept,
   edit or reject.
`.trim();

export const GUARDRAILS: Readonly<Record<AiFeature, FeatureGuardrails>> = {
  TUTOR: {
    feature: 'TUTOR',
    entitlement: 'AI_TUTOR',
    permission: 'ai:tutor',
    requiresHumanReview: false,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS AI Tutor. A learner is asking about material in a course they
are enrolled in. Prefer the supplied course content over general knowledge, and
cite which lesson an answer came from. If the learner asks whether something is
"required" or "compliant", explain what their organization's course says and
direct them to their supervisor or EHS team for anything beyond that.`,
    userFacingNotice:
      'AI-generated explanation. Check it against your course material and ask your ' +
      'instructor or EHS team if anything is unclear.',
  },
  STUDY_ASSISTANT: {
    feature: 'STUDY_ASSISTANT',
    entitlement: 'AI_TUTOR',
    permission: 'ai:tutor',
    requiresHumanReview: false,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS Study Assistant. You produce study aids — summaries, flashcards
and practice questions — from the learner's own course material.`,
    userFacingNotice: 'AI-generated study aid, based on your course material.',
  },
  COURSE_BUILDER: {
    feature: 'COURSE_BUILDER',
    entitlement: 'AI_COURSE_BUILDER',
    permission: 'ai:course_builder',
    requiresHumanReview: true,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS AI Course Builder. You draft a course outline: modules,
lessons, learning objectives and knowledge checks. Every draft is reviewed by a
qualified human before publication. Where a topic has a regulatory dimension,
note that the organization's EHS or compliance team must confirm the content,
and do not assert what the regulation requires.`,
    userFacingNotice:
      'AI-generated draft. A qualified reviewer must check and approve this content ' +
      'before it is published to learners.',
  },
  QUESTION_GENERATOR: {
    feature: 'QUESTION_GENERATOR',
    entitlement: 'AI_QUESTION_GENERATOR',
    permission: 'ai:question_generator',
    requiresHumanReview: true,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS AI Question Generator. You draft assessment questions from
supplied material. Each question must have exactly one defensible correct answer
(unless multiple-select is requested), plausible distractors, and an explanation
grounded in the source material.`,
    userFacingNotice:
      'AI-generated draft questions. Review each question and its answer key before use.',
  },
  SCENARIO_GENERATOR: {
    feature: 'SCENARIO_GENERATOR',
    entitlement: 'AI_SCENARIO_GENERATOR',
    permission: 'ai:scenario_generator',
    requiresHumanReview: true,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS AI Safety Scenario Builder. You draft realistic workplace
scenarios for hazard identification and decision practice. Scenarios are
training exercises, not procedures: never present a scenario's "correct" action
as the organization's official procedure. A qualified safety professional must
review every scenario before it is published.`,
    userFacingNotice:
      'AI-generated training scenario. A qualified safety professional must review it ' +
      'before publication. It does not replace your site-specific procedures.',
  },
  ANALYTICS_ASSISTANT: {
    feature: 'ANALYTICS_ASSISTANT',
    entitlement: 'AI_ANALYTICS_ASSISTANT',
    permission: 'ai:analytics_assistant',
    requiresHumanReview: false,
    systemPrompt: `${SHARED_RULES}

You are the OLBOS AI Analytics Assistant. You answer questions about training
and compliance data that has already been filtered to what the asking user is
authorised to see. Answer only from the supplied data. If the data does not
contain the answer, say so — never estimate or extrapolate a compliance figure.
Describe what the numbers show; do not conclude that the organization is or is
not compliant.`,
    userFacingNotice:
      'AI-generated summary of your authorised data. Figures come from the report ' +
      'shown; verify before using them in a filing or an audit.',
  },
};

// ---------------------------------------------------------------------------
// Output review
// ---------------------------------------------------------------------------

export type ReviewVerdict = 'ALLOW' | 'ANNOTATE' | 'BLOCK';

export interface OutputReview {
  readonly verdict: ReviewVerdict;
  readonly classification: OutputClassification;
  readonly findings: string[];
  readonly notice: string;
  readonly requiresHumanReview: boolean;
}

interface Rule {
  readonly pattern: RegExp;
  readonly finding: string;
  readonly verdict: Extract<ReviewVerdict, 'BLOCK' | 'ANNOTATE'>;
}

/**
 * Claims that must never leave the system unqualified. BLOCK means the response
 * is withheld and regenerated or escalated; ANNOTATE means it is shown with an
 * explicit caveat attached.
 */
const OUTPUT_RULES: readonly Rule[] = [
  {
    pattern:
      /\b(you|your organization|the organization|this facility)\s+(are|is)\s+(now\s+)?(fully\s+)?compliant\b/i,
    finding: 'Asserted that an organization is compliant.',
    verdict: 'BLOCK',
  },
  {
    pattern: /\bosha[-\s]?(approved|certified|accredited|endorsed)\b/i,
    finding: 'Claimed an OSHA approval or certification that does not exist.',
    verdict: 'BLOCK',
  },
  {
    pattern:
      /\bthis (course|training|certificate) (satisfies|meets|fulfil?ls) (the )?(osha|regulatory|legal) requirements?\b/i,
    finding: 'Asserted that training satisfies a regulatory requirement.',
    verdict: 'BLOCK',
  },
  {
    pattern: /\b(you are|this is) (legally|lawfully) (required|obligated) to\b/i,
    finding: 'Issued a legal obligation as fact.',
    verdict: 'BLOCK',
  },
  {
    pattern:
      /\bno (further )?(safety )?(review|inspection|professional) (is )?(needed|required)\b/i,
    finding: 'Told the reader that professional review is unnecessary.',
    verdict: 'BLOCK',
  },
  {
    pattern: /\b(29\s*cfr|1910\.\d+|1926\.\d+|ansi\s+[a-z]?\d|nfpa\s+\d+)\b/i,
    finding: 'Cited a regulation or standard; a human must verify the citation.',
    verdict: 'ANNOTATE',
  },
  {
    pattern: /\b(must|shall|is required to)\b/i,
    finding: 'Used obligation language; presented as a recommendation.',
    verdict: 'ANNOTATE',
  },
  {
    pattern: /\bi (recommend|advise) (you )?(not )?to (ignore|skip|bypass)\b/i,
    finding: 'Advised bypassing a control.',
    verdict: 'BLOCK',
  },
];

/**
 * Inspects a model response before it reaches a user.
 *
 * This is a safety net over a prompt, not a content classifier: it catches the
 * specific claim shapes the product must never make. Anything it blocks is
 * logged so the prompts can be improved.
 */
export const reviewOutput = (text: string, feature: AiFeature): OutputReview => {
  const guardrails = GUARDRAILS[feature];
  const findings: string[] = [];
  let verdict: ReviewVerdict = 'ALLOW';

  for (const rule of OUTPUT_RULES) {
    if (!rule.pattern.test(text)) continue;
    findings.push(rule.finding);
    if (rule.verdict === 'BLOCK') verdict = 'BLOCK';
    else if (verdict !== 'BLOCK') verdict = 'ANNOTATE';
  }

  return {
    verdict,
    // AI output is always a recommendation. Only a human action can turn it
    // into a decision, and only an authorised administrator can turn it into
    // an organization policy or a requirement.
    classification: 'AI_RECOMMENDATION',
    findings,
    notice: guardrails.userFacingNotice,
    requiresHumanReview: guardrails.requiresHumanReview,
  };
};

export const BLOCKED_RESPONSE =
  'I cannot answer that here. Determining regulatory compliance, or confirming that ' +
  'training satisfies a legal requirement, needs a qualified person at your ' +
  'organization — please contact your EHS or compliance team.';

// ---------------------------------------------------------------------------
// Usage limits
// ---------------------------------------------------------------------------

export interface UsageWindow {
  readonly requestsThisMonth: number;
  readonly monthlyLimit: number | null;
}

export interface UsageDecision {
  readonly allowed: boolean;
  readonly remaining: number | null;
  readonly reason?: string;
}

export const checkUsage = (window: UsageWindow): UsageDecision => {
  if (window.monthlyLimit === null) return { allowed: true, remaining: null };
  const remaining = Math.max(0, window.monthlyLimit - window.requestsThisMonth);
  return remaining > 0
    ? { allowed: true, remaining }
    : {
        allowed: false,
        remaining: 0,
        reason: `Your plan includes ${window.monthlyLimit} AI requests per month, and this month's allowance is used.`,
      };
};
