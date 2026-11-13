import { describe, expect, it } from 'vitest';
import {
  batchByRecipient,
  buildSupervisorDigest,
  buildTrainingMessage,
  CATEGORY_POLICIES,
  dedupeKey,
  isWithinCooldown,
  resolveDelivery,
} from './templates.js';
import { LogTransport, TransportRouter, InAppTransport } from './transport.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const due = new Date('2026-06-15T00:00:00Z');

describe('training messages', () => {
  it('names the course and the deadline when training is assigned', () => {
    const message = buildTrainingMessage('TRAINING_ASSIGNED', {
      courseTitle: 'Lockout/Tagout',
      dueAt: due,
    });
    expect(message.subject).toBe('Training assigned: Lockout/Tagout');
    expect(message.body).toBe('You have been assigned Lockout/Tagout. It is due by 15 June 2026.');
    expect(message.actionUrl).toBe('/learning');
  });

  it('omits the deadline when there is none', () => {
    const message = buildTrainingMessage('TRAINING_ASSIGNED', { courseTitle: 'PPE' });
    expect(message.body).toBe('You have been assigned PPE.');
  });

  it('counts the days remaining for a due reminder', () => {
    const message = buildTrainingMessage('TRAINING_DUE', {
      courseTitle: 'PPE',
      dueAt: due,
      daysUntil: 14,
    });
    expect(message.body).toBe('PPE is due on 15 June 2026 (14 days left).');
  });

  it('uses the singular for one day', () => {
    const message = buildTrainingMessage('TRAINING_DUE', {
      courseTitle: 'PPE',
      dueAt: due,
      daysUntil: 1,
    });
    expect(message.body).toMatch(/\(1 day left\)/);
  });

  it('states how overdue the training is', () => {
    const message = buildTrainingMessage('TRAINING_OVERDUE', {
      courseTitle: 'Fall Protection',
      daysOverdue: 5,
    });
    expect(message.subject).toBe('Overdue: Fall Protection');
    expect(message.body).toMatch(/overdue by 5 days/);
  });

  it('warns before expiry and reports after it', () => {
    const expiring = buildTrainingMessage('TRAINING_EXPIRING', {
      courseTitle: 'Forklift Safety',
      expiresAt: due,
      daysUntil: 14,
    });
    expect(expiring.body).toMatch(/expires on 15 June 2026 \(14 days left\)/);

    const expired = buildTrainingMessage('TRAINING_EXPIRED', {
      courseTitle: 'Forklift Safety',
      expiresAt: new Date('2026-05-01T00:00:00Z'),
    });
    expect(expired.body).toMatch(/expired on 1 May 2026/);
    expect(expired.body).toMatch(/no longer current/);
  });

  it('includes the certificate number when one is issued', () => {
    const message = buildTrainingMessage('CERTIFICATE_ISSUED', {
      courseTitle: 'Confined Space',
      certificateNumber: 'ACME-2026-000042',
      expiresAt: due,
    });
    expect(message.body).toMatch(/ACME-2026-000042/);
    expect(message.actionUrl).toBe('/learning/certificates');
  });

  it('names the revoking organization', () => {
    const message = buildTrainingMessage('CERTIFICATE_REVOKED', {
      courseTitle: 'Confined Space',
      organizationName: 'Acme Manufacturing',
    });
    expect(message.body).toMatch(/revoked by Acme Manufacturing/);
  });
});

describe('supervisor digest', () => {
  it('summarises the whole team in one message', () => {
    const message = buildSupervisorDigest(
      [
        { employeeName: 'John Smith', courseTitle: 'Forklift Safety', status: 'MISSING' },
        { employeeName: 'Amir Haddad', courseTitle: 'Hazard Communication', status: 'EXPIRED' },
        { employeeName: 'Jane Doe', courseTitle: 'PPE', status: 'EXPIRING', dueAt: due },
      ],
      { compliancePercent: 72.7 },
    );
    expect(message.subject).toBe('Team training compliance: 1 expired, 1 missing, 1 expiring');
    expect(message.body).toMatch(/72.7% training compliance/);
    expect(message.body).toMatch(/- John Smith: Forklift Safety \(missing\)/);
    expect(message.actionUrl).toBe('/compliance');
  });

  it('says so plainly when nothing is outstanding', () => {
    const message = buildSupervisorDigest([]);
    expect(message.subject).toBe('Team training compliance: all current');
    expect(message.body).toMatch(/No outstanding training items/);
  });

  it('truncates a very long list', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      employeeName: `Employee ${index}`,
      courseTitle: 'PPE',
      status: 'MISSING' as const,
    }));
    expect(buildSupervisorDigest(items).body).toMatch(/\.\.\.and 5 more/);
  });
});

describe('delivery preferences', () => {
  it('uses the category defaults when the user has expressed no preference', () => {
    const decision = resolveDelivery('TRAINING_ASSIGNED');
    expect(decision.channels).toEqual(['IN_APP', 'EMAIL']);
    expect(decision.frequency).toBe('immediate');
  });

  it('honours an opt-out for a non-mandatory category', () => {
    const decision = resolveDelivery('TRAINING_ASSIGNED', [
      { category: 'TRAINING_ASSIGNED', channel: 'EMAIL', enabled: false },
    ]);
    expect(decision.channels).toEqual(['IN_APP']);
    expect(decision.suppressedChannels).toEqual(['EMAIL']);
  });

  it('ignores an opt-out for a mandatory category', () => {
    const decision = resolveDelivery('SECURITY', [
      { category: 'SECURITY', channel: 'EMAIL', enabled: false },
    ]);
    expect(decision.channels).toContain('EMAIL');
    expect(decision.reason).toMatch(/mandatory/);
  });

  it('does not route to a channel the deployment cannot send on', () => {
    const decision = resolveDelivery(
      'TRAINING_ASSIGNED',
      [{ category: 'TRAINING_ASSIGNED', channel: 'SMS', enabled: true }],
      ['IN_APP'],
    );
    expect(decision.channels).toEqual(['IN_APP']);
    expect(decision.suppressedChannels).toContain('SMS');
  });

  it('respects a digest frequency preference', () => {
    const decision = resolveDelivery('TRAINING_DUE', [
      { category: 'TRAINING_DUE', channel: 'EMAIL', enabled: true, frequency: 'weekly' },
    ]);
    expect(decision.frequency).toBe('weekly');
  });

  it('marks overdue, expired, revoked and security notices as mandatory', () => {
    const mandatory = Object.values(CATEGORY_POLICIES)
      .filter((p) => p.mandatory)
      .map((p) => p.category)
      .sort();
    expect(mandatory).toEqual([
      'CERTIFICATE_REVOKED',
      'SECURITY',
      'TRAINING_EXPIRED',
      'TRAINING_OVERDUE',
    ]);
  });
});

describe('deduplication', () => {
  it('builds a stable key per event and variant', () => {
    expect(dedupeKey({ category: 'TRAINING_EXPIRING', entityId: 'rec-1', variant: 30 })).toBe(
      'TRAINING_EXPIRING:rec-1:30',
    );
    expect(dedupeKey({ category: 'TRAINING_EXPIRING', entityId: 'rec-1', variant: 7 })).not.toBe(
      dedupeKey({ category: 'TRAINING_EXPIRING', entityId: 'rec-1', variant: 30 }),
    );
  });

  it('suppresses a repeat inside the cooldown window', () => {
    const key = dedupeKey({ category: 'TRAINING_OVERDUE', entityId: 'a-1' });
    const history = [{ dedupeKey: key, sentAt: new Date('2026-05-31T12:00:00Z') }];
    expect(isWithinCooldown('TRAINING_OVERDUE', key, history, NOW)).toBe(true);
  });

  it('allows a repeat once the cooldown has passed', () => {
    const key = dedupeKey({ category: 'TRAINING_OVERDUE', entityId: 'a-1' });
    const history = [{ dedupeKey: key, sentAt: new Date('2026-05-20T12:00:00Z') }];
    expect(isWithinCooldown('TRAINING_OVERDUE', key, history, NOW)).toBe(false);
  });

  it('never suppresses a security notice', () => {
    const key = dedupeKey({ category: 'SECURITY', entityId: 'login' });
    const history = [{ dedupeKey: key, sentAt: new Date('2026-06-01T11:59:00Z') }];
    expect(isWithinCooldown('SECURITY', key, history, NOW)).toBe(false);
  });
});

describe('batching', () => {
  it('groups pending notifications per recipient', () => {
    const buckets = batchByRecipient([
      { recipientId: 'sup-1', courseTitle: 'A' },
      { recipientId: 'sup-1', courseTitle: 'B' },
      { recipientId: 'sup-2', courseTitle: 'C' },
    ]);
    expect(buckets).toHaveLength(2);
    expect(buckets.find((b) => b.key === 'sup-1')!.items).toHaveLength(2);
  });
});

describe('transports', () => {
  const notification = {
    channel: 'EMAIL' as const,
    to: 'john@example.test',
    message: { subject: 'Test', body: 'Body' },
    organizationId: 'org-1',
    userId: 'user-1',
  };

  it('records what the log transport would have sent', async () => {
    const transport = new LogTransport();
    const receipt = await transport.send(notification);
    expect(receipt.delivered).toBe(true);
    expect(transport.sent).toHaveLength(1);
  });

  it('routes each channel to a transport that supports it', async () => {
    const inApp = new InAppTransport(async () => 'row-1');
    const log = new LogTransport();
    const router = new TransportRouter([inApp, log]);

    expect((await router.send({ ...notification, channel: 'IN_APP' })).providerMessageId).toBe(
      'row-1',
    );
    expect((await router.send(notification)).delivered).toBe(true);
    expect(log.sent).toHaveLength(1);
  });

  it('reports an unroutable channel instead of dropping it', async () => {
    const router = new TransportRouter([new InAppTransport(async () => 'row-1')]);
    const receipt = await router.send({ ...notification, channel: 'SMS' });
    expect(receipt.delivered).toBe(false);
    expect(receipt.error).toMatch(/No transport configured for SMS/);
  });

  it('reports a persistence failure rather than throwing', async () => {
    const failing = new InAppTransport(async () => {
      throw new Error('database unavailable');
    });
    const receipt = await failing.send({ ...notification, channel: 'IN_APP' });
    expect(receipt.delivered).toBe(false);
    expect(receipt.error).toBe('database unavailable');
  });
});
