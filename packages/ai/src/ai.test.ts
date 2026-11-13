import { describe, expect, it } from 'vitest';
import { BLOCKED_RESPONSE, checkUsage, GUARDRAILS, reviewOutput } from './guardrails.js';
import {
  AiClient,
  AiUnavailableError,
  AnthropicProvider,
  NullAiProvider,
  type AiProvider,
  type AiRequest,
  type ProviderResponse,
} from './provider.js';

const stubProvider = (text: string): AiProvider => ({
  name: 'stub',
  available: true,
  async complete(): Promise<ProviderResponse> {
    return { text, usage: { inputTokens: 10, outputTokens: 20, model: 'stub-1' } };
  },
});

const request = (overrides: Partial<AiRequest> = {}): AiRequest => ({
  feature: 'TUTOR',
  messages: [{ role: 'user', content: 'What is lockout/tagout?' }],
  ...overrides,
});

describe('guardrail definitions', () => {
  it('covers every AI feature in the product', () => {
    expect(Object.keys(GUARDRAILS).sort()).toEqual([
      'ANALYTICS_ASSISTANT',
      'COURSE_BUILDER',
      'QUESTION_GENERATOR',
      'SCENARIO_GENERATOR',
      'STUDY_ASSISTANT',
      'TUTOR',
    ]);
  });

  it('gates each feature behind an entitlement and a permission', () => {
    for (const guardrail of Object.values(GUARDRAILS)) {
      expect(guardrail.entitlement.length).toBeGreaterThan(0);
      expect(guardrail.permission.startsWith('ai:')).toBe(true);
      expect(guardrail.userFacingNotice.length).toBeGreaterThan(20);
    }
  });

  it('requires human review for everything that reaches learners', () => {
    expect(GUARDRAILS.COURSE_BUILDER.requiresHumanReview).toBe(true);
    expect(GUARDRAILS.QUESTION_GENERATOR.requiresHumanReview).toBe(true);
    expect(GUARDRAILS.SCENARIO_GENERATOR.requiresHumanReview).toBe(true);
  });

  it('states the non-negotiable rules in every system prompt', () => {
    for (const guardrail of Object.values(GUARDRAILS)) {
      expect(guardrail.systemPrompt).toMatch(/never determine whether an organization/i);
      expect(guardrail.systemPrompt).toMatch(/OSHA does not approve or certify courses/i);
      expect(guardrail.systemPrompt).toMatch(/never establish a mandatory training requirement/i);
      expect(guardrail.systemPrompt).toMatch(
        /not a substitute for a qualified safety professional/i,
      );
    }
  });
});

describe('output review', () => {
  it('allows an ordinary explanation', () => {
    const review = reviewOutput(
      'Lockout/tagout is the practice of isolating energy sources before maintenance.',
      'TUTOR',
    );
    expect(review.verdict).toBe('ALLOW');
    expect(review.findings).toEqual([]);
  });

  it('always classifies output as a recommendation, never a decision', () => {
    expect(reviewOutput('Anything at all.', 'TUTOR').classification).toBe('AI_RECOMMENDATION');
  });

  it('blocks a compliance determination', () => {
    const review = reviewOutput(
      'Your organization is compliant with the standard.',
      'ANALYTICS_ASSISTANT',
    );
    expect(review.verdict).toBe('BLOCK');
    expect(review.findings[0]).toMatch(/Asserted that an organization is compliant/);
  });

  it('blocks an OSHA approval claim', () => {
    expect(reviewOutput('This is an OSHA-approved course.', 'COURSE_BUILDER').verdict).toBe(
      'BLOCK',
    );
    expect(reviewOutput('We are OSHA certified.', 'TUTOR').verdict).toBe('BLOCK');
  });

  it('blocks a claim that training satisfies a regulatory requirement', () => {
    expect(
      reviewOutput('This training meets the OSHA requirements for your site.', 'COURSE_BUILDER')
        .verdict,
    ).toBe('BLOCK');
  });

  it('blocks a statement of legal obligation', () => {
    expect(reviewOutput('You are legally required to retrain every year.', 'TUTOR').verdict).toBe(
      'BLOCK',
    );
  });

  it('blocks advice that professional review is unnecessary', () => {
    expect(
      reviewOutput('No further safety review is needed for this task.', 'SCENARIO_GENERATOR')
        .verdict,
    ).toBe('BLOCK');
  });

  it('blocks advice to bypass a control', () => {
    expect(reviewOutput('I recommend you to bypass the guard.', 'TUTOR').verdict).toBe('BLOCK');
  });

  it('annotates a regulatory citation so a human verifies it', () => {
    const review = reviewOutput(
      'Energy control procedures are described in 29 CFR 1910.147.',
      'COURSE_BUILDER',
    );
    expect(review.verdict).toBe('ANNOTATE');
    expect(review.findings[0]).toMatch(/Cited a regulation/);
  });

  it('annotates obligation language rather than blocking it', () => {
    const review = reviewOutput('Workers must wear eye protection in this area.', 'COURSE_BUILDER');
    expect(review.verdict).toBe('ANNOTATE');
  });

  it('lets a block outrank an annotation', () => {
    const review = reviewOutput(
      'Per 29 CFR 1910.147, your organization is compliant.',
      'ANALYTICS_ASSISTANT',
    );
    expect(review.verdict).toBe('BLOCK');
    expect(review.findings.length).toBeGreaterThan(1);
  });

  it('carries the feature notice through to the caller', () => {
    expect(reviewOutput('Fine.', 'SCENARIO_GENERATOR').notice).toMatch(
      /qualified safety professional must review/,
    );
    expect(reviewOutput('Fine.', 'SCENARIO_GENERATOR').requiresHumanReview).toBe(true);
  });
});

describe('AiClient', () => {
  it('returns allowed output with usage and the notice', async () => {
    const client = new AiClient(stubProvider('Isolate the energy source first.'));
    const result = await client.run(request());
    expect(result.blocked).toBe(false);
    expect(result.text).toBe('Isolate the energy source first.');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20, model: 'stub-1' });
    expect(result.review.notice).toMatch(/AI-generated explanation/);
  });

  it('replaces blocked output with a referral, never the original text', async () => {
    const client = new AiClient(stubProvider('Your organization is compliant with 1910.147.'));
    const result = await client.run(request({ feature: 'ANALYTICS_ASSISTANT' }));
    expect(result.blocked).toBe(true);
    expect(result.text).toBe(BLOCKED_RESPONSE);
    expect(result.text).not.toMatch(/compliant/);
    expect(result.text).toMatch(/EHS or compliance team/);
  });

  it('reports citations for grounding documents the answer used', async () => {
    const client = new AiClient(stubProvider('See document lesson-3 for the procedure.'));
    const result = await client.run(
      request({
        grounding: [
          { id: 'lesson-3', title: 'Applying locks', content: '...', source: 'LOTO / Module 2' },
          { id: 'lesson-9', title: 'Unrelated', content: '...', source: 'Other' },
        ],
      }),
    );
    expect(result.citations).toEqual([
      { id: 'lesson-3', title: 'Applying locks', source: 'LOTO / Module 2' },
    ]);
  });

  it('refuses to answer when no provider is configured', async () => {
    const client = new AiClient(new NullAiProvider());
    expect(client.available).toBe(false);
    await expect(client.run(request())).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe('AnthropicProvider', () => {
  it('sends the guardrail system prompt and grounding, and parses usage', async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;

    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-sonnet-5',
      fetchImpl: (async (url: string, init: RequestInit) => {
        captured = { url: String(url), body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Grounded answer.' }],
            usage: { input_tokens: 120, output_tokens: 45 },
            model: 'claude-sonnet-5',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch,
    });

    const client = new AiClient(provider);
    const result = await client.run(
      request({
        grounding: [
          { id: 'lesson-1', title: 'Energy sources', content: 'Body text', source: 'LOTO' },
        ],
      }),
    );

    expect(result.text).toBe('Grounded answer.');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45, model: 'claude-sonnet-5' });

    const body = captured!.body as { system: string; messages: unknown[]; model: string };
    expect(captured!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.system).toMatch(/OSHA does not approve or certify courses/);
    expect(body.system).toMatch(/<document id="lesson-1"/);
    expect(body.messages).toHaveLength(1);
  });

  it('surfaces an API error rather than returning empty text', async () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-sonnet-5',
      fetchImpl: (async () =>
        new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(new AiClient(provider).run(request())).rejects.toThrow(/returned 429/);
  });

  it('refuses to construct without an API key', () => {
    expect(() => new AnthropicProvider({ apiKey: '', model: 'claude-sonnet-5' })).toThrow(
      AiUnavailableError,
    );
  });
});

describe('usage limits', () => {
  it('allows requests within the monthly allowance', () => {
    expect(checkUsage({ requestsThisMonth: 10, monthlyLimit: 100 })).toEqual({
      allowed: true,
      remaining: 90,
    });
  });

  it('blocks once the allowance is spent, and says why', () => {
    const decision = checkUsage({ requestsThisMonth: 100, monthlyLimit: 100 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/100 AI requests per month/);
  });

  it('treats a null limit as unlimited', () => {
    expect(checkUsage({ requestsThisMonth: 1_000_000, monthlyLimit: null }).allowed).toBe(true);
  });
});
