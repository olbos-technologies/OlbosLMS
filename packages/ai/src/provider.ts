import {
  BLOCKED_RESPONSE,
  GUARDRAILS,
  reviewOutput,
  type AiFeature,
  type OutputReview,
} from './guardrails.js';

/**
 * AI provider abstraction.
 *
 * The application never calls a model API directly. It calls `AiClient.run()`,
 * which applies the feature's guardrails, invokes a provider, reviews the
 * output, and reports token usage for metering. Swapping providers, or running
 * with AI switched off entirely, changes nothing above this line.
 */

export interface AiMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface GroundingDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  /** Where this came from, so an answer can cite it. */
  readonly source: string;
}

export interface AiRequest {
  readonly feature: AiFeature;
  readonly messages: readonly AiMessage[];
  /** Organization-approved material the answer should be grounded in. */
  readonly grounding?: readonly GroundingDocument[];
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

export interface ProviderResponse {
  readonly text: string;
  readonly usage: AiUsage;
}

export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  complete(request: AiRequest, systemPrompt: string): Promise<ProviderResponse>;
}

export interface AiResult {
  readonly text: string;
  readonly review: OutputReview;
  readonly usage: AiUsage;
  readonly citations: { id: string; title: string; source: string }[];
  readonly blocked: boolean;
}

export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';
  readonly statusCode = 503;
  constructor(message = 'AI features are not configured for this deployment.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * The provider used when no AI credentials are configured. It fails loudly
 * rather than returning a plausible-looking canned answer — a training platform
 * that invents safety guidance is worse than one with the feature switched off.
 */
export class NullAiProvider implements AiProvider {
  readonly name = 'null';
  readonly available = false;

  async complete(): Promise<ProviderResponse> {
    throw new AiUnavailableError();
  }
}

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

/** Anthropic Messages API provider. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly available = true;

  constructor(private readonly options: AnthropicProviderOptions) {
    if (!options.apiKey) throw new AiUnavailableError('ANTHROPIC_API_KEY is not set.');
  }

  async complete(request: AiRequest, systemPrompt: string): Promise<ProviderResponse> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const baseUrl = this.options.baseUrl ?? 'https://api.anthropic.com';

    const system = [
      systemPrompt,
      request.grounding?.length
        ? [
            'Approved course material follows. Prefer it over general knowledge, and cite',
            'the document id when you use one.',
            ...request.grounding.map(
              (doc) =>
                `<document id="${doc.id}" title="${doc.title}">\n${doc.content}\n</document>`,
            ),
          ].join('\n')
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await doFetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.2,
        system,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic API returned ${response.status}: ${detail.slice(0, 500)}`);
    }

    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        model: body.model ?? this.options.model,
      },
    };
  }
}

/**
 * Applies guardrails around whichever provider is configured. Every AI call in
 * the product goes through here.
 */
export class AiClient {
  constructor(private readonly provider: AiProvider) {}

  get available(): boolean {
    return this.provider.available;
  }

  get providerName(): string {
    return this.provider.name;
  }

  async run(request: AiRequest): Promise<AiResult> {
    if (!this.provider.available) throw new AiUnavailableError();

    const guardrails = GUARDRAILS[request.feature];
    const response = await this.provider.complete(request, guardrails.systemPrompt);
    const review = reviewOutput(response.text, request.feature);

    const citations = (request.grounding ?? [])
      .filter((doc) => response.text.includes(doc.id) || response.text.includes(doc.title))
      .map((doc) => ({ id: doc.id, title: doc.title, source: doc.source }));

    return {
      text: review.verdict === 'BLOCK' ? BLOCKED_RESPONSE : response.text,
      review,
      usage: response.usage,
      citations,
      blocked: review.verdict === 'BLOCK',
    };
  }
}
