import {
  countsTowardCompliance,
  isCompliant,
  type ComplianceResult,
  type ComplianceStatus,
} from './requirements.js';

/**
 * The training matrix (§12) and the compliance rollups that sit on top of it
 * (§20).
 *
 * A matrix is (employees × courses) with one `ComplianceStatus` per cell. The
 * builder takes flat compliance states — exactly what `compliance_states` holds
 * — and pivots them, so the same data backs the grid, the KPI cards and the
 * CSV/XLSX export without three different definitions of "compliant".
 */

export interface MatrixEmployee {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly employeeNumber?: string | null;
  readonly departmentId?: string | null;
  readonly departmentName?: string | null;
  readonly locationId?: string | null;
  readonly locationName?: string | null;
  readonly jobRoleId?: string | null;
  readonly jobRoleTitle?: string | null;
  readonly supervisorId?: string | null;
}

export interface MatrixCourse {
  readonly id: string;
  readonly title: string;
  readonly code?: string | null;
  readonly type?: string | null;
}

export interface MatrixCell {
  readonly status: ComplianceStatus;
  readonly requirementId: string | null;
  readonly dueAt: Date | null;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly daysUntilExpiry: number | null;
  readonly explanation: string;
}

export interface MatrixRow {
  readonly employee: MatrixEmployee;
  /** courseId -> cell. Courses with no requirement are absent, not N/A rows. */
  readonly cells: Record<string, MatrixCell>;
  readonly summary: ComplianceSummary;
  /** Worst status in the row, used for the row-level indicator. */
  readonly rowStatus: ComplianceStatus;
}

export interface TrainingMatrix {
  readonly courses: readonly MatrixCourse[];
  readonly rows: readonly MatrixRow[];
  readonly summary: ComplianceSummary;
  readonly generatedAt: Date;
}

export interface ComplianceSummary {
  readonly total: number;
  readonly current: number;
  readonly expiringSoon: number;
  readonly expired: number;
  readonly missing: number;
  readonly inProgress: number;
  readonly pending: number;
  readonly notApplicable: number;
  /** Percentage of applicable items that are compliant, 0–100, one decimal. */
  readonly compliancePercent: number;
}

const EMPTY_SUMMARY: ComplianceSummary = {
  total: 0,
  current: 0,
  expiringSoon: 0,
  expired: 0,
  missing: 0,
  inProgress: 0,
  pending: 0,
  notApplicable: 0,
  compliancePercent: 100,
};

const STATUS_SEVERITY: Record<ComplianceStatus, number> = {
  NOT_APPLICABLE: 0,
  CURRENT: 1,
  PENDING: 2,
  IN_PROGRESS: 3,
  EXPIRING_SOON: 4,
  MISSING: 5,
  EXPIRED: 6,
};

export const worstStatus = (statuses: readonly ComplianceStatus[]): ComplianceStatus =>
  statuses.reduce<ComplianceStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    'NOT_APPLICABLE',
  );

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Counts statuses and derives the compliance percentage. */
export const summarise = (statuses: readonly ComplianceStatus[]): ComplianceSummary => {
  if (statuses.length === 0) return EMPTY_SUMMARY;

  let current = 0;
  let expiringSoon = 0;
  let expired = 0;
  let missing = 0;
  let inProgress = 0;
  let pending = 0;
  let notApplicable = 0;

  for (const status of statuses) {
    switch (status) {
      case 'CURRENT':
        current += 1;
        break;
      case 'EXPIRING_SOON':
        expiringSoon += 1;
        break;
      case 'EXPIRED':
        expired += 1;
        break;
      case 'MISSING':
        missing += 1;
        break;
      case 'IN_PROGRESS':
        inProgress += 1;
        break;
      case 'PENDING':
        pending += 1;
        break;
      case 'NOT_APPLICABLE':
        notApplicable += 1;
        break;
    }
  }

  // The denominator excludes N/A: waiving a requirement must not make an
  // organization look less compliant than one that never had it.
  const applicable = statuses.filter(countsTowardCompliance).length;
  const compliant = statuses.filter((s) => countsTowardCompliance(s) && isCompliant(s)).length;

  return {
    total: statuses.length,
    current,
    expiringSoon,
    expired,
    missing,
    inProgress,
    pending,
    notApplicable,
    compliancePercent: applicable === 0 ? 100 : round1((compliant / applicable) * 100),
  };
};

export interface BuildMatrixInput {
  readonly employees: readonly MatrixEmployee[];
  readonly courses: readonly MatrixCourse[];
  readonly states: readonly ComplianceResult[];
  readonly generatedAt?: Date;
}

/**
 * Pivots flat compliance states into the matrix grid. Employees and courses are
 * supplied explicitly so the grid keeps a stable shape even when an employee
 * has no state rows yet.
 */
export const buildTrainingMatrix = (input: BuildMatrixInput): TrainingMatrix => {
  const byEmployee = new Map<string, ComplianceResult[]>();
  for (const state of input.states) {
    const list = byEmployee.get(state.employeeId);
    if (list) list.push(state);
    else byEmployee.set(state.employeeId, [state]);
  }

  const rows: MatrixRow[] = input.employees.map((employee) => {
    const cells: Record<string, MatrixCell> = {};
    for (const state of byEmployee.get(employee.id) ?? []) {
      const existing = cells[state.courseId];
      const cell: MatrixCell = {
        status: state.status,
        requirementId: state.requirementId,
        dueAt: state.dueAt,
        completedAt: state.completedAt,
        expiresAt: state.expiresAt,
        daysUntilExpiry: state.daysUntilExpiry,
        explanation: state.explanation,
      };
      // Two requirements can point at the same course; the worse one wins so a
      // cell never looks green while an obligation is unmet.
      cells[state.courseId] =
        existing && STATUS_SEVERITY[existing.status] >= STATUS_SEVERITY[cell.status]
          ? existing
          : cell;
    }

    const statuses = Object.values(cells).map((cell) => cell.status);
    return {
      employee,
      cells,
      summary: summarise(statuses),
      rowStatus: worstStatus(statuses),
    };
  });

  return {
    courses: input.courses,
    rows,
    summary: summarise(input.states.map((state) => state.status)),
    generatedAt: input.generatedAt ?? new Date(),
  };
};

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export type RollupDimension = 'department' | 'location' | 'jobRole' | 'course' | 'supervisor';

export interface RollupBucket {
  readonly key: string;
  readonly label: string;
  readonly employeeCount: number;
  readonly summary: ComplianceSummary;
}

const dimensionAccessors: Record<
  RollupDimension,
  (
    row: MatrixRow,
    courseId: string,
    courses: readonly MatrixCourse[],
  ) => { key: string; label: string }
> = {
  department: (row) => ({
    key: row.employee.departmentId ?? 'unassigned',
    label: row.employee.departmentName ?? 'Unassigned',
  }),
  location: (row) => ({
    key: row.employee.locationId ?? 'unassigned',
    label: row.employee.locationName ?? 'Unassigned',
  }),
  jobRole: (row) => ({
    key: row.employee.jobRoleId ?? 'unassigned',
    label: row.employee.jobRoleTitle ?? 'Unassigned',
  }),
  supervisor: (row) => ({
    key: row.employee.supervisorId ?? 'unassigned',
    label: row.employee.supervisorId ?? 'Unassigned',
  }),
  course: (_row, courseId, courses) => ({
    key: courseId,
    label: courses.find((course) => course.id === courseId)?.title ?? courseId,
  }),
};

/** Groups matrix cells along one dimension and summarises each bucket. */
export const rollup = (matrix: TrainingMatrix, dimension: RollupDimension): RollupBucket[] => {
  const buckets = new Map<
    string,
    { label: string; statuses: ComplianceStatus[]; employees: Set<string> }
  >();
  const accessor = dimensionAccessors[dimension];

  for (const row of matrix.rows) {
    for (const [courseId, cell] of Object.entries(row.cells)) {
      const { key, label } = accessor(row, courseId, matrix.courses);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label, statuses: [], employees: new Set() };
        buckets.set(key, bucket);
      }
      bucket.statuses.push(cell.status);
      bucket.employees.add(row.employee.id);
    }
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      employeeCount: bucket.employees.size,
      summary: summarise(bucket.statuses),
    }))
    .sort(
      (a, b) =>
        a.summary.compliancePercent - b.summary.compliancePercent || a.label.localeCompare(b.label),
    );
};

/** Employees carrying at least one expired or missing mandatory item. */
export const employeesAtRisk = (matrix: TrainingMatrix): MatrixRow[] =>
  matrix.rows.filter((row) => row.summary.expired > 0 || row.summary.missing > 0);

export interface MatrixFilter {
  readonly departmentIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly jobRoleIds?: readonly string[];
  readonly supervisorIds?: readonly string[];
  readonly employeeIds?: readonly string[];
  readonly courseIds?: readonly string[];
  readonly statuses?: readonly ComplianceStatus[];
  /** Keep only cells expiring within this many days. */
  readonly expiringWithinDays?: number;
  readonly search?: string;
}

const matchesList = (
  value: string | null | undefined,
  list: readonly string[] | undefined,
): boolean => !list || list.length === 0 || (value != null && list.includes(value));

/** Applies the filter panel (§12) to an already-built matrix. */
export const filterMatrix = (matrix: TrainingMatrix, filter: MatrixFilter): TrainingMatrix => {
  const search = filter.search?.trim().toLowerCase();
  const courseIds =
    filter.courseIds && filter.courseIds.length > 0 ? new Set(filter.courseIds) : null;
  const statuses = filter.statuses && filter.statuses.length > 0 ? new Set(filter.statuses) : null;

  const courses = courseIds
    ? matrix.courses.filter((course) => courseIds.has(course.id))
    : matrix.courses;

  const rows: MatrixRow[] = [];
  for (const row of matrix.rows) {
    const { employee } = row;
    if (!matchesList(employee.departmentId, filter.departmentIds)) continue;
    if (!matchesList(employee.locationId, filter.locationIds)) continue;
    if (!matchesList(employee.jobRoleId, filter.jobRoleIds)) continue;
    if (!matchesList(employee.supervisorId, filter.supervisorIds)) continue;
    if (!matchesList(employee.id, filter.employeeIds)) continue;
    if (search) {
      const haystack =
        `${employee.firstName} ${employee.lastName} ${employee.employeeNumber ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    const cells: Record<string, MatrixCell> = {};
    for (const [courseId, cell] of Object.entries(row.cells)) {
      if (courseIds && !courseIds.has(courseId)) continue;
      if (statuses && !statuses.has(cell.status)) continue;
      if (filter.expiringWithinDays !== undefined) {
        // "Expiring within N days" means still valid but close to expiry.
        // Already-expired items belong to the Expired view, not this one.
        const days = cell.daysUntilExpiry;
        if (days === null || days < 0 || days > filter.expiringWithinDays) continue;
      }
      cells[courseId] = cell;
    }

    // A status or expiry filter is a search for matching cells; rows with none
    // are dropped rather than shown empty.
    const cellFilterActive = statuses !== null || filter.expiringWithinDays !== undefined;
    if (cellFilterActive && Object.keys(cells).length === 0) continue;

    const cellStatuses = Object.values(cells).map((cell) => cell.status);
    rows.push({
      employee,
      cells,
      summary: summarise(cellStatuses),
      rowStatus: worstStatus(cellStatuses),
    });
  }

  return {
    courses,
    rows,
    summary: summarise(rows.flatMap((row) => Object.values(row.cells).map((cell) => cell.status))),
    generatedAt: matrix.generatedAt,
  };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CELL_LABELS: Record<ComplianceStatus, string> = {
  CURRENT: 'Current',
  EXPIRING_SOON: 'Expiring',
  EXPIRED: 'Expired',
  MISSING: 'Missing',
  IN_PROGRESS: 'In progress',
  PENDING: 'Pending',
  NOT_APPLICABLE: 'N/A',
};

export const statusLabel = (status: ComplianceStatus): string => CELL_LABELS[status];

const escapeCsv = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Renders the matrix as CSV (§12 export). Excel and PDF reuse these rows. */
export const matrixToRows = (matrix: TrainingMatrix): string[][] => {
  const header = [
    'Employee',
    'Employee #',
    'Department',
    'Location',
    'Job role',
    ...matrix.courses.map((course) => course.title),
    'Compliance %',
    'Status',
  ];

  const body = matrix.rows.map((row) => [
    `${row.employee.lastName}, ${row.employee.firstName}`,
    row.employee.employeeNumber ?? '',
    row.employee.departmentName ?? '',
    row.employee.locationName ?? '',
    row.employee.jobRoleTitle ?? '',
    ...matrix.courses.map((course) => {
      const cell = row.cells[course.id];
      return cell ? CELL_LABELS[cell.status] : CELL_LABELS.NOT_APPLICABLE;
    }),
    row.summary.compliancePercent.toFixed(1),
    CELL_LABELS[row.rowStatus],
  ]);

  return [header, ...body];
};

export const matrixToCsv = (matrix: TrainingMatrix): string =>
  matrixToRows(matrix)
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');
