import { describe, expect, it } from 'vitest';
import { addDays } from './dates.js';
import { computeComplianceState, type ComplianceResult } from './requirements.js';
import {
  buildTrainingMatrix,
  employeesAtRisk,
  filterMatrix,
  matrixToCsv,
  matrixToRows,
  rollup,
  statusLabel,
  summarise,
  worstStatus,
  type MatrixCourse,
  type MatrixEmployee,
} from './matrix.js';

const NOW = new Date('2026-06-01T12:00:00Z');

const courses: MatrixCourse[] = [
  { id: 'hazcom', title: 'Hazard Communication' },
  { id: 'loto', title: 'Lockout/Tagout' },
  { id: 'ppe', title: 'PPE' },
  { id: 'forklift', title: 'Forklift Safety' },
  { id: 'firstaid', title: 'First Aid' },
];

const employees: MatrixEmployee[] = [
  {
    id: 'john',
    firstName: 'John',
    lastName: 'Smith',
    employeeNumber: 'E-1001',
    departmentId: 'maint',
    departmentName: 'Maintenance',
    locationId: 'plant1',
    locationName: 'Plant 1',
    jobRoleId: 'tech',
    jobRoleTitle: 'Maintenance Technician',
    supervisorId: 'sup-1',
  },
  {
    id: 'jane',
    firstName: 'Jane',
    lastName: 'Doe',
    employeeNumber: 'E-1002',
    departmentId: 'maint',
    departmentName: 'Maintenance',
    locationId: 'plant1',
    locationName: 'Plant 1',
    jobRoleId: 'tech',
    jobRoleTitle: 'Maintenance Technician',
    supervisorId: 'sup-1',
  },
  {
    id: 'amir',
    firstName: 'Amir',
    lastName: 'Haddad',
    employeeNumber: 'E-2001',
    departmentId: 'office',
    departmentName: 'Office',
    locationId: 'hq',
    locationName: 'Head Office',
    jobRoleId: 'clerk',
    jobRoleTitle: 'Clerk',
    supervisorId: 'sup-2',
  },
];

/** Builds the compliance state the spec's example matrix implies. */
const state = (
  employeeId: string,
  courseId: string,
  shape: 'current' | 'expiring' | 'expired' | 'missing' | 'na' | 'inprogress' | 'pending',
): ComplianceResult => {
  const base = {
    requirementId: `${courseId}-req`,
    courseId,
    employeeId,
    now: NOW,
    applicable: shape !== 'na',
  };
  switch (shape) {
    case 'current':
      return computeComplianceState({
        ...base,
        record: {
          id: `${employeeId}-${courseId}`,
          completedAt: addDays(NOW, -30),
          expiresAt: addDays(NOW, 335),
          passed: true,
        },
      });
    case 'expiring':
      return computeComplianceState({
        ...base,
        record: {
          id: `${employeeId}-${courseId}`,
          completedAt: addDays(NOW, -350),
          expiresAt: addDays(NOW, 12),
          passed: true,
        },
      });
    case 'expired':
      return computeComplianceState({
        ...base,
        record: {
          id: `${employeeId}-${courseId}`,
          completedAt: addDays(NOW, -400),
          expiresAt: addDays(NOW, -20),
          passed: true,
        },
      });
    case 'inprogress':
      return computeComplianceState({
        ...base,
        assignment: {
          id: `${employeeId}-${courseId}-a`,
          status: 'IN_PROGRESS',
          dueAt: addDays(NOW, 10),
          startedAt: NOW,
        },
      });
    case 'pending':
      return computeComplianceState({
        ...base,
        assignment: {
          id: `${employeeId}-${courseId}-a`,
          status: 'ASSIGNED',
          dueAt: addDays(NOW, 10),
        },
      });
    case 'na':
      return computeComplianceState(base);
    default:
      return computeComplianceState(base);
  }
};

const states: ComplianceResult[] = [
  // John Smith: Current, Current, Expiring, Missing, N/A  -> at risk
  state('john', 'hazcom', 'current'),
  state('john', 'loto', 'current'),
  state('john', 'ppe', 'expiring'),
  state('john', 'forklift', 'missing'),
  state('john', 'firstaid', 'na'),
  // Jane Doe: all current -> compliant
  state('jane', 'hazcom', 'current'),
  state('jane', 'loto', 'current'),
  state('jane', 'ppe', 'current'),
  state('jane', 'forklift', 'current'),
  state('jane', 'firstaid', 'current'),
  // Amir: one expired, one in progress
  state('amir', 'hazcom', 'expired'),
  state('amir', 'ppe', 'inprogress'),
];

const matrix = buildTrainingMatrix({ employees, courses, states, generatedAt: NOW });

describe('summarise', () => {
  it('counts each status', () => {
    const summary = summarise(['CURRENT', 'CURRENT', 'EXPIRED', 'MISSING', 'NOT_APPLICABLE']);
    expect(summary.total).toBe(5);
    expect(summary.current).toBe(2);
    expect(summary.expired).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.notApplicable).toBe(1);
  });

  it('excludes N/A from the compliance denominator', () => {
    expect(summarise(['CURRENT', 'NOT_APPLICABLE']).compliancePercent).toBe(100);
    expect(summarise(['CURRENT', 'EXPIRED']).compliancePercent).toBe(50);
    expect(summarise(['CURRENT', 'CURRENT', 'EXPIRED']).compliancePercent).toBe(66.7);
  });

  it('counts expiring training as still compliant', () => {
    expect(summarise(['EXPIRING_SOON']).compliancePercent).toBe(100);
  });

  it('counts in-progress and pending as not yet compliant', () => {
    expect(summarise(['IN_PROGRESS', 'CURRENT']).compliancePercent).toBe(50);
    expect(summarise(['PENDING', 'CURRENT']).compliancePercent).toBe(50);
  });

  it('reports 100% for an empty set rather than dividing by zero', () => {
    expect(summarise([]).compliancePercent).toBe(100);
  });
});

describe('worstStatus', () => {
  it('ranks expired above missing above expiring', () => {
    expect(worstStatus(['CURRENT', 'EXPIRING_SOON', 'MISSING', 'EXPIRED'])).toBe('EXPIRED');
    expect(worstStatus(['CURRENT', 'EXPIRING_SOON', 'MISSING'])).toBe('MISSING');
    expect(worstStatus(['CURRENT', 'EXPIRING_SOON'])).toBe('EXPIRING_SOON');
    expect(worstStatus(['CURRENT'])).toBe('CURRENT');
    expect(worstStatus([])).toBe('NOT_APPLICABLE');
  });
});

describe('buildTrainingMatrix', () => {
  it('produces one row per employee, keeping employees with no states', () => {
    expect(matrix.rows).toHaveLength(3);
    expect(matrix.rows.map((r) => r.employee.id)).toEqual(['john', 'jane', 'amir']);
  });

  it('reproduces the specification example row for John Smith', () => {
    const row = matrix.rows.find((r) => r.employee.id === 'john')!;
    expect(row.cells.hazcom!.status).toBe('CURRENT');
    expect(row.cells.loto!.status).toBe('CURRENT');
    expect(row.cells.ppe!.status).toBe('EXPIRING_SOON');
    expect(row.cells.forklift!.status).toBe('MISSING');
    expect(row.cells.firstaid!.status).toBe('NOT_APPLICABLE');
    expect(row.rowStatus).toBe('MISSING');
  });

  it('reproduces the fully compliant row for Jane Doe', () => {
    const row = matrix.rows.find((r) => r.employee.id === 'jane')!;
    expect(Object.values(row.cells).every((c) => c.status === 'CURRENT')).toBe(true);
    expect(row.rowStatus).toBe('CURRENT');
    expect(row.summary.compliancePercent).toBe(100);
  });

  it('keeps the worse of two requirements pointing at one course', () => {
    const conflicting = buildTrainingMatrix({
      employees: [employees[0]!],
      courses: [courses[0]!],
      states: [
        { ...state('john', 'hazcom', 'current'), requirementId: 'req-a' },
        { ...state('john', 'hazcom', 'expired'), requirementId: 'req-b' },
      ],
      generatedAt: NOW,
    });
    expect(conflicting.rows[0]!.cells.hazcom!.status).toBe('EXPIRED');
  });

  it('summarises the whole matrix', () => {
    expect(matrix.summary.total).toBe(12);
    expect(matrix.summary.expired).toBe(1);
    expect(matrix.summary.missing).toBe(1);
    expect(matrix.summary.notApplicable).toBe(1);
    // 11 applicable (12 states less one N/A); 8 compliant (7 current + 1
    // expiring). EXPIRED, MISSING and IN_PROGRESS all count against.
    expect(matrix.summary.compliancePercent).toBe(72.7);
  });
});

describe('rollups', () => {
  it('groups by department, worst first', () => {
    const buckets = rollup(matrix, 'department');
    expect(buckets.map((b) => b.key)).toEqual(['office', 'maint']);
    expect(buckets[0]!.label).toBe('Office');
    expect(buckets[0]!.employeeCount).toBe(1);
    expect(buckets[0]!.summary.compliancePercent).toBe(0);
  });

  it('groups by location', () => {
    const buckets = rollup(matrix, 'location');
    expect(buckets.map((b) => b.label).sort()).toEqual(['Head Office', 'Plant 1']);
  });

  it('groups by job role', () => {
    const buckets = rollup(matrix, 'jobRole');
    expect(buckets.find((b) => b.key === 'tech')!.employeeCount).toBe(2);
  });

  it('groups by course so the worst-performing course surfaces', () => {
    const buckets = rollup(matrix, 'course');
    expect(buckets[0]!.label).toBe('Forklift Safety');
    expect(buckets[0]!.summary.compliancePercent).toBe(50);
  });

  it('groups by supervisor', () => {
    const buckets = rollup(matrix, 'supervisor');
    expect(buckets.find((b) => b.key === 'sup-1')!.employeeCount).toBe(2);
  });
});

describe('employeesAtRisk', () => {
  it('lists only employees with an expired or missing item', () => {
    expect(employeesAtRisk(matrix).map((r) => r.employee.id)).toEqual(['john', 'amir']);
  });
});

describe('filterMatrix', () => {
  it('filters by department', () => {
    const filtered = filterMatrix(matrix, { departmentIds: ['office'] });
    expect(filtered.rows.map((r) => r.employee.id)).toEqual(['amir']);
  });

  it('filters by location and job role together', () => {
    const filtered = filterMatrix(matrix, { locationIds: ['plant1'], jobRoleIds: ['tech'] });
    expect(filtered.rows).toHaveLength(2);
  });

  it('filters by supervisor', () => {
    expect(filterMatrix(matrix, { supervisorIds: ['sup-2'] }).rows).toHaveLength(1);
  });

  it('filters columns by course', () => {
    const filtered = filterMatrix(matrix, { courseIds: ['hazcom'] });
    expect(filtered.courses.map((c) => c.id)).toEqual(['hazcom']);
    expect(Object.keys(filtered.rows[0]!.cells)).toEqual(['hazcom']);
  });

  it('filters by status and drops rows with no matching cell', () => {
    const filtered = filterMatrix(matrix, { statuses: ['EXPIRED'] });
    expect(filtered.rows.map((r) => r.employee.id)).toEqual(['amir']);
    expect(Object.keys(filtered.rows[0]!.cells)).toEqual(['hazcom']);
  });

  it('filters by expiry window', () => {
    const filtered = filterMatrix(matrix, { expiringWithinDays: 30 });
    expect(filtered.rows.map((r) => r.employee.id)).toEqual(['john']);
    expect(Object.keys(filtered.rows[0]!.cells)).toEqual(['ppe']);
  });

  it('excludes already-expired cells from the expiring window', () => {
    // Amir's Hazard Communication expired 20 days ago; it is Expired, not
    // Expiring, and must not appear in an "expiring within 30 days" view.
    const filtered = filterMatrix(matrix, { expiringWithinDays: 30 });
    expect(filtered.rows.some((r) => r.employee.id === 'amir')).toBe(false);
  });

  it('searches by name and employee number', () => {
    expect(filterMatrix(matrix, { search: 'doe' }).rows).toHaveLength(1);
    expect(filterMatrix(matrix, { search: 'E-2001' }).rows).toHaveLength(1);
    expect(filterMatrix(matrix, { search: 'nobody' }).rows).toHaveLength(0);
  });

  it('recomputes the summary for the filtered view', () => {
    const filtered = filterMatrix(matrix, { employeeIds: ['jane'] });
    expect(filtered.summary.compliancePercent).toBe(100);
  });
});

describe('export', () => {
  it('renders a header row and one row per employee', () => {
    const rows = matrixToRows(matrix);
    expect(rows[0]!.slice(0, 5)).toEqual([
      'Employee',
      'Employee #',
      'Department',
      'Location',
      'Job role',
    ]);
    expect(rows[0]!).toContain('Hazard Communication');
    expect(rows).toHaveLength(4);
    expect(rows[1]![0]).toBe('Smith, John');
  });

  it('labels missing cells as N/A', () => {
    const rows = matrixToRows(matrix);
    const amir = rows.find((row) => row[0] === 'Haddad, Amir')!;
    // Amir has no LOTO state at all.
    expect(amir[1 + 1 + 1 + 1 + 1 + courses.findIndex((c) => c.id === 'loto')]).toBe('N/A');
  });

  it('produces valid CSV with escaped values', () => {
    const csv = matrixToCsv(
      buildTrainingMatrix({
        employees: [{ ...employees[0]!, lastName: 'Smith, Jr.' }],
        courses: [courses[0]!],
        states: [state('john', 'hazcom', 'current')],
        generatedAt: NOW,
      }),
    );
    expect(csv.split('\r\n')[1]).toMatch(/^"Smith, Jr\., John"/);
  });

  it('exposes human-readable status labels', () => {
    expect(statusLabel('EXPIRING_SOON')).toBe('Expiring');
    expect(statusLabel('NOT_APPLICABLE')).toBe('N/A');
  });
});
