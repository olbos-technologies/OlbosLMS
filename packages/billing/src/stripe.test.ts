import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BillingProviderError,
  StripeBillingClient,
  hostedBillingUrl,
  stripeSubscriptionStatus,
  verifyStripeSignature,
} from './stripe.js';
const body = Buffer.from('{"id":"evt_test"}');
const secret = 'whsec_unit_test';
const signature = (timestamp: number, content = body) =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(content).digest('hex')}`;

describe('Stripe webhook authentication', () => {
  it('accepts signed bytes, including a matching rotated signature', () => {
    expect(verifyStripeSignature(body, signature(1000), secret, 1000)).toBe(true);
    expect(
      verifyStripeSignature(body, `${signature(1000)},v1=${'0'.repeat(64)}`, secret, 1000),
    ).toBe(true);
  });
  it('rejects modified payloads, wrong secrets, missing headers, and malformed signatures', () => {
    expect(verifyStripeSignature(Buffer.from('{}'), signature(1000), secret, 1000)).toBe(false);
    expect(verifyStripeSignature(body, signature(1000), 'wrong', 1000)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret, 1000)).toBe(false);
    expect(verifyStripeSignature(body, 't=1000,v1=xyz', secret, 1000)).toBe(false);
    expect(verifyStripeSignature(body, `${signature(1000)},t=1000`, secret, 1000)).toBe(false);
  });
  it('rejects stale and future signed requests beyond five minutes', () => {
    expect(verifyStripeSignature(body, signature(1000), secret, 1301)).toBe(false);
    expect(verifyStripeSignature(body, signature(1301), secret, 1000)).toBe(false);
  });
});
describe('Billing provider boundary', () => {
  it('sends form data and an idempotency key to the fixed provider host', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"id":"cus_test"}', { status: 200 }));
    await new StripeBillingClient('test-secret', transport).request(
      '/customers',
      { email: 'admin@example.test' },
      'request-test',
    );
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/customers');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({
      'Idempotency-Key': 'request-test',
      'Stripe-Version': '2025-02-24.acacia',
    });
    expect(options?.body).toBe('email=admin%40example.test');
  });
  it('does not expose provider error payloads', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private-customer-details', { status: 500 }));
    await expect(
      new StripeBillingClient('secret', transport).request('/customers', {}),
    ).rejects.toThrow(BillingProviderError);
    await expect(
      new StripeBillingClient('secret', transport).request('https://attacker.test'),
    ).rejects.toThrow(BillingProviderError);
  });
  it('allows only the expected HTTPS checkout and portal hosts', () => {
    expect(hostedBillingUrl('https://checkout.stripe.com/c/pay/test', 'checkout')).toContain(
      'checkout.stripe.com',
    );
    expect(hostedBillingUrl('https://billing.stripe.com/p/session/test', 'portal')).toContain(
      'billing.stripe.com',
    );
    for (const url of [
      'http://checkout.stripe.com/test',
      'https://checkout.stripe.com.attacker.test/',
      'https://user@checkout.stripe.com/',
    ])
      expect(() => hostedBillingUrl(url, 'checkout')).toThrow();
  });
  it('fails closed for incomplete, unpaid, paused, and unknown subscription states', () => {
    expect(stripeSubscriptionStatus('active')).toBe('ACTIVE');
    expect(stripeSubscriptionStatus('past_due')).toBe('PAST_DUE');
    expect(stripeSubscriptionStatus('canceled')).toBe('CANCELLED');
    for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused', 'unexpected'])
      expect(stripeSubscriptionStatus(status)).toBe('EXPIRED');
  });
});
