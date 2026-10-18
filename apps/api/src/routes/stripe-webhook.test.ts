import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { __setEnvForTesting, parseEnv } from '@olbos/config';
import { stripeWebhookRoutes } from './stripe-webhook.js';
import { normaliseError } from '../errors.js';
let app: FastifyInstance;
const secret = 'whsec_route_fixture';
const body =
  ' { "id": "evt_ignore", "type": "unsupported.event", "livemode": false, "data": {"object":{"id":"obj_test"}} }\n';
const sign = (value: string) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${value}`).digest('hex')}`;
};
beforeAll(async () => {
  __setEnvForTesting(
    parseEnv({
      DATABASE_URL: 'postgresql://localhost/unused_test',
      SESSION_SECRET: 'x'.repeat(64),
      CERTIFICATE_SIGNING_SECRET: 'y'.repeat(64),
      BILLING_DRIVER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_route',
      STRIPE_WEBHOOK_SECRET: secret,
      BILLING_RETURN_URL: 'http://localhost:3000/admin/billing',
    }),
  );
  app = Fastify();
  app.setErrorHandler((error, request, reply) => {
    const result = normaliseError(error, request.id);
    return reply.status(result.status).send(result.body);
  });
  await app.register(stripeWebhookRoutes);
});
afterAll(async () => {
  await app.close();
  __setEnvForTesting(undefined);
});
describe('raw Stripe webhook boundary', () => {
  it('authenticates the exact bytes before accepting an ignored event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': sign(body) },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
  });
  it('rejects altered bytes and missing signatures', async () => {
    for (const signature of [undefined, sign(body + ' ')]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/stripe',
        headers: {
          'content-type': 'application/json',
          ...(signature ? { 'stripe-signature': signature } : {}),
        },
        payload: body,
      });
      expect(response.statusCode).toBe(400);
    }
  });
});
