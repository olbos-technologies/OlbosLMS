import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getEnv } from '@olbos/config';
import {
  AiClient,
  AnthropicProvider,
  checkUsage,
  GUARDRAILS,
  NullAiProvider,
  type AiFeature,
  type GroundingDocument,
} from '@olbos/ai';
import { ApiError } from '../../errors.js';
import { ok, parseBody, uuidSchema } from '../../lib/http.js';

/**
 * AI endpoints (§29, §30).
 *
 * Every call passes four gates before it reaches a model: entitlement,
 * permission, monthly usage limit, and the feature's guardrails. Every response
 * that reaches a user carries its classification and notice, and anything the
 * output review blocks is replaced rather than trimmed.
 *
 * AI-authored content for learners is written as an `AiGeneration` in
 * PENDING_REVIEW, never straight into a course.
 */

const buildClient = (): AiClient => {
  const env = getEnv();
  if (env.AI_DRIVER === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return new AiClient(
      new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL }),
    );
  }
  return new AiClient(new NullAiProvider());
};

export const aiRoutes: FastifyPluginAsync = async (app) => {
  const client = buildClient();

  app.get('/ai/status', async (request) => {
    const principal = request.requireAuth();
    return ok({
      available: client.available,
      provider: client.providerName,
      features: Object.values(GUARDRAILS).map((guardrail) => ({
        feature: guardrail.feature,
        entitled: principal.entitlements.allows(guardrail.entitlement as never),
        requiresHumanReview: guardrail.requiresHumanReview,
        notice: guardrail.userFacingNotice,
      })),
      monthlyLimit: principal.entitlements.limitFor('MAX_AI_REQUESTS_PER_MONTH'),
    });
  });

  app.post('/ai/tutor', async (request) => {
    const { organizationId, principal, db } = request.requireTenant();
    const guardrails = GUARDRAILS.TUTOR;

    request.requireEntitlement(guardrails.entitlement as never);
    request.authorize(guardrails.permission as never);

    if (!client.available) {
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        'AI features are not configured for this deployment.',
      );
    }

    const body = parseBody(
      request,
      z.object({
        message: z.string().trim().min(2).max(4000),
        conversationId: uuidSchema.optional(),
        courseId: uuidSchema.optional(),
      }),
    );

    // Usage allowance for the calendar month.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const used = await db.aiUsageRecord.count({ where: { occurredAt: { gte: monthStart } } });
    const usage = checkUsage({
      requestsThisMonth: used,
      monthlyLimit: principal.entitlements.limitFor('MAX_AI_REQUESTS_PER_MONTH'),
    });
    if (!usage.allowed) {
      throw new ApiError('USAGE_LIMIT_EXCEEDED', usage.reason ?? 'AI allowance exhausted.');
    }

    // Ground the answer in the learner's own course material. The tenant client
    // guarantees the material belongs to this organization.
    let grounding: GroundingDocument[] = [];
    if (body.courseId) {
      const lessons = await db.lesson.findMany({
        where: { module: { courseVersion: { courseId: body.courseId } } },
        orderBy: { position: 'asc' },
        take: 20,
        select: {
          id: true,
          title: true,
          body: true,
          module: { select: { title: true, courseVersion: { select: { title: true } } } },
        },
      });
      grounding = lessons
        .filter((lesson) => !!lesson.body)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          content: (lesson.body ?? '').replace(/<[^>]+>/g, ' ').slice(0, 4000),
          source: `${lesson.module.courseVersion.title} / ${lesson.module.title}`,
        }));
    }

    const conversation = body.conversationId
      ? await db.aiConversation.findFirst({
          where: { id: body.conversationId, userId: principal.userId },
          select: { id: true },
        })
      : await db.aiConversation.create({
          data: {
            organizationId,
            userId: principal.userId,
            feature: 'TUTOR',
            title: body.message.slice(0, 80),
            courseId: body.courseId ?? null,
          },
          select: { id: true },
        });

    if (!conversation) throw ApiError.notFound('Conversation');

    const history = await db.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    const result = await client.run({
      feature: 'TUTOR',
      messages: [
        ...history.map((message) => ({
          role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: message.content,
        })),
        { role: 'user', content: body.message },
      ],
      grounding,
    });

    await db.aiMessage.createMany({
      data: [
        {
          organizationId,
          conversationId: conversation.id,
          role: 'user',
          content: body.message,
        },
        {
          organizationId,
          conversationId: conversation.id,
          role: 'assistant',
          content: result.text,
          citations: result.citations,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
        },
      ],
    });

    await db.aiUsageRecord.create({
      data: {
        organizationId,
        userId: principal.userId,
        feature: 'TUTOR',
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        succeeded: !result.blocked,
      },
    });

    if (result.blocked) {
      request.log.warn(
        { findings: result.review.findings, userId: principal.userId },
        'AI output blocked by guardrails',
      );
    }

    return ok(
      {
        conversationId: conversation.id,
        answer: result.text,
        citations: result.citations,
      },
      {
        classification: result.review.classification,
        notice: result.review.notice,
        blocked: result.blocked,
        findings: result.review.findings,
        remaining: usage.remaining,
      },
    );
  });

  /**
   * Drafting endpoints. Output is stored for review; nothing is published to
   * learners from here.
   */
  app.post('/ai/generate', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();

    const body = parseBody(
      request,
      z.object({
        feature: z.enum(['COURSE_BUILDER', 'QUESTION_GENERATOR', 'SCENARIO_GENERATOR']),
        prompt: z.record(z.string(), z.unknown()),
        instruction: z.string().trim().min(10).max(4000),
      }),
    );

    const guardrails = GUARDRAILS[body.feature as AiFeature];
    request.requireEntitlement(guardrails.entitlement as never);
    request.authorize(guardrails.permission as never);

    if (!client.available) {
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        'AI features are not configured for this deployment.',
      );
    }

    const result = await client.run({
      feature: body.feature as AiFeature,
      messages: [{ role: 'user', content: body.instruction }],
    });

    const generation = await db.aiGeneration.create({
      data: {
        organizationId,
        feature: body.feature as AiFeature,
        // Always PENDING_REVIEW: a qualified human accepts it, or it never
        // reaches a learner.
        status: 'PENDING_REVIEW',
        requestedById: principal.userId,
        prompt: { instruction: body.instruction, ...body.prompt },
        output: { text: result.text, findings: result.review.findings },
        model: result.usage.model,
      },
    });

    await db.aiUsageRecord.create({
      data: {
        organizationId,
        userId: principal.userId,
        feature: body.feature as AiFeature,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        succeeded: !result.blocked,
      },
    });

    await request.audit({
      action: 'AI_GENERATION_REQUESTED',
      entityType: 'ai_generation',
      entityId: generation.id,
      summary: `Requested an AI draft (${body.feature})`,
    });

    return reply.status(201).send(
      ok(
        { generationId: generation.id, status: generation.status, output: result.text },
        {
          classification: result.review.classification,
          notice: result.review.notice,
          requiresHumanReview: true,
          blocked: result.blocked,
          findings: result.review.findings,
        },
      ),
    );
  });

  app.post('/ai/generations/:id/review', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('ai:review');

    const { id } = request.params as { id: string };
    const body = parseBody(
      request,
      z.object({
        decision: z.enum(['APPROVED', 'REJECTED']),
        notes: z.string().max(2000).optional(),
      }),
    );

    const generation = await db.aiGeneration.findFirst({
      where: { id },
      select: { id: true, feature: true, status: true },
    });
    if (!generation) throw ApiError.notFound('AI generation');
    if (generation.status !== 'PENDING_REVIEW') {
      throw ApiError.conflict('That draft has already been reviewed.');
    }

    const updated = await db.aiGeneration.update({
      where: { id },
      data: {
        status: body.decision,
        reviewedById: request.principal?.userId ?? null,
        reviewedAt: new Date(),
        reviewNotes: body.notes ?? null,
      },
    });

    await request.audit({
      action: 'AI_GENERATION_APPROVED',
      entityType: 'ai_generation',
      entityId: id,
      summary: `${body.decision === 'APPROVED' ? 'Approved' : 'Rejected'} an AI draft (${generation.feature})`,
      changes: { decision: body.decision, notes: body.notes ?? null },
    });

    return ok(updated);
  });
};
