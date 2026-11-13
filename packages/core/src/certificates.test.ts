import { describe, expect, it } from 'vitest';
import {
  buildVerificationPayload,
  buildVerificationUrl,
  certificateIntegrityHash,
  classifyCertificate,
  formatCertificateNumber,
  generatePublicId,
  verifyCertificateIntegrity,
  type CertificateRecord,
} from './certificates.js';

const SECRET = 'certificate-signing-secret-for-tests-0123456789';
const NOW = new Date('2026-06-01T12:00:00Z');

const fields = {
  publicId: 'ABCD2345EFGH',
  certificateNumber: 'ACME-2026-000123',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  courseVersionId: 'cv-1',
  learnerName: 'John Smith',
  courseTitle: 'Lockout/Tagout',
  completedAt: new Date('2026-05-20T10:00:00Z'),
  issuedAt: new Date('2026-05-20T10:05:00Z'),
  expiresAt: new Date('2027-05-20T10:00:00Z'),
};

const certificate = (overrides: Partial<CertificateRecord> = {}): CertificateRecord => {
  const base = {
    ...fields,
    status: 'ACTIVE' as const,
    organizationName: 'Acme Manufacturing',
    trainingType: 'SAFETY_AWARENESS_TRAINING' as const,
    instructorName: 'Dana Ruiz',
    durationMinutes: 120,
    creditHours: 2,
    score: 92,
    disclaimer: 'Awareness training disclaimer.',
    ...overrides,
  };
  return { ...base, integrityHash: certificateIntegrityHash(SECRET, base) };
};

describe('generatePublicId', () => {
  it('produces ids of the requested length', () => {
    expect(generatePublicId()).toHaveLength(12);
    expect(generatePublicId(8)).toHaveLength(8);
  });

  it('avoids the characters people misread when transcribing a code', () => {
    const sample = Array.from({ length: 200 }, () => generatePublicId()).join('');
    expect(sample).not.toMatch(/[01OI]/);
  });

  it('draws uniformly from its 32-character alphabet', () => {
    // 256 / 32 is exact, so `byte % 32` introduces no modulo bias. A skewed
    // alphabet would shrink the effective key space of a verification code.
    const counts = new Map<string, number>();
    for (const char of Array.from({ length: 4000 }, () => generatePublicId()).join('')) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    const expected = (4000 * 12) / 32;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.25);
    }
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generatePublicId()));
    expect(ids.size).toBe(500);
  });
});

describe('formatCertificateNumber', () => {
  it('builds a readable tenant-scoped number', () => {
    expect(
      formatCertificateNumber({ organizationSlug: 'acme', issuedAt: NOW, sequence: 123 }),
    ).toBe('ACME-2026-000123');
  });

  it('normalises awkward slugs', () => {
    expect(
      formatCertificateNumber({ organizationSlug: 'acme co. ltd', issuedAt: NOW, sequence: 1 }),
    ).toBe('ACME-CO-LTD-2026-000001');
  });

  it('falls back when the slug has no usable characters', () => {
    expect(formatCertificateNumber({ organizationSlug: '---', issuedAt: NOW, sequence: 7 })).toBe(
      'ORG-2026-000007',
    );
  });
});

describe('integrity hash', () => {
  it('verifies an untouched certificate', () => {
    const cert = certificate();
    expect(verifyCertificateIntegrity(SECRET, cert, cert.integrityHash)).toBe(true);
  });

  it('detects a changed learner name', () => {
    const cert = certificate();
    expect(
      verifyCertificateIntegrity(
        SECRET,
        { ...cert, learnerName: 'Someone Else' },
        cert.integrityHash,
      ),
    ).toBe(false);
  });

  it('detects a changed completion date', () => {
    const cert = certificate();
    expect(
      verifyCertificateIntegrity(
        SECRET,
        { ...cert, completedAt: new Date('2020-01-01T00:00:00Z') },
        cert.integrityHash,
      ),
    ).toBe(false);
  });

  it('detects an extended expiry', () => {
    const cert = certificate();
    expect(
      verifyCertificateIntegrity(
        SECRET,
        { ...cert, expiresAt: new Date('2099-01-01T00:00:00Z') },
        cert.integrityHash,
      ),
    ).toBe(false);
  });

  it('fails under a different signing secret', () => {
    const cert = certificate();
    expect(
      verifyCertificateIntegrity('another-secret-entirely-0123456789', cert, cert.integrityHash),
    ).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    const cert = certificate();
    expect(verifyCertificateIntegrity(SECRET, cert, 'nonsense')).toBe(false);
    expect(verifyCertificateIntegrity(SECRET, cert, '')).toBe(false);
  });

  it('is not confused by field boundaries', () => {
    // "John" + "Smith Ltd" must not hash the same as "John Smith" + "Ltd".
    const a = certificateIntegrityHash(SECRET, {
      ...fields,
      learnerName: 'John',
      courseTitle: 'Smith Ltd',
    });
    const b = certificateIntegrityHash(SECRET, {
      ...fields,
      learnerName: 'John Smith',
      courseTitle: 'Ltd',
    });
    expect(a).not.toBe(b);
  });
});

describe('verification URL', () => {
  it('uses the public id, never an internal id', () => {
    const url = buildVerificationUrl('https://app.olbos.test/', fields.publicId);
    expect(url).toBe('https://app.olbos.test/verify/certificate/ABCD2345EFGH');
    expect(url).not.toContain('org-1');
    expect(url).not.toContain('emp-1');
  });
});

describe('classifyCertificate', () => {
  it('is VALID before expiry', () => {
    expect(classifyCertificate(certificate(), NOW)).toBe('VALID');
  });

  it('is EXPIRED after expiry', () => {
    expect(
      classifyCertificate(certificate({ expiresAt: new Date('2026-01-01T00:00:00Z') }), NOW),
    ).toBe('EXPIRED');
  });

  it('is REVOKED once revoked, even before expiry', () => {
    expect(classifyCertificate(certificate({ revokedAt: NOW }), NOW)).toBe('REVOKED');
  });

  it('is SUPERSEDED when replaced', () => {
    expect(classifyCertificate(certificate({ status: 'SUPERSEDED' }), NOW)).toBe('SUPERSEDED');
  });

  it('is VALID indefinitely with no expiry', () => {
    expect(classifyCertificate(certificate({ expiresAt: null }), NOW)).toBe('VALID');
  });
});

describe('public verification payload', () => {
  it('confirms a valid certificate', () => {
    const payload = buildVerificationPayload(certificate(), { secret: SECRET, now: NOW });
    expect(payload.result).toBe('VALID');
    expect(payload.learnerName).toBe('John Smith');
    expect(payload.organizationName).toBe('Acme Manufacturing');
    expect(payload.courseTitle).toBe('Lockout/Tagout');
    expect(payload.disclaimer).toBe('Awareness training disclaimer.');
    expect(payload.message).toMatch(/valid/i);
  });

  it('never exposes internal identifiers or the score', () => {
    const payload = buildVerificationPayload(certificate(), { secret: SECRET, now: NOW });
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('org-1');
    expect(serialised).not.toContain('emp-1');
    expect(serialised).not.toContain('cv-1');
    expect(serialised).not.toContain('92');
    expect(Object.keys(payload)).not.toContain('score');
    expect(Object.keys(payload)).not.toContain('employeeId');
  });

  it('reports a missing certificate without leaking whether the code was close', () => {
    const payload = buildVerificationPayload(null, { secret: SECRET, now: NOW });
    expect(payload.result).toBe('NOT_FOUND');
    expect(payload.learnerName).toBeUndefined();
  });

  it('reports a tampered row instead of serving altered content', () => {
    const cert = certificate();
    const tampered = { ...cert, learnerName: 'Impostor' };
    const payload = buildVerificationPayload(tampered, { secret: SECRET, now: NOW });
    expect(payload.result).toBe('TAMPERED');
    expect(payload.learnerName).toBeUndefined();
    expect(payload.message).toMatch(/integrity check/);
  });

  it('reports revocation with the date', () => {
    const payload = buildVerificationPayload(certificate({ revokedAt: NOW, status: 'REVOKED' }), {
      secret: SECRET,
      now: NOW,
    });
    expect(payload.result).toBe('REVOKED');
    expect(payload.revokedAt).toBe(NOW.toISOString());
    expect(payload.message).toMatch(/revoked/);
  });

  it('reports expiry but still confirms the training happened', () => {
    const payload = buildVerificationPayload(
      certificate({ expiresAt: new Date('2026-01-01T00:00:00Z') }),
      { secret: SECRET, now: NOW },
    );
    expect(payload.result).toBe('EXPIRED');
    expect(payload.completedAt).toBe(fields.completedAt.toISOString());
    expect(payload.message).toMatch(/validly issued/);
  });

  it('stamps the time of verification', () => {
    const payload = buildVerificationPayload(certificate(), { secret: SECRET, now: NOW });
    expect(payload.verifiedAt).toBe(NOW.toISOString());
  });
});
