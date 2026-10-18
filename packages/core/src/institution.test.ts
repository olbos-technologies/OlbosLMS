import { describe, expect, it } from 'vitest';
import { buildInstitutionSetup } from './institution.js';
describe('Institution onboarding progress', () => {
  it('shows an empty institution as pending', () => {
    const rows = buildInstitutionSetup({
      profileReady: false,
      administrators: 0,
      programs: 0,
      terms: 0,
      courses: 0,
      sections: 0,
    });
    expect(rows).toHaveLength(6);
    expect(rows.some((row) => row.complete)).toBe(false);
  });
  it('reflects each saved milestone independently', () => {
    const rows = buildInstitutionSetup({
      profileReady: true,
      administrators: 1,
      programs: 2,
      terms: 1,
      courses: 0,
      sections: 0,
    });
    expect(rows.filter((row) => row.complete).map((row) => row.key)).toEqual([
      'profile',
      'administrators',
      'programs',
      'terms',
    ]);
    expect(rows.find((row) => row.key === 'courses')?.complete).toBe(false);
  });
});
