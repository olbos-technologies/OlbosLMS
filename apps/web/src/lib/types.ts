/** Shapes the API returns. Kept narrow: only what the UI actually reads. */

export type ComplianceStatus =
  | 'CURRENT'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'MISSING'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'NOT_APPLICABLE';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface MeResponse {
  user: SessionUser;
  organization: Organization | null;
  employee: {
    id: string;
    employeeNumber: string | null;
    jobRole: { id: string; title: string } | null;
    department: { id: string; name: string } | null;
    location: { id: string; name: string } | null;
  } | null;
  roles: { key: string; scopeType: string; scopeId: string | null }[];
  permissions: string[];
  entitlements: string[];
  supervises: number;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  status?: 'available' | 'planned';
  available: boolean;
  badge?: 'expiring' | 'overdue' | 'unread';
}

export interface NavigationSection {
  id: string;
  label: string;
  items: NavigationItem[];
}

export interface ComplianceSummary {
  total: number;
  current: number;
  expiringSoon: number;
  expired: number;
  missing: number;
  inProgress: number;
  pending: number;
  notApplicable: number;
  compliancePercent: number;
}

export interface RollupBucket {
  key: string;
  label: string;
  employeeCount: number;
  summary: ComplianceSummary;
}

export interface ComplianceDashboard {
  scope: string;
  summary: ComplianceSummary;
  byDepartment: RollupBucket[];
  byLocation: RollupBucket[];
  byJobRole: RollupBucket[];
  byCourse: RollupBucket[];
  employeesAtRisk: {
    employeeId: string;
    name: string;
    department: string | null;
    expired: number;
    missing: number;
    compliancePercent: number;
  }[];
  generatedAt: string;
}

export interface SafetyDashboard {
  kpis: {
    overallCompliancePercent: number;
    employeesMissingTraining: number;
    trainingItemsExpiring: number;
    expiredCertifications: number;
    completedThisMonth: number;
    activeEmployees: number;
    expiringCertificates: number;
    openIncidents: number;
    openCorrectiveActions: number;
  };
  breakdown: ComplianceSummary;
  generatedAt: string;
}

export interface MatrixCell {
  status: ComplianceStatus;
  requirementId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  explanation: string;
}

export interface MatrixRow {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
    departmentName: string | null;
    locationName: string | null;
    jobRoleTitle: string | null;
  };
  rowStatus: ComplianceStatus;
  summary: ComplianceSummary;
  cells: Record<string, MatrixCell>;
}

export interface TrainingMatrix {
  courses: { id: string; title: string; code: string | null; type: string | null }[];
  rows: MatrixRow[];
}

export interface LearningSummary {
  assigned: number;
  overdue: number;
  expiringSoon: number;
  expired: number;
  current: number;
}

export interface LearningAssignment {
  id: string;
  status: string;
  dueAt: string | null;
  assignedAt: string;
  startedAt: string | null;
  course: {
    id: string;
    title: string;
    slug: string;
    type: string;
    summary: string | null;
    publishedVersion: {
      estimatedMinutes: number | null;
      deliveryMethod: string;
      trainingType: string;
    } | null;
  };
  requirement: { id: string; name: string; basis: string | null } | null;
}

export interface MyLearning {
  assignments: LearningAssignment[];
  enrollments: {
    id: string;
    status: string;
    progressPercent: number;
    course: { id: string; title: string; slug: string; type: string };
  }[];
  summary: LearningSummary | null;
}

export interface CourseListItem {
  id: string;
  title: string;
  slug: string;
  code: string | null;
  summary: string | null;
  type: string;
  status: string;
  tags: string[];
  publishedVersion: {
    id: string;
    version: number;
    estimatedMinutes: number | null;
    deliveryMethod: string;
    trainingType: string;
    renewalIntervalDays: number | null;
    issuesCertificate: boolean;
    safetyProfile: {
      safetyCategory: string | null;
      hazardCategories: string[];
      disclaimer: string | null;
    } | null;
  } | null;
  _count: { enrollments: number; requirements: number; trainingRecords: number };
}

export interface EmployeeListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  employeeNumber: string | null;
  status: string;
  employmentType: string;
  shift: string | null;
  hireDate: string | null;
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  jobRole: { id: string; title: string } | null;
  supervisor: { id: string; firstName: string; lastName: string } | null;
}

export interface CertificateListItem {
  id: string;
  certificateNumber: string;
  publicId: string;
  learnerName: string;
  courseTitle: string;
  trainingType: string;
  status: string;
  completedAt: string;
  issuedAt: string;
  expiresAt: string | null;
  instructorName: string | null;
  verificationUrl: string;
}

export interface VerificationPayload {
  result: 'VALID' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED' | 'NOT_FOUND' | 'TAMPERED';
  certificateNumber?: string;
  learnerName?: string;
  organizationName?: string;
  courseTitle?: string;
  trainingType?: string;
  instructorName?: string | null;
  completedAt?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  durationMinutes?: number | null;
  creditHours?: number | null;
  disclaimer?: string | null;
  revokedAt?: string | null;
  verifiedAt: string;
  message: string;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    scope?: string;
    [key: string]: unknown;
  };
}
