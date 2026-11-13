import { addDays, daysBetween, DEFAULT_TIMEZONE } from './dates.js';
import {
  evaluateExpiration,
  type ExpirationBasis,
  type ExpirationEvaluation,
} from './expiration.js';

/**
 * The training requirement engine (§13) and compliance state machine (§12).
 *
 * Requirements describe *who* must complete *what*. When an employee's
 * attributes change — job role, department, location, shift, hazard exposure,
 * equipment authorization — the set of applicable requirements is recomputed
 * and the difference drives new assignments.
 */

export type RequirementScopeType =
  | 'ORGANIZATION'
  | 'DEPARTMENT'
  | 'LOCATION'
  | 'JOB_ROLE'
  | 'EMPLOYMENT_TYPE'
  | 'HAZARD_EXPOSURE'
  | 'EQUIPMENT_AUTHORIZATION'
  | 'SHIFT'
  | 'INDIVIDUAL';

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'TEMPORARY'
  | 'SEASONAL'
  | 'INTERN'
  | 'VOLUNTEER';

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export interface EmployeeAttributes {
  readonly id: string;
  readonly status: EmployeeStatus;
  readonly departmentId?: string | null;
  readonly locationId?: string | null;
  readonly jobRoleId?: string | null;
  readonly employmentType?: EmploymentType | null;
  readonly shift?: string | null;
  readonly hireDate?: Date | null;
  readonly hazardExposures?: readonly string[];
  readonly equipmentAuthorizations?: readonly string[];
  /** Hazards implied by the employee's job role, merged with their own. */
  readonly jobRoleHazardExposures?: readonly string[];
}

export interface RequirementRule {
  readonly id: string;
  readonly courseId: string;
  readonly name: string;
  readonly scopeType: RequirementScopeType;
  readonly departmentId?: string | null;
  readonly locationId?: string | null;
  readonly jobRoleId?: string | null;
  readonly employeeId?: string | null;
  readonly employmentType?: EmploymentType | null;
  readonly shift?: string | null;
  readonly hazardExposure?: string | null;
  readonly equipmentKey?: string | null;
  readonly isActive?: boolean;
  readonly isMandatory?: boolean;
  readonly dueWithinDays?: number | null;
  readonly renewalIntervalDays?: number | null;
  readonly warningIntervalDays?: readonly number[];
  readonly effectiveFrom?: Date | null;
  readonly effectiveUntil?: Date | null;
}

/** Case-insensitive membership test for the free-text attribute scopes. */
const includesInsensitive = (
  values: readonly string[] | undefined,
  needle: string | null | undefined,
): boolean => {
  if (!needle) return false;
  const target = needle.trim().toLowerCase();
  return (values ?? []).some((value) => value.trim().toLowerCase() === target);
};

export const effectiveHazardExposures = (employee: EmployeeAttributes): string[] => [
  ...new Set([...(employee.jobRoleHazardExposures ?? []), ...(employee.hazardExposures ?? [])]),
];

/** Whether a requirement is in force at `now`. */
export const requirementIsInForce = (rule: RequirementRule, now: Date): boolean => {
  if (rule.isActive === false) return false;
  if (rule.effectiveFrom && now < rule.effectiveFrom) return false;
  if (rule.effectiveUntil && now > rule.effectiveUntil) return false;
  return true;
};

/**
 * Whether a requirement applies to one employee. Terminated employees are
 * excluded: their historical records stay intact, but they accrue no new
 * obligations.
 */
export const requirementApplies = (
  rule: RequirementRule,
  employee: EmployeeAttributes,
  now: Date = new Date(),
): boolean => {
  if (!requirementIsInForce(rule, now)) return false;
  if (employee.status === 'TERMINATED') return false;

  switch (rule.scopeType) {
    case 'ORGANIZATION':
      return true;
    case 'DEPARTMENT':
      return !!rule.departmentId && rule.departmentId === employee.departmentId;
    case 'LOCATION':
      return !!rule.locationId && rule.locationId === employee.locationId;
    case 'JOB_ROLE':
      return !!rule.jobRoleId && rule.jobRoleId === employee.jobRoleId;
    case 'EMPLOYMENT_TYPE':
      return !!rule.employmentType && rule.employmentType === employee.employmentType;
    case 'SHIFT':
      return (
        !!rule.shift &&
        !!employee.shift &&
        rule.shift.trim().toLowerCase() === employee.shift.trim().toLowerCase()
      );
    case 'HAZARD_EXPOSURE':
      return includesInsensitive(effectiveHazardExposures(employee), rule.hazardExposure);
    case 'EQUIPMENT_AUTHORIZATION':
      return includesInsensitive(employee.equipmentAuthorizations, rule.equipmentKey);
    case 'INDIVIDUAL':
      return !!rule.employeeId && rule.employeeId === employee.id;
    default:
      // Fail closed: an unrecognised scope assigns nothing.
      return false;
  }
};

export const resolveRequirements = (
  rules: readonly RequirementRule[],
  employee: EmployeeAttributes,
  now: Date = new Date(),
): RequirementRule[] => rules.filter((rule) => requirementApplies(rule, employee, now));

export interface RequirementDiff {
  readonly added: RequirementRule[];
  readonly removed: string[];
  readonly unchanged: string[];
}

/**
 * What changed for an employee between two evaluations. `added` becomes new
 * assignments; `removed` requirements are no longer obligatory (their historical
 * training records are never deleted).
 */
export const diffRequirements = (
  previousRequirementIds: readonly string[],
  next: readonly RequirementRule[],
): RequirementDiff => {
  const before = new Set(previousRequirementIds);
  const after = new Set(next.map((rule) => rule.id));

  return {
    added: next.filter((rule) => !before.has(rule.id)),
    removed: [...before].filter((id) => !after.has(id)),
    unchanged: [...before].filter((id) => after.has(id)),
  };
};

/** When a newly assigned requirement is due. */
export const computeDueDate = (
  rule: RequirementRule,
  options: { assignedAt: Date; hireDate?: Date | null },
): Date | null => {
  const days = rule.dueWithinDays;
  if (days === null || days === undefined) return null;
  const anchor =
    options.hireDate && options.hireDate > options.assignedAt
      ? options.hireDate
      : options.assignedAt;
  return addDays(anchor, days);
};

// ---------------------------------------------------------------------------
// Compliance state
// ---------------------------------------------------------------------------

export type ComplianceStatus =
  | 'CURRENT'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'MISSING'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'NOT_APPLICABLE';

export interface TrainingRecordSummary {
  readonly id: string;
  readonly completedAt: Date;
  readonly expiresAt?: Date | null;
  readonly passed?: boolean;
  readonly voidedAt?: Date | null;
  readonly supersededAt?: Date | null;
}

export interface TrainingAssignmentSummary {
  readonly id: string;
  readonly status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'WAIVED' | 'CANCELLED';
  readonly dueAt?: Date | null;
  readonly startedAt?: Date | null;
  readonly waivedAt?: Date | null;
}

export interface ComplianceInput {
  readonly requirementId: string;
  readonly courseId: string;
  readonly employeeId: string;
  readonly applicable: boolean;
  readonly record?: TrainingRecordSummary | null;
  readonly assignment?: TrainingAssignmentSummary | null;
  readonly expirationBasis?: ExpirationBasis;
  readonly renewalIntervalDays?: number | null;
  readonly warningIntervalDays?: readonly number[];
  readonly timezone?: string;
  readonly now?: Date;
}

export interface ComplianceResult {
  readonly requirementId: string;
  readonly courseId: string;
  readonly employeeId: string;
  readonly status: ComplianceStatus;
  readonly dueAt: Date | null;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly daysUntilExpiry: number | null;
  readonly daysOverdue: number | null;
  readonly isOverdue: boolean;
  readonly latestRecordId: string | null;
  readonly assignmentId: string | null;
  /** Why this status was chosen — surfaced in the UI and in exports. */
  readonly explanation: string;
}

const usableRecord = (record: TrainingRecordSummary | null | undefined): boolean =>
  !!record && !record.voidedAt && !record.supersededAt && record.passed !== false;

/**
 * The single source of truth for a training matrix cell and for every
 * compliance rollup. Deliberately pure: the sweep job, the API and the tests
 * all evaluate the same function.
 */
export const computeComplianceState = (input: ComplianceInput): ComplianceResult => {
  const now = input.now ?? new Date();
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const assignment = input.assignment ?? null;
  const dueAt = assignment?.dueAt ?? null;
  const isOverdue = !!dueAt && daysBetween(now, dueAt, timezone) < 0;
  const daysOverdue = dueAt ? Math.max(0, -daysBetween(now, dueAt, timezone)) : null;

  const base = {
    requirementId: input.requirementId,
    courseId: input.courseId,
    employeeId: input.employeeId,
    dueAt,
    assignmentId: assignment?.id ?? null,
    daysOverdue: daysOverdue === 0 ? null : daysOverdue,
  };

  if (!input.applicable) {
    return {
      ...base,
      status: 'NOT_APPLICABLE',
      completedAt: null,
      expiresAt: null,
      daysUntilExpiry: null,
      isOverdue: false,
      latestRecordId: null,
      explanation: 'The requirement does not apply to this employee',
    };
  }

  if (assignment?.status === 'WAIVED' || assignment?.waivedAt) {
    return {
      ...base,
      status: 'NOT_APPLICABLE',
      completedAt: null,
      expiresAt: null,
      daysUntilExpiry: null,
      isOverdue: false,
      latestRecordId: null,
      explanation: 'An authorised administrator waived this requirement',
    };
  }

  if (usableRecord(input.record)) {
    const record = input.record as TrainingRecordSummary;
    const evaluation: ExpirationEvaluation = evaluateExpiration(record.expiresAt ?? null, {
      now,
      timezone,
      ...(input.warningIntervalDays ? { warningIntervalDays: input.warningIntervalDays } : {}),
    });

    const status: ComplianceStatus =
      evaluation.status === 'EXPIRED'
        ? 'EXPIRED'
        : evaluation.status === 'EXPIRING_SOON'
          ? 'EXPIRING_SOON'
          : 'CURRENT';

    return {
      ...base,
      status,
      completedAt: record.completedAt,
      expiresAt: evaluation.expiresAt,
      daysUntilExpiry: evaluation.daysUntilExpiry,
      isOverdue: status === 'EXPIRED',
      latestRecordId: record.id,
      explanation:
        status === 'CURRENT'
          ? evaluation.expiresAt
            ? `Completed ${record.completedAt.toISOString().slice(0, 10)}; valid until ${evaluation.expiresAt.toISOString().slice(0, 10)}`
            : `Completed ${record.completedAt.toISOString().slice(0, 10)}; does not expire`
          : status === 'EXPIRING_SOON'
            ? `Expires in ${evaluation.daysUntilExpiry} day(s)`
            : `Expired ${Math.abs(evaluation.daysUntilExpiry ?? 0)} day(s) ago`,
    };
  }

  const startedAssignment =
    assignment && (assignment.status === 'IN_PROGRESS' || assignment.startedAt);

  if (startedAssignment) {
    return {
      ...base,
      status: 'IN_PROGRESS',
      completedAt: null,
      expiresAt: null,
      daysUntilExpiry: null,
      isOverdue,
      latestRecordId: null,
      explanation: isOverdue ? 'Started but past its due date' : 'Training is under way',
    };
  }

  if (assignment && assignment.status === 'ASSIGNED' && !isOverdue) {
    return {
      ...base,
      status: 'PENDING',
      completedAt: null,
      expiresAt: null,
      daysUntilExpiry: null,
      isOverdue: false,
      latestRecordId: null,
      explanation: dueAt ? `Assigned; due ${dueAt.toISOString().slice(0, 10)}` : 'Assigned',
    };
  }

  return {
    ...base,
    status: 'MISSING',
    completedAt: null,
    expiresAt: null,
    daysUntilExpiry: null,
    isOverdue,
    latestRecordId: null,
    explanation: assignment
      ? `Assigned but not completed; ${daysOverdue ?? 0} day(s) overdue`
      : 'No training assignment or record exists',
  };
};

/** Statuses that count against compliance in a rollup. */
export const NON_COMPLIANT_STATUSES: readonly ComplianceStatus[] = ['EXPIRED', 'MISSING'];

/** Statuses that need attention but are not yet a compliance failure. */
export const AT_RISK_STATUSES: readonly ComplianceStatus[] = [
  'EXPIRING_SOON',
  'IN_PROGRESS',
  'PENDING',
];

export const isCompliant = (status: ComplianceStatus): boolean =>
  status === 'CURRENT' || status === 'EXPIRING_SOON' || status === 'NOT_APPLICABLE';

/** Statuses that participate in the compliance percentage denominator. */
export const countsTowardCompliance = (status: ComplianceStatus): boolean =>
  status !== 'NOT_APPLICABLE';
