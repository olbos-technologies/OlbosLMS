import { describe, expect, it } from 'vitest';
import {
  checkRepresentation,
  disclaimerFor,
  findRestrictedClaims,
  TRAINING_TYPES,
} from './representation.js';

describe('training type catalogue', () => {
  it('describes every representation the product supports', () => {
    expect(Object.keys(TRAINING_TYPES).sort()).toEqual([
      'CERTIFICATION',
      'COMPANY_POLICY_TRAINING',
      'CREDENTIAL',
      'ORGANIZATION_TRAINING',
      'OSHA_OUTREACH_TRAINING',
      'REGULATORY_TRAINING',
      'SAFETY_AWARENESS_TRAINING',
      'THIRD_PARTY_TRAINING',
    ]);
  });

  it('gives every type a disclaimer', () => {
    for (const definition of Object.values(TRAINING_TYPES)) {
      expect(definition.defaultDisclaimer.length).toBeGreaterThan(20);
    }
  });

  it('requires evidence only for externally authorised types', () => {
    expect(TRAINING_TYPES.ORGANIZATION_TRAINING.requiresAuthorizationEvidence).toBe(false);
    expect(TRAINING_TYPES.SAFETY_AWARENESS_TRAINING.requiresAuthorizationEvidence).toBe(false);
    expect(TRAINING_TYPES.OSHA_OUTREACH_TRAINING.requiresAuthorizationEvidence).toBe(true);
    expect(TRAINING_TYPES.CERTIFICATION.requiresAuthorizationEvidence).toBe(true);
    expect(TRAINING_TYPES.THIRD_PARTY_TRAINING.requiresAuthorizationEvidence).toBe(true);
  });
});

describe('restricted authorisation claims', () => {
  it('flags OSHA approval and certification claims', () => {
    expect(findRestrictedClaims('OSHA-approved Forklift Course')).toHaveLength(1);
    expect(findRestrictedClaims('OSHA Certified Safety Training')).toHaveLength(1);
    expect(findRestrictedClaims('OSHA accredited programme')).toHaveLength(1);
  });

  it('flags an OSHA-authorized claim in free text', () => {
    expect(findRestrictedClaims('OSHA authorized instructor course')[0]).toMatch(
      /individual trainer can be OSHA-authorized/,
    );
  });

  it('flags government approval and compliance guarantees', () => {
    expect(findRestrictedClaims('Federally approved training')).toHaveLength(1);
    expect(findRestrictedClaims('This course guarantees compliance')).toHaveLength(1);
  });

  it('leaves accurate descriptions alone', () => {
    expect(findRestrictedClaims('Lockout/Tagout Awareness Training')).toEqual([]);
    expect(
      findRestrictedClaims('Covers the topics in 29 CFR 1910.147 as identified by our EHS team'),
    ).toEqual([]);
    expect(findRestrictedClaims('OSHA Outreach Training Program 10-Hour General Industry')).toEqual(
      [],
    );
  });
});

describe('checkRepresentation', () => {
  it('accepts ordinary organization training', () => {
    const result = checkRepresentation({
      trainingType: 'ORGANIZATION_TRAINING',
      title: 'Forklift Safety Awareness',
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.disclaimer).toMatch(/not a government-issued credential/);
  });

  it('rejects an OSHA approval claim in a course title', () => {
    const result = checkRepresentation({
      trainingType: 'SAFETY_AWARENESS_TRAINING',
      title: 'OSHA Certified Forklift Course',
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/does not approve, certify or accredit/);
  });

  it('states plainly that awareness training is not an OSHA course', () => {
    expect(disclaimerFor('SAFETY_AWARENESS_TRAINING')).toMatch(
      /not an OSHA course, is not OSHA-approved/,
    );
  });

  it('refuses OSHA Outreach training without trainer authorization details', () => {
    const result = checkRepresentation({
      trainingType: 'OSHA_OUTREACH_TRAINING',
      title: 'OSHA 10-Hour General Industry',
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(2);
    expect(result.problems.join(' ')).toMatch(/authorised provider, trainer or certifying body/);
    expect(result.problems.join(' ')).toMatch(/authorization identifier/);
  });

  it('accepts OSHA Outreach training with documented authorization', () => {
    const result = checkRepresentation({
      trainingType: 'OSHA_OUTREACH_TRAINING',
      title: 'OSHA 10-Hour General Industry',
      evidence: { providerName: 'Jordan Reyes', authorizationId: 'OSHA-TRN-12345' },
    });
    expect(result.ok).toBe(true);
    expect(result.disclaimer).toMatch(/not issued by OLBOS|are issued by the authorized trainer/i);
  });

  it('refuses an expired authorization', () => {
    const result = checkRepresentation({
      trainingType: 'CERTIFICATION',
      evidence: {
        providerName: 'Certifying Body',
        authorizationId: 'CB-1',
        authorizationExpiresAt: new Date('2025-01-01T00:00:00Z'),
      },
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/expired on 2025-01-01/);
  });

  it('never lets a regulatory course imply an agency endorsement', () => {
    const result = checkRepresentation({ trainingType: 'REGULATORY_TRAINING' });
    expect(result.ok).toBe(true);
    expect(result.disclaimer).toMatch(/not issued, approved or endorsed by any regulatory agency/);
    expect(result.disclaimer).toMatch(
      /does not constitute a determination of regulatory compliance/,
    );
  });

  it('appends the organization disclaimer without replacing the built-in one', () => {
    const result = checkRepresentation({
      trainingType: 'ORGANIZATION_TRAINING',
      organizationDisclaimer: 'Questions? Contact EHS at ext. 4100.',
    });
    expect(result.disclaimer).toMatch(/not a government-issued credential/);
    expect(result.disclaimer).toMatch(/ext\. 4100/);
  });

  it('deduplicates repeated problems across title and description', () => {
    const result = checkRepresentation({
      trainingType: 'ORGANIZATION_TRAINING',
      title: 'OSHA approved course',
      description: 'This OSHA approved course teaches...',
    });
    expect(result.problems).toHaveLength(1);
  });
});
