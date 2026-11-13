import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { __setEnvForTesting, getEnv } from '@olbos/config';
import { buildServer } from '../../apps/api/src/server.js';
import { notificationDispatchJob } from '../../apps/worker/src/jobs/notifications.js';
import { seedTenant } from './fixtures.js';
import { db, disconnect, resetDatabase } from './helpers.js';

const messages: string[] = [];
const connections = new Set<Socket>();
let rejectDelivery = false;
const smtp = createServer((socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
  socket.setEncoding('utf8');
  socket.write('220 localhost test SMTP\r\n');
  let buffer = '';
  let data: string[] | undefined;

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') {
          messages.push(data.join('\n'));
          data = undefined;
          socket.write('250 accepted\r\n');
        } else {
          data.push(line);
        }
      } else if (line.startsWith('RCPT TO') && rejectDelivery) {
        socket.write('450 mailbox unavailable\r\n');
      } else if (line === 'DATA') {
        data = [];
        socket.write('354 send message\r\n');
      } else if (line === 'QUIT') {
        socket.end('221 bye\r\n');
      } else {
        socket.write('250 OK\r\n');
      }
    }
  });
});

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  await resetDatabase();
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const address = smtp.address();
  if (!address || typeof address === 'string') throw new Error('Missing SMTP port');
  __setEnvForTesting({
    ...getEnv(),
    MAIL_DRIVER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: address.port,
    MAIL_FROM: 'Olbos Test <no-reply@example.test>',
    MAIL_WEB_ORIGIN: 'http://localhost:3000',
  });
  app = await buildServer();
});

afterAll(async () => {
  await app?.close();
  for (const socket of connections) socket.destroy();
  smtp.close();
  __setEnvForTesting(undefined);
  await resetDatabase();
  await disconnect();
});

it('delivers a one-time reset link for the selected workspace', async () => {
  const tenant = await seedTenant({ slug: 'mail-reset' });
  const user = tenant.users.ORG_OWNER!;
  const start = messages.length;
  const forgot = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email, organizationSlug: tenant.slug },
    });

  const known = await forgot(user.email);
  const unknown = await forgot('missing@example.test');
  expect(known.statusCode).toBe(200);
  expect(known.json()).toEqual(unknown.json());
  expect(messages).toHaveLength(start + 1);
  const message = messages[start]!.replace(/=\n/g, '').replace(/=3D/g, '=');
  expect(message).toContain(user.email);
  const token = message.match(/\/reset-password#token=([^\s]+)/)?.[1];
  expect(token).toBeTruthy();

  const reset = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token, password: 'New-password-for-test-42!' },
    });
  expect((await reset()).statusCode).toBe(200);
  expect((await reset()).statusCode).toBe(400);
});

it('retries a rejected renewal email and records SMTP acceptance', async () => {
  const tenant = await seedTenant({ slug: 'mail-renewal' });
  const user = tenant.users.LEARNER!;
  const notification = await db().notification.create({
    data: {
      organizationId: tenant.organizationId,
      userId: user.id,
      category: 'TRAINING_EXPIRING',
      channel: 'EMAIL',
      subject: 'Training renewal reminder',
      body: 'Your training is due for renewal.',
      actionUrl: '/learning',
    },
  });
  const run = (now: Date) =>
    notificationDispatchJob.run({
      log: app.log,
      now,
      signal: new AbortController().signal,
    });
  const read = () => db().notification.findUniqueOrThrow({ where: { id: notification.id } });
  const start = messages.length;

  rejectDelivery = true;
  try {
    await run(new Date());
  } finally {
    rejectDelivery = false;
  }
  const pending = await read();
  expect(pending.status).toBe('PENDING');
  expect(pending.failureReason).toBeTruthy();
  expect(messages).toHaveLength(start);

  await run(pending.scheduledFor);
  const sent = await read();
  expect(sent.status).toBe('SENT');
  expect(sent.failureReason).toBeNull();
  expect(messages).toHaveLength(start + 1);
  expect(messages[start]).toContain('http://localhost:3000/learning');
});
