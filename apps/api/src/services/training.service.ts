import { getEnv } from '@olbos/config';
import {
  getPrismaClient,
  withTenantTransaction,
  type PrismaClient,
  type TenantClient,
} from '@olbos/database';
import {
  certificateIntegrityHash,
  computeComplianceState,
  computeDueDate,
  computeExpiresAt,
  diffRequirements,
  disclaimerFor,
  formatCertificateNumber,
  generatePublicId,
  requirementApplies,
  type ComplianceResult,
  type EmployeeAttributes,
  type RequirementRule,
} from '@olbos/core';

/**
 * The compliance pipeline (§13, §14, §15, §17).
 *
 * Requirement -> assignment -> completion -> training record -> certificate ->
 * compliance state. Every step is a transaction, and the historical rows
 * (records, certificates) are written once and never rewritten by a later
 * course edit.
 */

const DEFAULT_WARNINGS = [90, 60, 30, 14, 7, 1];

// ---------------------------------------------------------------------------
// Loading the inputs
// ---------------------------------------------------------------------------

export const loadEmployeeAttributes = async (
  db: TenantClient,
  employeeId: string,
): Promise<EmployeeAttributes | null> => {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true,
      status: true,
      departmentId: true,
      locationId: true,
      jobRoleId: true,
      employmentType: true,
      shift: true,
      hireDate: true,
      hazardExposures: true,
      equipmentAuthorizations: true,
      jobRole: { select: { hazardExposures: true } },
    },
  });
  if (!employee) return null;

  return {
    id: employee.id,
    status: employee.status,
    departmentId: employee.departmentId,
    locationId: employee.locationId,
    jobRoleId: employee.jobRoleId,
    employmentType: employee.employmentType,
    shift: employee.shift,
    hireDate: employee.hireDate,
    hazardExposures: employee.hazardExposures,
    equipmentAuthorizations: employee.equipmentAuthorizations,
    jobRoleHazardExposures: employee.jobRole?.hazardExposures ?? [],
  };
};

export const loadActiveRequirements = async (db: TenantClient): Promise<RequirementRule[]> => {
  const rows = await db.trainingRequirement.findMany({
    where: { isActive: true },
    select: {
      id: true,
      courseId: true,
      name: true,
      scopeType: true,
      departmentId: true,
      locationId: true,
      jobRoleId: true,
      employeeId: true,
      employmentType: true,
      shift: true,
      hazardExposure: true,
      equipmentKey: true,
      isActive: true,
      isMandatory: true,
      dueWithinDays: true,
      renewalIntervalDays: true,
      warningIntervalDays: true,
      effectiveFrom: true,
      effectiveUntil: true,
    },
  });
  return rows as RequirementRule[];
};

// ---------------------------------------------------------------------------
// Requirement engine
// ---------------------------------------------------------------------------

export interface SyncResult {
  readonly employeeId: string;
  readonly assignmentsCreated: number;
  readonly requirementsRemoved: number;
  readonly statesWritten: number;
  readonly applicableRequirementIds: string[];
}

/**
 * Recomputes which requirements apply to one employee and reconciles their
 * assignments and compliance states.
 *
 * Called when an employee is created, when their job role / department /
 * location / shift / hazards / equipment change, when requirements change, and
 * on the nightly sweep.
 *
 * Requirements that no longer apply have their open assignments cancelled;
 * their historical training records are never touched.
 */
export const syncEmployeeRequirements = async (
  db: TenantClient,
  organizationId: string,
  employeeId: string,
  options: { actorUserId?: string | null; now?: Date; timezone?: string } = {},
): Promise<SyncResult> => {
  const now = options.now ?? new Date();
  const employee = await loadEmployeeAttributes(db, employeeId);
  if (!employee) {
    return {
      employeeId,
      assignmentsCreated: 0,
      requirementsRemoved: 0,
      statesWritten: 0,
      applicableRequirementIds: [],
    };
  }

  const allRequirements = await loadActiveRequirements(db);
  const applicable = allRequirements.filter((rule) => requirementApplies(rule, employee, now));
  const applicableIds = new Set(applicable.map((rule) => rule.id));

  const existingStates = await db.complianceState.findMany({
    where: { employeeId },
    select: { requirementId: true },
  });
  const diff = diffRequirements(
    existingStates.map((state) => state.requirementId),
    applicable,
  );

  let assignmentsCreated = 0;

  // New obligations become assignments.
  for (const rule of diff.added) {
    const existing = await db.trainingAssignment.findFirst({
      where: {
        employeeId,
        requirementId: rule.id,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });
    if (existing) continue;

    const course = await db.course.findFirst({
      where: { id: rule.courseId },
      select: { id: true, publishedVersionId: true },
    });
    if (!course) continue;

    await db.trainingAssignment.create({
      data: {
        // Passed explicitly even though the tenant client would stamp it: the
        // guard then *verifies* the value instead of silently supplying it.
        organizationId,
        employeeId,
        courseId: rule.courseId,
        courseVersionId: course.publishedVersionId,
        requirementId: rule.id,
        status: 'ASSIGNED',
        origin: 'REQUIREMENT_ENGINE',
        assignedById: options.actorUserId ?? null,
        assignedAt: now,
        dueAt: computeDueDate(rule, { assignedAt: now, hireDate: employee.hireDate }),
      },
    });
    assignmentsCreated += 1;
  }

  // Obligations that no longer apply: cancel what is still open, keep history.
  if (diff.removed.length > 0) {
    await db.trainingAssignment.updateMany({
      where: {
        employeeId,
        requirementId: { in: diff.removed },
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
      data: { status: 'CANCELLED', cancelledAt: now, notes: 'Requirement no longer applies' },
    });
    await db.complianceState.deleteMany({
      where: { employeeId, requirementId: { in: diff.removed } },
    });
  }

  const statesWritten = await recomputeComplianceStates(
    db,
    organizationId,
    employeeId,
    applicable,
    {
      now,
      timezone: options.timezone,
    },
  );

  await db.employee.updateMany({ where: { id: employeeId }, data: { requirementsStaleAt: null } });

  return {
    employeeId,
    assignmentsCreated,
    requirementsRemoved: diff.removed.length,
    statesWritten,
    applicableRequirementIds: [...applicableIds],
  };
};

/** Recomputes the (employee × requirement) compliance cells. */
export const recomputeComplianceStates = async (
  db: TenantClient,
  organizationId: string,
  employeeId: string,
  requirements: readonly RequirementRule[],
  options: { now?: Date; timezone?: string } = {},
): Promise<number> => {
  const now = options.now ?? new Date();
  let written = 0;

  for (const rule of requirements) {
    const [assignment, record, courseVersion] = await Promise.all([
      db.trainingAssignment.findFirst({
        where: { employeeId, requirementId: rule.id, status: { not: 'CANCELLED' } },
        orderBy: { assignedAt: 'desc' },
        select: { id: true, status: true, dueAt: true, startedAt: true, waivedAt: true },
      }),
      db.trainingRecord.findFirst({
        where: {
          employeeId,
          requirementId: rule.id,
          voidedAt: null,
          supersededAt: null,
          passed: true,
        },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          completedAt: true,
          expiresAt: true,
          passed: true,
          voidedAt: true,
          supersededAt: true,
        },
      }),
      db.course.findFirst({
        where: { id: rule.courseId },
        select: { publishedVersion: { select: { warningIntervalDays: true } } },
      }),
    ]);

    const warningIntervalDays =
      rule.warningIntervalDays && rule.warningIntervalDays.length > 0
        ? rule.warningIntervalDays
        : (courseVersion?.publishedVersion?.warningIntervalDays ?? DEFAULT_WARNINGS);

    const state = computeComplianceState({
      requirementId: rule.id,
      courseId: rule.courseId,
      employeeId,
      applicable: true,
      record,
      assignment,
      warningIntervalDays,
      timezone: options.timezone,
      now,
    });

    await db.complianceState.upsert({
      where: { employeeId_requirementId: { employeeId, requirementId: rule.id } },
      create: {
        organizationId,
        employeeId,
        requirementId: rule.id,
        courseId: rule.courseId,
        status: state.status,
        dueAt: state.dueAt,
        completedAt: state.completedAt,
        expiresAt: state.expiresAt,
        daysUntilExpiry: state.daysUntilExpiry,
        latestRecordId: state.latestRecordId,
        assignmentId: state.assignmentId,
        computedAt: now,
      },
      update: {
        status: state.status,
        dueAt: state.dueAt,
        completedAt: state.completedAt,
        expiresAt: state.expiresAt,
        daysUntilExpiry: state.daysUntilExpiry,
        latestRecordId: state.latestRecordId,
        assignmentId: state.assignmentId,
        computedAt: now,
      },
    });
    written += 1;
  }

  return written;
};

/**
 * Marks every employee affected by a requirement change as stale, so the sweep
 * picks them up. Cheap to call from a write path; the recomputation itself is
 * the worker's job.
 */
export const markRequirementDirty = async (
  db: TenantClient,
  now: Date = new Date(),
): Promise<number> => {
  const result = await db.employee.updateMany({
    where: { deletedAt: null, status: { not: 'TERMINATED' } },
    data: { requirementsStaleAt: now },
  });
  return result.count;
};

// ---------------------------------------------------------------------------
// Completion -> record -> certificate
// ---------------------------------------------------------------------------

export interface CompleteTrainingInput {
  readonly organizationId: string;
  readonly employeeId: string;
  readonly courseId: string;
  readonly assignmentId?: string | null;
  readonly requirementId?: string | null;
  readonly sessionId?: string | null;
  readonly enrollmentId?: string | null;
  readonly completedAt?: Date;
  readonly score?: number | null;
  readonly durationMinutes?: number | null;
  readonly instructorUserId?: string | null;
  readonly instructorName?: string | null;
  readonly practicalAssessmentId?: string | null;
  readonly evidenceFileIds?: string[];
  readonly notes?: string | null;
  readonly actorUserId?: string | null;
  readonly actorLabel?: string | null;
  readonly requestId?: string | null;
}

export interface CompleteTrainingResult {
  readonly trainingRecordId: string;
  readonly certificateId: string | null;
  readonly certificatePublicId: string | null;
  readonly expiresAt: Date | null;
  readonly supersededRecordId: string | null;
}

/**
 * Records a completed training and issues its certificate.
 *
 * Everything happens in one transaction: a record without its certificate, or a
 * certificate without its record, would both be compliance defects.
 *
 * A previous record for the same (employee, course) is marked superseded rather
 * than updated, so the history stays readable.
 */
export const completeTraining = async (
  db: TenantClient,
  input: CompleteTrainingInput,
  prisma: PrismaClient = getPrismaClient(),
): Promise<CompleteTrainingResult> => {
  const env = getEnv();
  const completedAt = input.completedAt ?? new Date();

  const course = await db.course.findFirst({
    where: { id: input.courseId },
    select: {
      id: true,
      title: true,
      publishedVersionId: true,
      publishedVersion: {
        select: {
          id: true,
          version: true,
          trainingType: true,
          deliveryMethod: true,
          renewalIntervalDays: true,
          expirationBasis: true,
          estimatedMinutes: true,
          creditHours: true,
          passingScore: true,
          issuesCertificate: true,
          safetyProfile: { select: { disclaimer: true } },
        },
      },
    },
  });

  if (!course?.publishedVersion) {
    throw new Error(`Course ${input.courseId} has no published version to record against.`);
  }

  const version = course.publishedVersion;

  const [employee, organization] = await Promise.all([
    db.employee.findFirst({
      where: { id: input.employeeId },
      select: { id: true, firstName: true, lastName: true, hireDate: true },
    }),
    prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { name: true, slug: true, settings: true },
    }),
  ]);

  if (!employee || !organization) {
    throw new Error('Employee or organization not found for completion.');
  }

  const requirement = input.requirementId
    ? await db.trainingRequirement.findFirst({
        where: { id: input.requirementId },
        select: { renewalIntervalDays: true },
      })
    : null;

  const expiresAt = computeExpiresAt(completedAt, {
    // The requirement may tighten the course's renewal interval.
    renewalIntervalDays: requirement?.renewalIntervalDays ?? version.renewalIntervalDays,
    basis: version.expirationBasis,
    hireDate: employee.hireDate,
  });

  const passingScore = version.passingScore ?? null;
  const passed = input.score == null || passingScore == null ? true : input.score >= passingScore;

  return withTenantTransaction(
    input.organizationId,
    async (tx) => {
      // Supersede the previous live record for this employee and course.
      const previous = await tx.trainingRecord.findFirst({
        where: {
          employeeId: input.employeeId,
          courseId: input.courseId,
          voidedAt: null,
          supersededAt: null,
        },
        orderBy: { completedAt: 'desc' },
        select: { id: true },
      });

      const record = await tx.trainingRecord.create({
        data: {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          courseId: input.courseId,
          courseVersionId: version.id,
          requirementId: input.requirementId ?? null,
          assignmentId: input.assignmentId ?? null,
          sessionId: input.sessionId ?? null,
          enrollmentId: input.enrollmentId ?? null,
          // Snapshot: the record must still read correctly after the course
          // is edited, re-versioned or archived.
          courseTitle: course.title,
          courseVersionNumber: version.version,
          trainingType: version.trainingType,
          deliveryMethod: version.deliveryMethod,
          instructorId: input.instructorUserId ?? null,
          instructorName: input.instructorName ?? null,
          trainingDate: completedAt,
          completedAt,
          durationMinutes: input.durationMinutes ?? version.estimatedMinutes,
          creditHours: version.creditHours,
          score: input.score ?? null,
          passingScore,
          passed,
          practicalAssessmentId: input.practicalAssessmentId ?? null,
          expiresAt,
          evidenceFileIds: input.evidenceFileIds ?? [],
          notes: input.notes ?? null,
          createdById: input.actorUserId ?? null,
        },
      });

      if (previous) {
        await tx.trainingRecord.update({
          where: { id: previous.id },
          data: { supersededById: record.id, supersededAt: completedAt },
        });
      }

      if (input.assignmentId) {
        await tx.trainingAssignment.updateMany({
          where: { id: input.assignmentId },
          data: { status: 'COMPLETED', completedAt },
        });
      }

      let certificateId: string | null = null;
      let certificatePublicId: string | null = null;

      if (version.issuesCertificate && passed) {
        // Per-tenant sequence derived from certificates already issued. The
        // unique constraint on certificateNumber is the real guard against a
        // concurrent duplicate.
        const issued = await tx.certificate.count();

        const publicId = generatePublicId();
        const certificateNumber = formatCertificateNumber({
          organizationSlug: organization.slug,
          issuedAt: completedAt,
          sequence: issued + 1,
        });

        const integrityFields = {
          publicId,
          certificateNumber,
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          courseVersionId: version.id,
          learnerName: `${employee.firstName} ${employee.lastName}`,
          courseTitle: course.title,
          completedAt,
          issuedAt: completedAt,
          expiresAt,
        };

        const settings = (organization.settings ?? {}) as { certificateDisclaimer?: string };

        const certificate = await tx.certificate.create({
          data: {
            ...integrityFields,
            integrityHash: certificateIntegrityHash(
              env.CERTIFICATE_SIGNING_SECRET,
              integrityFields,
            ),
            trainingRecordId: record.id,
            courseId: input.courseId,
            status: 'ACTIVE',
            organizationName: organization.name,
            trainingType: version.trainingType,
            deliveryMethod: version.deliveryMethod,
            instructorName: input.instructorName ?? null,
            durationMinutes: input.durationMinutes ?? version.estimatedMinutes,
            creditHours: version.creditHours,
            score: input.score ?? null,
            disclaimer:
              version.safetyProfile?.disclaimer ??
              disclaimerFor(version.trainingType, settings.certificateDisclaimer ?? null),
          },
        });

        certificateId = certificate.id;
        certificatePublicId = certificate.publicId;

        // The previous certificate for this course is superseded, not deleted.
        await tx.certificate.updateMany({
          where: {
            employeeId: input.employeeId,
            courseId: input.courseId,
            status: 'ACTIVE',
            id: { not: certificate.id },
          },
          data: { status: 'SUPERSEDED' },
        });
      }

      // Audit rows are written through the same tenant-scoped transaction, so
      // a rolled-back completion leaves no orphaned audit entry claiming it
      // happened.
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId ?? null,
          actorLabel: input.actorLabel ?? null,
          action: 'TRAINING_RECORD_CREATED',
          entityType: 'training_record',
          entityId: record.id,
          summary: `Recorded completion of ${course.title} for ${employee.firstName} ${employee.lastName}`,
          changes: {
            courseId: input.courseId,
            courseVersion: version.version,
            score: input.score ?? null,
            passed,
            expiresAt: expiresAt?.toISOString() ?? null,
            supersededRecordId: previous?.id ?? null,
          },
          requestId: input.requestId ?? null,
        },
      });

      if (certificateId) {
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId ?? null,
            actorLabel: input.actorLabel ?? null,
            action: 'CERTIFICATE_ISSUED',
            entityType: 'certificate',
            entityId: certificateId,
            summary: `Issued certificate for ${course.title}`,
            requestId: input.requestId ?? null,
          },
        });
      }

      return {
        trainingRecordId: record.id,
        certificateId,
        certificatePublicId,
        expiresAt,
        supersededRecordId: previous?.id ?? null,
      };
    },
    prisma,
  );
};

// ---------------------------------------------------------------------------
// Reading compliance
// ---------------------------------------------------------------------------

export interface ComplianceStateRow extends ComplianceResult {
  readonly employeeName: string;
  readonly courseTitle: string;
  readonly requirementName: string;
}

/** Compliance cells joined with the labels a UI or export needs. */
export const loadComplianceRows = async (
  db: TenantClient,
  where: {
    employeeIds?: readonly string[];
    departmentIds?: readonly string[];
    locationIds?: readonly string[];
    jobRoleIds?: readonly string[];
    supervisorIds?: readonly string[];
    courseIds?: readonly string[];
    statuses?: readonly string[];
  } = {},
): Promise<ComplianceStateRow[]> => {
  const rows = await db.complianceState.findMany({
    where: {
      ...(where.employeeIds ? { employeeId: { in: [...where.employeeIds] } } : {}),
      ...(where.courseIds ? { courseId: { in: [...where.courseIds] } } : {}),
      ...(where.statuses ? { status: { in: where.statuses as never[] } } : {}),
      employee: {
        deletedAt: null,
        ...(where.departmentIds ? { departmentId: { in: [...where.departmentIds] } } : {}),
        ...(where.locationIds ? { locationId: { in: [...where.locationIds] } } : {}),
        ...(where.jobRoleIds ? { jobRoleId: { in: [...where.jobRoleIds] } } : {}),
        ...(where.supervisorIds ? { supervisorId: { in: [...where.supervisorIds] } } : {}),
      },
    },
    select: {
      requirementId: true,
      courseId: true,
      employeeId: true,
      status: true,
      dueAt: true,
      completedAt: true,
      expiresAt: true,
      daysUntilExpiry: true,
      latestRecordId: true,
      assignmentId: true,
      employee: { select: { firstName: true, lastName: true } },
      requirement: { select: { name: true, course: { select: { title: true } } } },
    },
  });

  return rows.map((row) => ({
    requirementId: row.requirementId,
    courseId: row.courseId,
    employeeId: row.employeeId,
    status: row.status,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
    daysUntilExpiry: row.daysUntilExpiry,
    daysOverdue: null,
    isOverdue: row.status === 'EXPIRED',
    latestRecordId: row.latestRecordId,
    assignmentId: row.assignmentId,
    explanation: '',
    employeeName: `${row.employee.lastName}, ${row.employee.firstName}`,
    courseTitle: row.requirement.course.title,
    requirementName: row.requirement.name,
  }));
};
