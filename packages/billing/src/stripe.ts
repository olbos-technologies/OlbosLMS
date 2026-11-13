import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SubscriptionStatus } from './entitlements.js';

export class BillingProviderError extends Error {
  constructor(message = 'The payment service is unavailable. Please try again later.') {
    super(message);
    this.name = 'BillingProviderError';
  }
}

/** Verify the exact body before parsing JSON; allow secret rotation signatures. */
export const verifyStripeSignature = (
  body: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean => {
  if (!header || !secret) return false;
  const parts = header.split(',').map((part) => part.trim().split('='));
  const timestamps = parts.filter(([key]) => key === 't');
  if (timestamps.length !== 1) return false;
  const timestamp = timestamps[0]?.[1] ?? '';
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest();
  return parts.some(
    ([key, value]) =>
      key === 'v1' &&
      /^[0-9a-f]{64}$/.test(value ?? '') &&
      timingSafeEqual(expected, Buffer.from(value!, 'hex')),
  );
};

export const stripeSubscriptionStatus = (status: string): SubscriptionStatus => {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELLED';
    default:
      return 'EXPIRED';
  }
};

export const hostedBillingUrl = (value: unknown, kind: 'checkout' | 'portal'): string => {
  if (typeof value !== 'string') throw new BillingProviderError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingProviderError();
  }
  const expected = kind === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
  if (url.protocol !== 'https:' || url.hostname !== expected || url.username || url.password)
    throw new BillingProviderError();
  return value;
};

export class StripeBillingClient {
  constructor(
    private readonly secretKey: string,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async request(
    path: string,
    fields?: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    if (!/^\/[a-z_/]+(?:\/[A-Za-z0-9_]+)?$/.test(path)) throw new BillingProviderError();
    try {
      const response = await this.transport(`https://api.stripe.com/v1${path}`, {
        method: fields ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          // The integration intentionally uses the pre-Basil subscription period shape.
          'Stripe-Version': '2025-02-24.acacia',
          ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(fields ? { body: new URLSearchParams(fields).toString() } : {}),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new BillingProviderError();
      return await response.json();
    } catch (_error) {
      // Provider payloads can contain customer details; never return or log them.
      throw new BillingProviderError();
    }
  }
}
