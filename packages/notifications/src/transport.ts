import type { NotificationChannel, NotificationMessage } from './templates.js';

/**
 * Transport abstraction.
 *
 * The application never talks to a mail provider directly: it hands a message
 * to a transport. That keeps SMS and push additions to a new class here, and
 * lets tests assert on delivery without a network.
 */

export interface OutboundNotification {
  readonly channel: NotificationChannel;
  readonly to: string;
  readonly message: NotificationMessage;
  readonly organizationId: string;
  readonly userId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface DeliveryReceipt {
  readonly delivered: boolean;
  readonly providerMessageId?: string;
  readonly error?: string;
}

export interface NotificationTransport {
  readonly name: string;
  supports(channel: NotificationChannel): boolean;
  send(notification: OutboundNotification): Promise<DeliveryReceipt>;
}

/** Development transport: records everything, sends nothing. */
export class LogTransport implements NotificationTransport {
  readonly name = 'log';
  readonly sent: OutboundNotification[] = [];

  constructor(private readonly log: (message: string) => void = () => {}) {}

  supports(): boolean {
    return true;
  }

  async send(notification: OutboundNotification): Promise<DeliveryReceipt> {
    this.sent.push(notification);
    this.log(
      `[notification:${notification.channel}] to=${notification.to} subject="${notification.message.subject}"`,
    );
    return { delivered: true, providerMessageId: `log-${this.sent.length}` };
  }
}

/**
 * In-app notifications are rows in the database rather than an outbound send;
 * the persistence callback is injected so this package stays free of a Prisma
 * dependency.
 */
export class InAppTransport implements NotificationTransport {
  readonly name = 'in-app';

  constructor(private readonly persist: (notification: OutboundNotification) => Promise<string>) {}

  supports(channel: NotificationChannel): boolean {
    return channel === 'IN_APP';
  }

  async send(notification: OutboundNotification): Promise<DeliveryReceipt> {
    try {
      const id = await this.persist(notification);
      return { delivered: true, providerMessageId: id };
    } catch (error) {
      return { delivered: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Routes each notification to the first transport that supports its channel.
 * A channel with no transport is reported as undelivered rather than silently
 * dropped, so the worker can retry or alert.
 */
export class TransportRouter {
  constructor(private readonly transports: readonly NotificationTransport[]) {}

  async send(notification: OutboundNotification): Promise<DeliveryReceipt> {
    const transport = this.transports.find((t) => t.supports(notification.channel));
    if (!transport) {
      return { delivered: false, error: `No transport configured for ${notification.channel}` };
    }
    return transport.send(notification);
  }

  async sendAll(
    notifications: readonly OutboundNotification[],
  ): Promise<{ notification: OutboundNotification; receipt: DeliveryReceipt }[]> {
    const results: { notification: OutboundNotification; receipt: DeliveryReceipt }[] = [];
    for (const notification of notifications) {
      // Sequential on purpose: providers rate-limit, and a burst of parallel
      // sends is the fastest way to get an account throttled.
      results.push({ notification, receipt: await this.send(notification) });
    }
    return results;
  }
}
