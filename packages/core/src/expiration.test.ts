import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, zonedDayKey } from './dates.js';
import {
  computeExpiresAt,
  evaluateCompletion,
  evaluateExpiration,
  nextWarningDate,
  neverExpires,
  RENEWAL_PRESETS,
} from './expiration.js';

const at = (iso: string) => new Date(iso);

describe('calendar day arithmetic', () => {
  it('counts whole days regardless of the time of day', () => {
    expect(daysBetween(at('2026-03-01T23:00:00Z'), at('2026-03-02T01:00:00Z'))).toBe(1);
    expect(daysBetween(at('2026-03-01T01:00:00Z'), at('2026-03-01T23:00:00Z'))).toBe(0);
  });

  it('is negative when the target is in the past', () => {
    expect(daysBetween(at('2026-03-10T00:00:00Z'), at('2026-03-01T00:00:00Z'))).toBe(-9);
  });

  it('uses the organization timezone for the day boundary', () => {
    // 06:00 UTC on 2 March is still 1 March in Los Angeles.
    const instant = at('2026-03-02T06:00:00Z');
    expect(zonedDayKey(instant, 'UTC')).toBe('2026-03-02');
    expect(zonedDayKey(instant, 'America/Los_Angeles')).toBe('2026-03-01');
  });

  it('falls back to UTC for an unknown timezone rather than throwing', () => {
    expect(zonedDayKey(at('2026-03-02T06:00:00Z'), 'Mars/Olympus')).toBe('2026-03-02');
  });
});

describe('computeExpiresAt', () => {
  it('returns null when the training never expires', () => {
    expect(computeExpiresAt(at('2026-01-01T00:00:00Z'), { renewalIntervalDays: null })).toBeNull();
    expect(computeExpiresAt(at('2026-01-01T00:00:00Z'), { renewalIntervalDays: 0 })).toBeNull();
    expect(neverExpires({ renewalIntervalDays: RENEWAL_PRESETS.NEVER })).toBe(true);
  });

  it('adds the renewal interval to the completion date', () => {
    const expires = computeExpiresAt(at('2026-01-01T09:00:00Z'), { renewalIntervalDays: 365 });
    expect(expires?.toISOString()).toBe('2027-01-01T09:00:00.000Z');
  });

  it('supports each preset interval', () => {
    const completed = at('2026-01-01T00:00:00Z');
    expect(computeExpiresAt(completed, { renewalIntervalDays: 30 })?.toISOString()).toBe(
      '2026-01-31T00:00:00.000Z',
    );
    expect(computeExpiresAt(completed, { renewalIntervalDays: 1095 })?.toISOString()).toBe(
      '2028-12-31T00:00:00.000Z',
    );
  });

  it('honours a fixed expiration date', () => {
    const fixed = at('2026-12-31T00:00:00Z');
    expect(
      computeExpiresAt(at('2026-01-01T00:00:00Z'), {
        renewalIntervalDays: 365,
        basis: 'FIXED_DATE',
        fixedExpiresAt: fixed,
      })?.toISOString(),
    ).toBe(fixed.toISOString());
  });

  it('rolls to the next hire anniversary after completion', () => {
    const expires = computeExpiresAt(at('2026-05-01T00:00:00Z'), {
      renewalIntervalDays: 365,
      basis: 'ANNIVERSARY_OF_HIRE',
      hireDate: at('2019-03-15T00:00:00Z'),
    });
    expect(expires?.toISOString()).toBe('2027-03-15T00:00:00.000Z');
  });

  it('falls back to the interval when no hire date is known', () => {
    const expires = computeExpiresAt(at('2026-05-01T00:00:00Z'), {
      renewalIntervalDays: 90,
      basis: 'ANNIVERSARY_OF_HIRE',
      hireDate: null,
    });
    expect(expires?.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });
});

describe('evaluateExpiration', () => {
  const now = at('2026-06-01T12:00:00Z');

  it('reports NEVER_EXPIRES for training with no expiry', () => {
    const result = evaluateExpiration(null, { now });
    expect(result.status).toBe('NEVER_EXPIRES');
    expect(result.daysUntilExpiry).toBeNull();
  });

  it('reports CURRENT well before expiry', () => {
    const result = evaluateExpiration(addDays(now, 200), { now });
    expect(result.status).toBe('CURRENT');
    expect(result.daysUntilExpiry).toBe(200);
    expect(result.warningThreshold).toBeNull();
  });

  it('reports EXPIRING_SOON once a warning threshold is crossed', () => {
    const result = evaluateExpiration(addDays(now, 45), { now });
    expect(result.status).toBe('EXPIRING_SOON');
    expect(result.warningThreshold).toBe(60);
  });

  it('escalates to the tightest crossed threshold', () => {
    expect(evaluateExpiration(addDays(now, 20), { now }).warningThreshold).toBe(30);
    expect(evaluateExpiration(addDays(now, 10), { now }).warningThreshold).toBe(14);
    expect(evaluateExpiration(addDays(now, 3), { now }).warningThreshold).toBe(7);
    expect(evaluateExpiration(addDays(now, 1), { now }).warningThreshold).toBe(1);
  });

  it('treats the expiry day itself as still current', () => {
    const result = evaluateExpiration(at('2026-06-01T08:00:00Z'), { now });
    expect(result.status).toBe('EXPIRING_SOON');
    expect(result.daysUntilExpiry).toBe(0);
  });

  it('reports EXPIRED the day after', () => {
    const result = evaluateExpiration(at('2026-05-31T23:00:00Z'), { now });
    expect(result.status).toBe('EXPIRED');
    expect(result.daysUntilExpiry).toBe(-1);
  });

  it('uses the organization warning ladder when one is configured', () => {
    const result = evaluateExpiration(addDays(now, 45), { now, warningIntervalDays: [30, 7] });
    expect(result.status).toBe('CURRENT');
    expect(
      evaluateExpiration(addDays(now, 20), { now, warningIntervalDays: [30, 7] }).warningThreshold,
    ).toBe(30);
  });
});

describe('evaluateCompletion', () => {
  it('combines the policy and the clock in one call', () => {
    const result = evaluateCompletion(
      at('2025-07-01T00:00:00Z'),
      { renewalIntervalDays: 365 },
      at('2026-06-15T00:00:00Z'),
    );
    expect(result.status).toBe('EXPIRING_SOON');
    expect(result.daysUntilExpiry).toBe(16);
    expect(result.warningThreshold).toBe(30);
  });

  it('never expires when the policy says so, however old the completion', () => {
    const result = evaluateCompletion(
      at('2010-01-01T00:00:00Z'),
      { renewalIntervalDays: null },
      at('2026-06-15T00:00:00Z'),
    );
    expect(result.status).toBe('NEVER_EXPIRES');
  });
});

describe('nextWarningDate', () => {
  const now = at('2026-01-01T00:00:00Z');

  it('returns the widest warning still ahead', () => {
    const expiresAt = addDays(now, 120);
    const next = nextWarningDate(expiresAt, { now });
    expect(next?.threshold).toBe(90);
    expect(next?.date.toISOString()).toBe(addDays(expiresAt, -90).toISOString());
  });

  it('moves to the next threshold once the previous one passes', () => {
    expect(nextWarningDate(addDays(now, 45), { now })?.threshold).toBe(30);
    expect(nextWarningDate(addDays(now, 10), { now })?.threshold).toBe(7);
  });

  it('returns null once the final warning has been reached', () => {
    expect(nextWarningDate(addDays(now, 1), { now })).toBeNull();
  });

  it('returns null for expired or never-expiring training', () => {
    expect(nextWarningDate(addDays(now, -5), { now })).toBeNull();
    expect(nextWarningDate(null, { now })).toBeNull();
  });
});
