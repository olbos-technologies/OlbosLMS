import { describe, expect, it } from 'vitest';
import { addDays } from './dates.js';
import {
  computeComplianceState,
  computeDueDate,
  diffRequirements,
  effectiveHazardExposures,
  isCompliant,
  requirementApplies,
  resolveRequirements,
  type EmployeeAttributes,
  type RequirementRule,
} from './requirements.js';

const NOW = new Date('2026-06-01T12:00:00Z');

const employee = (overrides: Partial<EmployeeAttributes> = {}): EmployeeAttributes => ({
  id: 'emp-1',
  status: 'ACTIVE',
  departmentId: 'dept-maintenance',
  locationId: 'loc-plant-1',
  jobRoleId: 'role-maintenance-tech',
  employmentType: 'FULL_TIME',
  shift: 'Night',
  hireDate: new Date('2024-03-15T00:00:00Z'),
  hazardExposures: ['confined-space'],
  equipmentAuthorizations: ['forklift'],
  jobRoleHazardExposures: ['electrical', 'hazardous-energy'],
  ...overrides,
});

const rule = (overrides: Partial<RequirementRule> = {}): RequirementRule => ({
  id: 'req-1',
  courseId: 'course-1',
  name: 'Requirement',
  scopeType: 'ORGANIZATION',
  isActive: true,
  dueWithinDays: 30,
  ...overrides,
});

describe('requirement scoping', () => {
  it('applies an organization-wide requirement to everyone', () => {
    expect(requirementApplies(rule(), employee(), NOW)).toBe(true);
  });

  it('matches on department', () => {
    const r = rule({ scopeType: 'DEPARTMENT', departmentId: 'dept-maintenance' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ departmentId: 'dept-office' }), NOW)).toBe(false);
  });

  it('matches on location', () => {
    const r = rule({ scopeType: 'LOCATION', locationId: 'loc-plant-1' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ locationId: 'loc-plant-2' }), NOW)).toBe(false);
  });

  it('matches on job role', () => {
    const r = rule({ scopeType: 'JOB_ROLE', jobRoleId: 'role-maintenance-tech' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ jobRoleId: 'role-driver' }), NOW)).toBe(false);
  });

  it('matches on employment type', () => {
    const r = rule({ scopeType: 'EMPLOYMENT_TYPE', employmentType: 'CONTRACT' });
    expect(requirementApplies(r, employee(), NOW)).toBe(false);
    expect(requirementApplies(r, employee({ employmentType: 'CONTRACT' }), NOW)).toBe(true);
  });

  it('matches shift case-insensitively', () => {
    const r = rule({ scopeType: 'SHIFT', shift: 'night' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ shift: 'Day' }), NOW)).toBe(false);
  });

  it('matches hazard exposure from either the employee or their job role', () => {
    expect(
      requirementApplies(
        rule({ scopeType: 'HAZARD_EXPOSURE', hazardExposure: 'electrical' }),
        employee(),
        NOW,
      ),
    ).toBe(true);
    expect(
      requirementApplies(
        rule({ scopeType: 'HAZARD_EXPOSURE', hazardExposure: 'confined-space' }),
        employee(),
        NOW,
      ),
    ).toBe(true);
    expect(
      requirementApplies(
        rule({ scopeType: 'HAZARD_EXPOSURE', hazardExposure: 'radiation' }),
        employee(),
        NOW,
      ),
    ).toBe(false);
  });

  it('merges job-role hazards with employee-specific ones', () => {
    expect(effectiveHazardExposures(employee()).sort()).toEqual([
      'confined-space',
      'electrical',
      'hazardous-energy',
    ]);
  });

  it('matches equipment authorization', () => {
    const r = rule({ scopeType: 'EQUIPMENT_AUTHORIZATION', equipmentKey: 'forklift' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ equipmentAuthorizations: [] }), NOW)).toBe(false);
  });

  it('matches an individual assignment', () => {
    const r = rule({ scopeType: 'INDIVIDUAL', employeeId: 'emp-1' });
    expect(requirementApplies(r, employee(), NOW)).toBe(true);
    expect(requirementApplies(r, employee({ id: 'emp-2' }), NOW)).toBe(false);
  });

  it('never applies to a terminated employee', () => {
    expect(requirementApplies(rule(), employee({ status: 'TERMINATED' }), NOW)).toBe(false);
  });

  it('respects the active flag and effective window', () => {
    expect(requirementApplies(rule({ isActive: false }), employee(), NOW)).toBe(false);
    expect(
      requirementApplies(
        rule({ effectiveFrom: new Date('2026-07-01T00:00:00Z') }),
        employee(),
        NOW,
      ),
    ).toBe(false);
    expect(
      requirementApplies(
        rule({ effectiveUntil: new Date('2026-05-01T00:00:00Z') }),
        employee(),
        NOW,
      ),
    ).toBe(false);
  });

  it('fails closed on an unrecognised scope', () => {
    const bad = { ...rule(), scopeType: 'ASTROLOGICAL_SIGN' } as unknown as RequirementRule;
    expect(requirementApplies(bad, employee(), NOW)).toBe(false);
  });
});

describe('job change recalculation', () => {
  const rules: RequirementRule[] = [
    rule({ id: 'hazcom', courseId: 'c-hazcom', scopeType: 'ORGANIZATION' }),
    rule({
      id: 'loto',
      courseId: 'c-loto',
      scopeType: 'JOB_ROLE',
      jobRoleId: 'role-maintenance-tech',
    }),
    rule({
      id: 'electrical',
      courseId: 'c-elec',
      scopeType: 'HAZARD_EXPOSURE',
      hazardExposure: 'electrical',
    }),
    rule({
      id: 'forklift',
      courseId: 'c-fork',
      scopeType: 'EQUIPMENT_AUTHORIZATION',
      equipmentKey: 'forklift',
    }),
    rule({
      id: 'office-ergo',
      courseId: 'c-ergo',
      scopeType: 'DEPARTMENT',
      departmentId: 'dept-office',
    }),
  ];

  it('resolves the requirements for a maintenance technician', () => {
    const applicable = resolveRequirements(rules, employee(), NOW).map((r) => r.id);
    expect(applicable.sort()).toEqual(['electrical', 'forklift', 'hazcom', 'loto']);
  });

  it('produces added and removed sets when the employee moves to a new role', () => {
    const before = resolveRequirements(rules, employee(), NOW).map((r) => r.id);
    const moved = employee({
      jobRoleId: 'role-clerk',
      departmentId: 'dept-office',
      jobRoleHazardExposures: [],
      hazardExposures: [],
      equipmentAuthorizations: [],
    });
    const after = resolveRequirements(rules, moved, NOW);

    const diff = diffRequirements(before, after);
    expect(diff.added.map((r) => r.id)).toEqual(['office-ergo']);
    expect(diff.removed.sort()).toEqual(['electrical', 'forklift', 'loto']);
    expect(diff.unchanged).toEqual(['hazcom']);
  });
});

describe('computeDueDate', () => {
  it('adds the grace period to the assignment date', () => {
    const due = computeDueDate(rule({ dueWithinDays: 30 }), { assignedAt: NOW });
    expect(due?.toISOString()).toBe(addDays(NOW, 30).toISOString());
  });

  it('returns null when the requirement sets no deadline', () => {
    expect(computeDueDate(rule({ dueWithinDays: null }), { assignedAt: NOW })).toBeNull();
  });

  it('measures from the hire date for a future new starter', () => {
    const hireDate = new Date('2026-07-01T00:00:00Z');
    const due = computeDueDate(rule({ dueWithinDays: 14 }), { assignedAt: NOW, hireDate });
    expect(due?.toISOString()).toBe(addDays(hireDate, 14).toISOString());
  });
});

describe('compliance state machine', () => {
  const base = {
    requirementId: 'req-1',
    courseId: 'course-1',
    employeeId: 'emp-1',
    applicable: true,
    now: NOW,
  };

  it('is MISSING with no assignment and no record', () => {
    const result = computeComplianceState(base);
    expect(result.status).toBe('MISSING');
    expect(result.explanation).toMatch(/No training assignment/);
  });

  it('is PENDING when assigned and not yet due', () => {
    const result = computeComplianceState({
      ...base,
      assignment: { id: 'a1', status: 'ASSIGNED', dueAt: addDays(NOW, 10) },
    });
    expect(result.status).toBe('PENDING');
    expect(result.isOverdue).toBe(false);
  });

  it('is MISSING and overdue when assigned and past due', () => {
    const result = computeComplianceState({
      ...base,
      assignment: { id: 'a1', status: 'ASSIGNED', dueAt: addDays(NOW, -5) },
    });
    expect(result.status).toBe('MISSING');
    expect(result.isOverdue).toBe(true);
    expect(result.daysOverdue).toBe(5);
  });

  it('is IN_PROGRESS once started', () => {
    const result = computeComplianceState({
      ...base,
      assignment: { id: 'a1', status: 'IN_PROGRESS', dueAt: addDays(NOW, 5), startedAt: NOW },
    });
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('is CURRENT with a valid, unexpired record', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -30),
        expiresAt: addDays(NOW, 335),
        passed: true,
      },
    });
    expect(result.status).toBe('CURRENT');
    expect(result.daysUntilExpiry).toBe(335);
    expect(isCompliant(result.status)).toBe(true);
  });

  it('is CURRENT forever when the training does not expire', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: new Date('2015-01-01T00:00:00Z'),
        expiresAt: null,
        passed: true,
      },
    });
    expect(result.status).toBe('CURRENT');
    expect(result.explanation).toMatch(/does not expire/);
  });

  it('is EXPIRING_SOON inside the warning window', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -350),
        expiresAt: addDays(NOW, 15),
        passed: true,
      },
    });
    expect(result.status).toBe('EXPIRING_SOON');
    expect(result.daysUntilExpiry).toBe(15);
  });

  it('is EXPIRED after the expiry date', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -400),
        expiresAt: addDays(NOW, -35),
        passed: true,
      },
    });
    expect(result.status).toBe('EXPIRED');
    expect(result.isOverdue).toBe(true);
    expect(isCompliant(result.status)).toBe(false);
  });

  it('ignores a voided record', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -30),
        expiresAt: addDays(NOW, 335),
        passed: true,
        voidedAt: NOW,
      },
    });
    expect(result.status).toBe('MISSING');
  });

  it('ignores a superseded record', () => {
    const result = computeComplianceState({
      ...base,
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -30),
        expiresAt: addDays(NOW, 335),
        passed: true,
        supersededAt: NOW,
      },
    });
    expect(result.status).toBe('MISSING');
  });

  it('ignores a failed record', () => {
    const result = computeComplianceState({
      ...base,
      record: { id: 'r1', completedAt: addDays(NOW, -1), expiresAt: null, passed: false },
    });
    expect(result.status).toBe('MISSING');
  });

  it('is NOT_APPLICABLE when the requirement does not apply', () => {
    const result = computeComplianceState({ ...base, applicable: false });
    expect(result.status).toBe('NOT_APPLICABLE');
  });

  it('is NOT_APPLICABLE when an administrator waived it', () => {
    const result = computeComplianceState({
      ...base,
      assignment: { id: 'a1', status: 'WAIVED', waivedAt: NOW, dueAt: addDays(NOW, -30) },
    });
    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.explanation).toMatch(/waived/);
  });

  it('uses the organization warning ladder', () => {
    const result = computeComplianceState({
      ...base,
      warningIntervalDays: [7],
      record: {
        id: 'r1',
        completedAt: addDays(NOW, -350),
        expiresAt: addDays(NOW, 15),
        passed: true,
      },
    });
    expect(result.status).toBe('CURRENT');
  });
});
