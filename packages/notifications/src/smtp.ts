import nodemailer from 'nodemailer';
import type { DeliveryReceipt, NotificationTransport, OutboundNotification } from './transport.js';

export const createSmtpTransport = (options: {
  host: string;
  port: number;
  from: string;
  user?: string;
  password?: string;
  requireTls: boolean;
}): NotificationTransport => {
  const client = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    requireTLS: options.requireTls && options.port !== 465,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    ...(options.user && options.password
      ? { auth: { user: options.user, pass: options.password } }
      : {}),
  });

  return {
    name: 'smtp',
    supports: (channel) => channel === 'EMAIL',
    async send(notification: OutboundNotification): Promise<DeliveryReceipt> {
      try {
        const { subject, body, actionUrl } = notification.message;
        const receipt = await client.sendMail({
          from: options.from,
          to: notification.to,
          subject,
          text: actionUrl ? `${body}\n\n${actionUrl}` : body,
        });
        return receipt.accepted.length > 0
          ? { delivered: true, providerMessageId: receipt.messageId }
          : { delivered: false, error: 'SMTP rejected the recipient' };
      } catch {
        return { delivered: false, error: 'SMTP delivery failed' };
      }
    },
  };
};

export const configureEmail = (env: {
  MAIL_DRIVER: 'log' | 'smtp';
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  MAIL_FROM: string;
  NODE_ENV: string;
}): NotificationTransport | undefined =>
  env.MAIL_DRIVER === 'smtp' && env.SMTP_HOST
    ? createSmtpTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.MAIL_FROM,
        requireTls: env.NODE_ENV === 'production' || Boolean(env.SMTP_USER),
      })
    : undefined;
