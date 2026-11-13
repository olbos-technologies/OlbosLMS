import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, isPermission, type Permission } from './permissions.js';
import { ROLE_TEMPLATES } from './roles.js';
import {
  assertCan,
  authorize,
  can,
  effectivePermissions,
  ForbiddenError,
  resolveVisibility,
  scopeFilterFor,
  VISIBILITY_LADDERS,
  type AccessContext,
  type RoleAssignment,
} from './policy.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

const roleOf = (
  key: keyof typeof ROLE_TEMPLATES,
  overrides: Partial<RoleAssignment> = {},
): RoleAssignment => ({
  key,
  permissions: ROLE_TEMPLATES[key].permissions,
  scopeType: 'ORGANIZATION',
  ...overrides,
});

const ctxFor = (
  key: keyof typeof ROLE_TEMPLATES,
  overrides: Partial<AccessContext> = {},
  roleOverrides: Partial<RoleAssignment> = {},
): AccessContext => ({
  userId: 'user-1',
  organizationId: ORG,
  platformRole: 'NONE',
  roles: [roleOf(key, roleOverrides)],
  employeeId: 'emp-1',
  ...overrides,
});

describe('permission catalogue', () => {
  it('has unique slugs', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('validates slugs', () => {
    expect(isPermission('course:read')).toBe(true);
    expect(isPermission('course:teleport')).toBe(false);
  });

  it('grants every non-platform permission to the organization owner', () => {
    const owner = ctxFor('ORG_OWNER');
    const nonPlatform = ALL_PERMISSIONS.filter((p) => !p.startsWith('platform:'));
    const denied = nonPlatform.filter((p) => !can(owner, p));
    expect(denied).toEqual([]);
  });

  it('never grants platform permissions to a tenant role', () => {
    for (const template of Object.values(ROLE_TEMPLATES)) {
      expect(template.permissions.filter((p) => p.startsWith('platform:'))).toEqual([]);
    }
  });
});

describe('tenant isolation in authorization', () => {
  it('denies access to a resource from another organization', () => {
    const decision = authorize(ctxFor('ORG_OWNER'), 'course:read', { organizationId: OTHER_ORG });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('cross-tenant');
  });

  it('allows access to a resource from the caller organization', () => {
    expect(can(ctxFor('ORG_OWNER'), 'course:read', { organizationId: ORG })).toBe(true);
  });

  it('denies a tenant permission to an account with no organization', () => {
    const decision = authorize(
      { userId: 'u', organizationId: null, platformRole: 'NONE', roles: [] },
      'course:read',
    );
    expect(decision.reason).toBe('no-tenant-context');
  });
});

describe('platform roles', () => {
  const platformOwner: AccessContext = {
    userId: 'p-1',
    organizationId: null,
    platformRole: 'PLATFORM_OWNER',
    roles: [],
  };

  it('grants platform permissions', () => {
    expect(can(platformOwner, 'platform:manage_organizations')).toBe(true);
    expect(can(platformOwner, 'platform:manage_plans')).toBe(true);
  });

  it('does not grant tenant permissions without a tenant membership', () => {
    expect(can(platformOwner, 'training_record:read')).toBe(false);
  });

  it('gives a platform administrator support access but not plan management', () => {
    const admin: AccessContext = { ...platformOwner, platformRole: 'PLATFORM_ADMINISTRATOR' };
    expect(can(admin, 'platform:support')).toBe(true);
    expect(can(admin, 'platform:manage_plans')).toBe(false);
  });

  it('refuses a platform permission to an ordinary tenant user', () => {
    expect(can(ctxFor('ORG_OWNER'), 'platform:manage_organizations')).toBe(false);
  });
});

describe('self-scoped permissions', () => {
  const learner = ctxFor('LEARNER');

  it('lets a learner read their own training record', () => {
    expect(can(learner, 'training_record:read_own', { subjectEmployeeId: 'emp-1' })).toBe(true);
  });

  it('refuses a learner another employee record', () => {
    const decision = authorize(learner, 'training_record:read_own', { subjectEmployeeId: 'emp-2' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('not-self');
  });

  it('refuses a learner the organization-wide read', () => {
    expect(can(learner, 'training_record:read')).toBe(false);
  });

  it('lets an EHS administrator read anyone via the broader permission', () => {
    const ehs = ctxFor('EHS_ADMINISTRATOR');
    expect(can(ehs, 'training_record:read_own', { subjectEmployeeId: 'emp-999' })).toBe(true);
  });
});

describe('supervisor team scope', () => {
  const supervisor = ctxFor('SUPERVISOR', { supervisedEmployeeIds: ['emp-2', 'emp-3'] });

  it('allows records for a supervised employee', () => {
    expect(can(supervisor, 'training_record:read_team', { subjectEmployeeId: 'emp-2' })).toBe(true);
  });

  it('refuses records for someone outside the team', () => {
    const decision = authorize(supervisor, 'training_record:read_team', {
      subjectEmployeeId: 'emp-9',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('not-on-team');
  });

  it('allows the supervisor their own record', () => {
    expect(can(supervisor, 'training_record:read_team', { subjectEmployeeId: 'emp-1' })).toBe(true);
  });

  it('reports a team constraint so list endpoints filter', () => {
    const { permission, filter } = resolveVisibility(
      supervisor,
      VISIBILITY_LADDERS.trainingRecords,
    );
    expect(permission).toBe('training_record:read_team');
    expect(filter.granted).toBe(true);
    expect(filter.teamOnly).toBe(true);
    expect(filter.unrestricted).toBe(false);
  });

  it('resolves an EHS administrator to unrestricted visibility', () => {
    const { permission, filter } = resolveVisibility(
      ctxFor('EHS_ADMINISTRATOR'),
      VISIBILITY_LADDERS.trainingRecords,
    );
    expect(permission).toBe('training_record:read');
    expect(filter.unrestricted).toBe(true);
  });

  it('resolves a learner to their own records only', () => {
    const { permission, filter } = resolveVisibility(
      ctxFor('LEARNER'),
      VISIBILITY_LADDERS.trainingRecords,
    );
    expect(permission).toBe('training_record:read_own');
    expect(filter.selfOnly).toBe(true);
  });
});

describe('department-scoped roles', () => {
  const deptAdmin = ctxFor('HR_ADMINISTRATOR', {}, { scopeType: 'DEPARTMENT', scopeId: 'dept-a' });

  it('allows a resource inside the scope', () => {
    expect(can(deptAdmin, 'employee:update', { departmentId: 'dept-a' })).toBe(true);
  });

  it('refuses a resource outside the scope', () => {
    const decision = authorize(deptAdmin, 'employee:update', { departmentId: 'dept-b' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('out-of-scope');
  });

  it('reports the scope so list endpoints can filter', () => {
    const filter = scopeFilterFor(deptAdmin, 'employee:read');
    expect(filter.unrestricted).toBe(false);
    expect(filter.departmentIds).toEqual(['dept-a']);
  });

  it('treats an organization-scoped grant as unrestricted', () => {
    const filter = scopeFilterFor(ctxFor('HR_ADMINISTRATOR'), 'employee:read');
    expect(filter.unrestricted).toBe(true);
  });
});

describe('permission implication', () => {
  it('satisfies a narrower permission with a broader grant', () => {
    const instructor = ctxFor('INSTRUCTOR');
    expect(can(instructor, 'course:read')).toBe(true);
    expect(can(instructor, 'quiz:read')).toBe(true);
    expect(can(instructor, 'grade:read')).toBe(true);
  });

  it('does not invent grants in the other direction', () => {
    const learner = ctxFor('LEARNER');
    expect(can(learner, 'course:update')).toBe(false);
    expect(can(learner, 'grade:record')).toBe(false);
  });

  it('lists effective permissions including implied ones', () => {
    const permissions = effectivePermissions(ctxFor('SAFETY_TRAINER'));
    expect(permissions).toContain('certificate:issue');
    expect(permissions).toContain('certificate:read');
    expect(permissions).not.toContain('billing:manage');
  });
});

describe('role separation', () => {
  const expectations: [keyof typeof ROLE_TEMPLATES, Permission[], Permission[]][] = [
    [
      'HR_ADMINISTRATOR',
      ['employee:create', 'training_record:read', 'compliance:read'],
      ['incident:investigate', 'course:publish', 'billing:manage'],
    ],
    [
      'EHS_ADMINISTRATOR',
      ['training_matrix:read', 'incident:investigate', 'certificate:revoke', 'jha:manage'],
      ['user:create', 'billing:manage', 'security:manage'],
    ],
    [
      'INSTRUCTOR',
      ['course:publish', 'grade:override', 'quiz:manage'],
      ['employee:create', 'incident:investigate', 'certificate:revoke'],
    ],
    [
      'SAFETY_TRAINER',
      ['certificate:issue', 'practical_assessment:record', 'attendance:record'],
      ['certificate:revoke', 'training_requirement:manage', 'user:create'],
    ],
    [
      'TEACHING_ASSISTANT',
      ['grade:record', 'discussion:moderate'],
      ['course:publish', 'grade:override', 'quiz:manage'],
    ],
    [
      'SUPERVISOR',
      ['training_assignment:create', 'training_matrix:read'],
      ['employee:create', 'training_record:create', 'course:update'],
    ],
    [
      'LEARNER',
      ['quiz:attempt', 'submission:create', 'certificate:read_own'],
      ['grade:read', 'employee:read', 'training_record:read', 'certificate:issue'],
    ],
  ];

  for (const [role, allowed, denied] of expectations) {
    it(`${role} holds the right permissions`, () => {
      const ctx = ctxFor(role);
      for (const permission of allowed) {
        expect(`${role}:${permission}=${can(ctx, permission)}`).toBe(`${role}:${permission}=true`);
      }
      for (const permission of denied) {
        expect(`${role}:${permission}=${can(ctx, permission)}`).toBe(`${role}:${permission}=false`);
      }
    });
  }
});

describe('assertCan', () => {
  it('returns the decision when allowed', () => {
    expect(assertCan(ctxFor('ORG_OWNER'), 'course:read').allowed).toBe(true);
  });

  it('throws a ForbiddenError when denied', () => {
    expect(() => assertCan(ctxFor('LEARNER'), 'billing:manage')).toThrow(ForbiddenError);
    try {
      assertCan(ctxFor('LEARNER'), 'billing:manage');
    } catch (error) {
      expect((error as ForbiddenError).statusCode).toBe(403);
      expect((error as ForbiddenError).decision.reason).toBe('missing-permission');
    }
  });
});
