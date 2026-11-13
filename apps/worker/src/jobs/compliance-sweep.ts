import { forTenant, getPrismaClient } from '@olbos/database';
import {
  computeComplianceState,
  DEFAULT_WARNING_INTERVALS,
  type ComplianceStatus,
  type RequirementRule,
} from '@olbos/core';
import { HOUR, type JobDefinition, type JobResult } from '../runtime.js';

/**
 * The compliance sweep (§14, §21).
 *
 * Recomputes every (employee × requirement) cell so that time passing — not a
 * user action — moves training from CURRENT to EXPIRING_SOON to EXPIRED. This
 * is the job that makes a compliance dashboard true at 09:00 without anyone
 * having opened the app.
 *
 * It runs per tenant, so one organization's bad data cannot stall another's.
 */

interface SweepCounters {
  organizations: number;
  employees: number;
  statesWritten: number;
  transitions: number;
  errors: number;
}

const loadRequirements = async (db: ReturnType<typeof forTenant>): Promise<RequirementRule[]> => {
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

export const complianceSweepJob: JobDefinition = {
  name: 'compliance-sweep',
  description:
    'Recomputes compliance states for every tenant so expiry transitions happen on time.',
  intervalMs: 6 * HOUR,
  initialDelayMs: 10_000,

  async run({ log, now, signal }): Promise<JobResult> {
    const prisma = getPrismaClient();
    const counters: SweepCounters = {
      organizations: 0,
      employees: 0,
      statesWritten: 0,
      transitions: 0,
      errors: 0,
    };

    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true, name: true, timezone: true, settings: true },
    });

    for (const organization of organizations) {
      if (signal.aborted) break;
      counters.organizations += 1;

      try {
        const db = forTenant(organization.id, prisma);
        const requirements = await loadRequirements(db);
        if (requirements.length === 0) continue;

        const settings = (organization.settings ?? {}) as { warningIntervalDays?: number[] };
        const orgWarnings = settings.warningIntervalDays ?? [...DEFAULT_WARNING_INTERVALS];

        // Existing cells are the work list: a cell only exists because the
        // requirement engine decided the requirement applies.
        const states = await db.complianceState.findMany({
          select: {
            id: true,
            employeeId: true,
            requirementId: true,
            courseId: true,
            status: true,
          },
        });

        const byRequirement = new Map(requirements.map((rule) => [rule.id, rule]));
        const employeeIds = new Set<string>();

        for (const state of states) {
          if (signal.aborted) break;
          const rule = byRequirement.get(state.requirementId);
          if (!rule) continue;
          employeeIds.add(state.employeeId);

          const [assignment, record] = await Promise.all([
            db.trainingAssignment.findFirst({
              where: {
                employeeId: state.employeeId,
                requirementId: rule.id,
                status: { not: 'CANCELLED' },
              },
              orderBy: { assignedAt: 'desc' },
              select: { id: true, status: true, dueAt: true, startedAt: true, waivedAt: true },
            }),
            db.trainingRecord.findFirst({
              where: {
                employeeId: state.employeeId,
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

          const next = computeComplianceState({
            requirementId: rule.id,
            courseId: state.courseId,
            employeeId: state.employeeId,
            applicable: true,
            record,
            assignment,
            warningIntervalDays:
              rule.warningIntervalDays && rule.warningIntervalDays.length > 0
                ? rule.warningIntervalDays
                : orgWarnings,
            timezone: organization.timezone,
            now,
          });

          if (next.status !== (state.status as ComplianceStatus)) counters.transitions += 1;

          await db.complianceState.update({
            where: { id: state.id },
            data: {
              status: next.status,
              dueAt: next.dueAt,
              completedAt: next.completedAt,
              expiresAt: next.expiresAt,
              daysUntilExpiry: next.daysUntilExpiry,
              latestRecordId: next.latestRecordId,
              assignmentId: next.assignmentId,
              computedAt: now,
            },
          });
          counters.statesWritten += 1;
        }

        // Assignments past their due date are marked overdue so the learner and
        // supervisor views agree with the compliance cell.
        await db.trainingAssignment.updateMany({
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, dueAt: { lt: now } },
          data: { status: 'OVERDUE' },
        });

        // Certificates follow their own expiry, independently of the cell.
        await db.certificate.updateMany({
          where: { status: 'ACTIVE', expiresAt: { lt: now } },
          data: { status: 'EXPIRED' },
        });

        counters.employees += employeeIds.size;
      } catch (error) {
        counters.errors += 1;
        // One tenant's failure must not stop the sweep for everyone else.
        log.error(
          { err: error, organizationId: organization.id, organization: organization.name },
          'compliance sweep failed for organization',
        );
      }
    }

    return {
      summary:
        `Swept ${counters.organizations} organization(s): ${counters.statesWritten} state(s) ` +
        `recomputed, ${counters.transitions} status change(s), ${counters.errors} error(s)`,
      metrics: { ...counters },
    };
  },
};
