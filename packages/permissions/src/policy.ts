import {
  SELF_SCOPED_PERMISSIONS,
  TEAM_SCOPED_PERMISSIONS,
  type Permission,
} from './permissions.js';
import { PLATFORM_ROLE_PERMISSIONS, type PlatformRole, type RoleKey } from './roles.js';

/**
 * The authorization engine.
 *
 * Every backend endpoint calls `authorize()`; the frontend calls the same
 * function to decide what to render, but a hidden button is never the control —
 * the API always re-checks. Decisions carry a `reason` so that a denial can be
 * explained in logs and support tooling without guesswork.
 */

export type RoleScopeType = 'ORGANIZATION' | 'DEPARTMENT' | 'LOCATION' | 'COURSE';

export interface RoleAssignment {
  readonly roleId?: string;
  readonly key: RoleKey;
  readonly permissions: readonly Permission[];
  readonly scopeType: RoleScopeType;
  readonly scopeId?: string | null;
}

export interface AccessContext {
  readonly userId: string;
  /** Null for platform staff, who belong to no tenant. */
  readonly organizationId: string | null;
  readonly platformRole: PlatformRole;
  readonly roles: readonly RoleAssignment[];
  /** The employee record for this user, when one exists. */
  readonly employeeId?: string | null;
  /** Employees this user supervises, direct and indirect. */
  readonly supervisedEmployeeIds?: readonly string[];
}

/** The thing being acted on. Every field is optional: list endpoints have none. */
export interface ResourceRef {
  readonly organizationId?: string | null;
  readonly departmentId?: string | null;
  readonly locationId?: string | null;
  readonly courseId?: string | null;
  /** The user this resource is about (their grade, their certificate). */
  readonly subjectUserId?: string | null;
  /** The employee this resource is about. */
  readonly subjectEmployeeId?: string | null;
}

export type DenialReason =
  | 'no-tenant-context'
  | 'cross-tenant'
  | 'missing-permission'
  | 'out-of-scope'
  | 'not-self'
  | 'not-on-team';

export interface Decision {
  readonly allowed: boolean;
  readonly reason: DenialReason | 'granted';
  /** Which grant allowed it — useful for audit logging and debugging. */
  readonly via?: {
    readonly permission: Permission;
    readonly roleKey: RoleKey | 'PLATFORM';
    readonly scopeType: RoleScopeType | 'PLATFORM';
    readonly scopeId?: string | null;
  };
  /**
   * Set when the grant is narrower than the whole tenant. List endpoints must
   * apply this as a filter; single-resource endpoints have already been checked.
   */
  readonly constraint?: 'self' | 'team' | 'department' | 'location' | 'course';
  readonly message?: string;
}

/**
 * Broader permissions that satisfy narrower ones. Checked instead of forcing
 * every call site to enumerate alternatives.
 */
const IMPLICATIONS: Partial<Record<Permission, readonly Permission[]>> = {
  'employee:read': ['employee:read_team', 'employee:read_own'],
  'employee:read_team': ['employee:read_own'],
  'training_record:read': ['training_record:read_team', 'training_record:read_own'],
  'training_record:read_team': ['training_record:read_own'],
  'training_assignment:read': ['training_assignment:read_own'],
  'compliance:read': ['compliance:read_team'],
  'grade:read': ['grade:read_own'],
  'certificate:read': ['certificate:read_own'],
  'certificate:issue': ['certificate:read'],
  'course:update': ['course:read'],
  'course:publish': ['course:read', 'course:update'],
  'quiz:manage': ['quiz:read'],
  'assignment:manage': ['assignment:read'],
  'question_bank:manage': ['question_bank:read'],
  'training_requirement:manage': ['training_requirement:read'],
  'training_session:manage': ['training_session:read'],
  'department:manage': ['department:read'],
  'location:manage': ['location:read'],
  'job_role:manage': ['job_role:read'],
  'role:manage': ['role:read'],
  'billing:manage': ['billing:read'],
  'integration:manage': ['integration:read'],
  'incident:investigate': ['incident:read'],
  'incident:close': ['incident:read', 'incident:investigate'],
  'corrective_action:manage': ['corrective_action:read'],
  'jha:manage': ['jha:read'],
  'observation:manage': ['observation:read'],
  'scenario:manage': ['scenario:read'],
  'practical_assessment:manage': ['practical_assessment:read'],
  'practical_assessment:record': ['practical_assessment:read'],
  'learning_path:manage': ['learning_path:read'],
  'enrollment:manage': ['enrollment:read'],
  'attendance:record': ['attendance:read'],
  'grade:override': ['grade:record', 'grade:read'],
  'grade:record': ['grade:read'],
};

/** Permissions that would satisfy `target`, broadest first. */
const impliedBy = (target: Permission): Permission[] => {
  const result: Permission[] = [];
  for (const [broader, narrower] of Object.entries(IMPLICATIONS) as [
    Permission,
    readonly Permission[],
  ][]) {
    if (narrower.includes(target)) result.push(broader);
  }
  return result;
};

const CANDIDATE_CACHE = new Map<Permission, Permission[]>();

/** `target` plus every permission that transitively implies it. */
export const permissionsSatisfying = (target: Permission): Permission[] => {
  const cached = CANDIDATE_CACHE.get(target);
  if (cached) return cached;

  const seen = new Set<Permission>([target]);
  const queue: Permission[] = [target];
  while (queue.length > 0) {
    const current = queue.shift() as Permission;
    for (const broader of impliedBy(current)) {
      if (!seen.has(broader)) {
        seen.add(broader);
        queue.push(broader);
      }
    }
  }
  const result = [...seen];
  CANDIDATE_CACHE.set(target, result);
  return result;
};

const scopeMatches = (
  assignment: RoleAssignment,
  resource: ResourceRef | undefined,
): { ok: boolean; constraint?: Decision['constraint'] } => {
  switch (assignment.scopeType) {
    case 'ORGANIZATION':
      return { ok: true };
    case 'DEPARTMENT':
      if (!resource || resource.departmentId === undefined)
        return { ok: true, constraint: 'department' };
      return { ok: resource.departmentId === assignment.scopeId, constraint: 'department' };
    case 'LOCATION':
      if (!resource || resource.locationId === undefined)
        return { ok: true, constraint: 'location' };
      return { ok: resource.locationId === assignment.scopeId, constraint: 'location' };
    case 'COURSE':
      if (!resource || resource.courseId === undefined) return { ok: true, constraint: 'course' };
      return { ok: resource.courseId === assignment.scopeId, constraint: 'course' };
    default:
      return { ok: false };
  }
};

const subjectIsSelf = (ctx: AccessContext, resource: ResourceRef | undefined): boolean => {
  if (!resource) return true;
  if (resource.subjectUserId != null) return resource.subjectUserId === ctx.userId;
  if (resource.subjectEmployeeId != null) {
    return ctx.employeeId != null && resource.subjectEmployeeId === ctx.employeeId;
  }
  return true;
};

const subjectIsOnTeam = (ctx: AccessContext, resource: ResourceRef | undefined): boolean => {
  if (!resource) return true;
  if (resource.subjectEmployeeId == null) return true;
  if (resource.subjectEmployeeId === ctx.employeeId) return true;
  return (ctx.supervisedEmployeeIds ?? []).includes(resource.subjectEmployeeId);
};

/** Core decision. Pure — no I/O, no database, fully unit testable. */
export const authorize = (
  ctx: AccessContext,
  permission: Permission,
  resource?: ResourceRef,
): Decision => {
  // Platform permissions live outside any tenant.
  const platformGrants = PLATFORM_ROLE_PERMISSIONS[ctx.platformRole] ?? [];
  if (platformGrants.includes(permission)) {
    return {
      allowed: true,
      reason: 'granted',
      via: { permission, roleKey: 'PLATFORM', scopeType: 'PLATFORM' },
    };
  }

  if (permission.startsWith('platform:')) {
    return {
      allowed: false,
      reason: 'missing-permission',
      message: `${permission} is platform-only`,
    };
  }

  if (!ctx.organizationId) {
    return {
      allowed: false,
      reason: 'no-tenant-context',
      message: 'This account is not a member of an organization',
    };
  }

  if (resource?.organizationId != null && resource.organizationId !== ctx.organizationId) {
    return {
      allowed: false,
      reason: 'cross-tenant',
      message: 'Resource belongs to a different organization',
    };
  }

  const candidates = permissionsSatisfying(permission);
  let sawPermission = false;
  let lastFailure: DenialReason = 'missing-permission';

  for (const candidate of candidates) {
    for (const assignment of ctx.roles) {
      if (!assignment.permissions.includes(candidate)) continue;
      sawPermission = true;

      const scope = scopeMatches(assignment, resource);
      if (!scope.ok) {
        lastFailure = 'out-of-scope';
        continue;
      }

      if (SELF_SCOPED_PERMISSIONS.has(candidate) && !subjectIsSelf(ctx, resource)) {
        lastFailure = 'not-self';
        continue;
      }

      if (TEAM_SCOPED_PERMISSIONS.has(candidate) && !subjectIsOnTeam(ctx, resource)) {
        lastFailure = 'not-on-team';
        continue;
      }

      const constraint: Decision['constraint'] | undefined = SELF_SCOPED_PERMISSIONS.has(candidate)
        ? 'self'
        : TEAM_SCOPED_PERMISSIONS.has(candidate)
          ? 'team'
          : scope.constraint;

      return {
        allowed: true,
        reason: 'granted',
        via: {
          permission: candidate,
          roleKey: assignment.key,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId ?? null,
        },
        ...(constraint ? { constraint } : {}),
      };
    }
  }

  return {
    allowed: false,
    reason: sawPermission ? lastFailure : 'missing-permission',
    message: sawPermission
      ? `Permission ${permission} is held but does not reach this resource`
      : `Permission ${permission} is not granted`,
  };
};

export const can = (ctx: AccessContext, permission: Permission, resource?: ResourceRef): boolean =>
  authorize(ctx, permission, resource).allowed;

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(
    readonly permission: Permission,
    readonly decision: Decision,
  ) {
    super(decision.message ?? `Forbidden: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

export const assertCan = (
  ctx: AccessContext,
  permission: Permission,
  resource?: ResourceRef,
): Decision => {
  const decision = authorize(ctx, permission, resource);
  if (!decision.allowed) throw new ForbiddenError(permission, decision);
  return decision;
};

/** Every permission the context effectively holds (used by the UI and /me). */
export const effectivePermissions = (ctx: AccessContext): Permission[] => {
  const held = new Set<Permission>(PLATFORM_ROLE_PERMISSIONS[ctx.platformRole] ?? []);
  for (const assignment of ctx.roles) {
    for (const permission of assignment.permissions) {
      held.add(permission);
      for (const narrower of IMPLICATIONS[permission] ?? []) held.add(narrower);
    }
  }
  return [...held].sort();
};

/**
 * The scope restrictions attached to a permission, so that list endpoints can
 * translate them into database filters instead of over-fetching and trimming.
 */
export interface ScopeFilter {
  /** False when the context does not hold the permission at all. */
  readonly granted: boolean;
  readonly unrestricted: boolean;
  readonly departmentIds: string[];
  readonly locationIds: string[];
  readonly courseIds: string[];
  readonly selfOnly: boolean;
  readonly teamOnly: boolean;
}

export const NO_ACCESS: ScopeFilter = Object.freeze({
  granted: false,
  unrestricted: false,
  departmentIds: [],
  locationIds: [],
  courseIds: [],
  selfOnly: false,
  teamOnly: false,
});

export const scopeFilterFor = (ctx: AccessContext, permission: Permission): ScopeFilter => {
  const departmentIds: string[] = [];
  const locationIds: string[] = [];
  const courseIds: string[] = [];
  let selfOnly = false;
  let teamOnly = false;
  let unrestricted = false;
  let granted = false;

  for (const candidate of permissionsSatisfying(permission)) {
    for (const assignment of ctx.roles) {
      if (!assignment.permissions.includes(candidate)) continue;
      granted = true;

      if (SELF_SCOPED_PERMISSIONS.has(candidate)) {
        selfOnly = true;
        continue;
      }
      if (TEAM_SCOPED_PERMISSIONS.has(candidate)) {
        teamOnly = true;
        continue;
      }
      switch (assignment.scopeType) {
        case 'ORGANIZATION':
          unrestricted = true;
          break;
        case 'DEPARTMENT':
          if (assignment.scopeId) departmentIds.push(assignment.scopeId);
          break;
        case 'LOCATION':
          if (assignment.scopeId) locationIds.push(assignment.scopeId);
          break;
        case 'COURSE':
          if (assignment.scopeId) courseIds.push(assignment.scopeId);
          break;
      }
    }
  }

  return {
    granted,
    unrestricted,
    departmentIds,
    locationIds,
    courseIds,
    selfOnly: selfOnly && !unrestricted,
    teamOnly: teamOnly && !unrestricted,
  };
};

/**
 * Standard visibility ladders, broadest first. A list endpoint resolves the
 * widest permission the caller actually holds and filters accordingly, instead
 * of guessing which variant to check.
 */
export const VISIBILITY_LADDERS = {
  employees: ['employee:read', 'employee:read_team', 'employee:read_own'],
  trainingRecords: [
    'training_record:read',
    'training_record:read_team',
    'training_record:read_own',
  ],
  trainingAssignments: ['training_assignment:read', 'training_assignment:read_own'],
  compliance: ['compliance:read', 'compliance:read_team'],
  certificates: ['certificate:read', 'certificate:read_own'],
  grades: ['grade:read', 'grade:read_own'],
} as const satisfies Record<string, readonly Permission[]>;

export interface Visibility {
  /** The widest permission in the ladder that the caller holds, if any. */
  readonly permission: Permission | null;
  readonly filter: ScopeFilter;
}

export const resolveVisibility = (
  ctx: AccessContext,
  ladder: readonly Permission[],
): Visibility => {
  for (const permission of ladder) {
    const filter = scopeFilterFor(ctx, permission);
    if (filter.granted) return { permission, filter };
  }
  return { permission: null, filter: NO_ACCESS };
};
