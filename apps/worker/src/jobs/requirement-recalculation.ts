import { forTenant, getPrismaClient } from '@olbos/database';
import {
  computeComplianceState,
  computeDueDate,
  diffRequirements,
  requirementApplies,
  type EmployeeAttributes,
  type RequirementRule,
} from '@olbos/core';
import { MINUTE, type JobDefinition, type JobResult } from '../runtime.js';

/**
 * Requirement recalculation (§13).
 *
 * The API recalculates one employee synchronously when their attributes change,
 * which is what the person doing the edit needs to see. This job handles the
 * bulk case: a requirement was created, edited or deactivated, so every
 * employee in the tenant was marked stale and has to be re-evaluated.
 *
 * It processes a bounded batch per tick, so creating a requirement in a
 * 20,000-employee tenant does not become one enormous transaction.
 */

const BATCH_SIZE = 250;

export const requirementRecalculationJob: JobDefinition = {
  name: 'requirement-recalculation',
  description: 'Re-evaluates training obligations for employees flagged as stale.',
  intervalMs: 2 * MINUTE,
  initialDelayMs: 20_000,

  async run({ log, now, signal }): Promise<JobResult> {
    const prisma = getPrismaClient();

    let processed = 0;
    let assignmentsCreated = 0;
    let obligationsWithdrawn = 0;
    let organizations = 0;

    const stale = await prisma.employee.findMany({
      where: { requirementsStaleAt: { not: null }, deletedAt: null },
      orderBy: { requirementsStaleAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, organizationId: true },
    });

    if (stale.length === 0) {
      return { summary: 'No employees needed re-evaluation', metrics: { processed: 0 } };
    }

    // Group by tenant so requirements are loaded once per organization rather
    // than once per employee.
    const byOrganization = new Map<string, string[]>();
    for (const employee of stale) {
      const list = byOrganization.get(employee.organizationId);
      if (list) list.push(employee.id);
      else byOrganization.set(employee.organizationId, [employee.id]);
    }

    for (const [organizationId, employeeIds] of byOrganization) {
      if (signal.aborted) break;
      organizations += 1;

      const db = forTenant(organizationId, prisma);
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      });

      const requirements = (await db.trainingRequirement.findMany({
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
      })) as RequirementRule[];

      for (const employeeId of employeeIds) {
        if (signal.aborted) break;

        try {
          const row = await db.employee.findFirst({
            where: { id: employeeId },
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
          if (!row) continue;

          const employee: EmployeeAttributes = {
            id: row.id,
            status: row.status,
            departmentId: row.departmentId,
            locationId: row.locationId,
            jobRoleId: row.jobRoleId,
            employmentType: row.employmentType,
            shift: row.shift,
            hireDate: row.hireDate,
            hazardExposures: row.hazardExposures,
            equipmentAuthorizations: row.equipmentAuthorizations,
            jobRoleHazardExposures: row.jobRole?.hazardExposures ?? [],
          };

          const applicable = requirements.filter((rule) => requirementApplies(rule, employee, now));
          const existing = await db.complianceState.findMany({
            where: { employeeId },
            select: { requirementId: true },
          });
          const diff = diffRequirements(
            existing.map((state) => state.requirementId),
            applicable,
          );

          for (const rule of diff.added) {
            const course = await db.course.findFirst({
              where: { id: rule.courseId },
              select: { publishedVersionId: true },
            });
            const open = await db.trainingAssignment.findFirst({
              where: {
                employeeId,
                requirementId: rule.id,
                status: { in: ['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'] },
              },
              select: { id: true },
            });
            if (open) continue;

            await db.trainingAssignment.create({
              data: {
                organizationId,
                employeeId,
                courseId: rule.courseId,
                courseVersionId: course?.publishedVersionId ?? null,
                status: 'ASSIGNED',
                origin: 'REQUIREMENT_ENGINE',
                assignedAt: now,
                dueAt: computeDueDate(rule, { assignedAt: now, hireDate: employee.hireDate }),
              },
            });
            assignmentsCreated += 1;
          }

          if (diff.removed.length > 0) {
            await db.trainingAssignment.updateMany({
              where: {
                employeeId,
                requirementId: { in: diff.removed },
                status: { in: ['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'] },
              },
              data: {
                status: 'CANCELLED',
                cancelledAt: now,
                notes: 'Requirement no longer applies',
              },
            });
            // The obligation goes; the training record stays. Someone really
            // did complete that course.
            await db.complianceState.deleteMany({
              where: { employeeId, requirementId: { in: diff.removed } },
            });
            obligationsWithdrawn += diff.removed.length;
          }

          for (const rule of applicable) {
            const [assignment, record] = await Promise.all([
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
            ]);

            const state = computeComplianceState({
              requirementId: rule.id,
              courseId: rule.courseId,
              employeeId,
              applicable: true,
              record,
              assignment,
              timezone: organization?.timezone,
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
          }

          await db.employee.updateMany({
            where: { id: employeeId },
            data: { requirementsStaleAt: null },
          });
          processed += 1;
        } catch (error) {
          log.error({ err: error, employeeId, organizationId }, 're-evaluation failed');
        }
      }
    }

    return {
      summary:
        `Re-evaluated ${processed} employee(s) across ${organizations} organization(s): ` +
        `${assignmentsCreated} assigned, ${obligationsWithdrawn} withdrawn`,
      metrics: { processed, assignmentsCreated, obligationsWithdrawn, organizations },
    };
  },
};
