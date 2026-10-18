import type { FastifyPluginAsync } from 'fastify';
import { getEnv } from '@olbos/config';
import { verifyStripeSignature } from '@olbos/billing';
import { ApiError } from '../errors.js';
import { reconcileStripeEvent, stripeEventSchema } from '../services/billing.service.js';

/** Provider signature authenticates this route; it never accepts session identity. */
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  app.post(
    '/api/webhooks/stripe',
    { config: { skipCsrf: true }, bodyLimit: 1024 * 1024 },
    async (request) => {
      const env = getEnv();
      if (env.BILLING_DRIVER !== 'stripe' || !env.STRIPE_WEBHOOK_SECRET)
        throw new ApiError('SERVICE_UNAVAILABLE', 'Online billing is not configured.');
      const signature = request.headers['stripe-signature'];
      if (
        !Buffer.isBuffer(request.body) ||
        !verifyStripeSignature(
          request.body,
          typeof signature === 'string' ? signature : undefined,
          env.STRIPE_WEBHOOK_SECRET,
        )
      )
        throw ApiError.badRequest('Invalid payment signature.');
      let parsed: unknown;
      try {
        parsed = JSON.parse(request.body.toString('utf8'));
      } catch {
        throw ApiError.badRequest('Invalid payment event.');
      }
      const event = stripeEventSchema.parse(parsed);
      await reconcileStripeEvent(event);
      return { received: true };
    },
  );
};
