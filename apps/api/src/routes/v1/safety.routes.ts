import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  isPracticalComplete,
  scorePracticalAssessment,
  summarise,
  type ComplianceStatus,
  type CriterionEntry,
} from '@olbos/core';
import { ApiError } from '../../errors.js';
import {
  idParams,
  ok,
  paginated,
  paginationSchema,
  parseBody,
  parseParams,
  parseQuery,
  toSkipTake,
  uuidSchema,
} from '../../lib/http.js';

/**
 * Safety command centre, practical assessments, incidents and observations
 * (§16, §19, §22).
 */
export const safetyRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // Safety command centre (§19)
  // -------------------------------------------------------------------------

  app.get('/safety/dashboard', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('SAFETY_MODULE');
    request.authorize('safety:read_dashboard');

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      states,
      employeeCount,
      completedThisMonth,
      expiringCertificates,
      openIncidents,
      openActions,
    ] = await Promise.all([
      db.complianceState.findMany({
        select: { status: true, employeeId: true, daysUntilExpiry: true },
      }),
      db.employee.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      db.trainingRecord.count({ where: { completedAt: { gte: monthStart }, voidedAt: null } }),
      db.certificate.count({
        where: {
          status: 'ACTIVE',
          expiresAt: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) },
        },
      }),
      db.incident.count({ where: { status: { in: ['REPORTED', 'UNDER_INVESTIGATION'] } } }),
      db.correctiveAction.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    const summary = summarise(states.map((state) => state.status as ComplianceStatus));

    const employeesWithProblems = new Set(
      states
        .filter((state) => state.status === 'MISSING' || state.status === 'EXPIRED')
        .map((state) => state.employeeId),
    );

    return ok({
      kpis: {
        overallCompliancePercent: summary.compliancePercent,
        employeesMissingTraining: employeesWithProblems.size,
        trainingItemsExpiring: summary.expiringSoon,
        expiredCertifications: summary.expired,
        completedThisMonth,
        activeEmployees: employeeCount,
        expiringCertificates,
        openIncidents,
        openCorrectiveActions: openActions,
      },
      breakdown: summary,
      generatedAt: now.toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // Practical assessments (§16)
  // -------------------------------------------------------------------------

  app.get('/safety/practical-templates', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('PRACTICAL_ASSESSMENTS');
    request.authorize('practical_assessment:read');

    return ok(
      await db.practicalAssessmentTemplate.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          requireAllCriteria: true,
          passingPercent: true,
          requiresEmployeeAcknowledgment: true,
          courseVersion: { select: { id: true, title: true, courseId: true } },
          criteria: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              text: true,
              guidance: true,
              position: true,
              isCritical: true,
              weight: true,
            },
          },
        },
      }),
    );
  });

  /**
   * Records an observed practical assessment.
   *
   * The pass/fail decision comes from the scoring engine, not from the client:
   * a UI that mis-computed a pass could otherwise create a training record for
   * someone who failed a critical step.
   */
  app.post('/safety/practical-assessments', async (request, reply) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.requireEntitlement('PRACTICAL_ASSESSMENTS');
    const body = parseBody(
      request,
      z.object({
        templateId: uuidSchema,
        employeeId: uuidSchema,
        sessionId: uuidSchema.optional(),
        assessedAt: z.coerce.date().optional(),
        comments: z.string().max(4000).optional(),
        assessorSignature: z.string().trim().min(2).max(200),
        employeeSignature: z.string().trim().max(200).optional(),
        results: z
          .array(
            z.object({
              criterionId: uuidSchema,
              result: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
              comment: z.string().max(1000).optional(),
            }),
          )
          .min(1),
      }),
    );

    const [template, employee] = await Promise.all([
      db.practicalAssessmentTemplate.findFirst({
        where: { id: body.templateId, isActive: true },
        select: {
          id: true,
          name: true,
          requireAllCriteria: true,
          passingPercent: true,
          requiresEmployeeAcknowledgment: true,
          criteria: { select: { id: true, text: true, isCritical: true, weight: true } },
        },
      }),
      db.employee.findFirst({
        where: { id: body.employeeId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, departmentId: true, locationId: true },
      }),
    ]);

    if (!template) throw ApiError.notFound('Practical assessment template');
    if (!employee) throw ApiError.notFound('Employee');

    request.authorize('practical_assessment:record', {
      departmentId: employee.departmentId,
      locationId: employee.locationId,
      subjectEmployeeId: employee.id,
    });

    const score = scorePracticalAssessment(
      template.criteria.map((criterion) => ({
        id: criterion.id,
        text: criterion.text,
        isCritical: criterion.isCritical,
        weight: Number(criterion.weight),
      })),
      body.results as CriterionEntry[],
      {
        requireAllCriteria: template.requireAllCriteria,
        passingPercent: template.passingPercent,
        requiresEmployeeAcknowledgment: template.requiresEmployeeAcknowledgment,
      },
    );

    if (score.unscoredCriterionIds.length > 0) {
      throw ApiError.unprocessable(
        'Every criterion must be assessed before the assessment can be recorded.',
        score.unscoredCriterionIds.map((id) => ({ field: id, message: 'Not assessed' })),
      );
    }

    const now = body.assessedAt ?? new Date();

    const assessment = await db.practicalAssessment.create({
      data: {
        organizationId,
        templateId: body.templateId,
        employeeId: body.employeeId,
        sessionId: body.sessionId ?? null,
        assessorId: principal.userId,
        assessorName: `${principal.firstName} ${principal.lastName}`,
        assessedAt: now,
        passed: score.passed,
        scorePercent: score.scorePercent,
        comments: body.comments ?? null,
        assessorSignature: body.assessorSignature,
        assessorSignedAt: now,
        employeeSignature: body.employeeSignature ?? null,
        employeeAcknowledgedAt: body.employeeSignature ? now : null,
        results: {
          create: body.results.map((result) => ({
            organizationId,
            criterionId: result.criterionId,
            result: result.result,
            comment: result.comment ?? null,
          })),
        },
      },
    });

    const completion = isPracticalComplete(
      score,
      { assessorSignedAt: now, employeeAcknowledgedAt: body.employeeSignature ? now : null },
      { requiresEmployeeAcknowledgment: template.requiresEmployeeAcknowledgment },
    );

    await request.audit({
      action: 'PRACTICAL_ASSESSMENT_RECORDED',
      entityType: 'practical_assessment',
      entityId: assessment.id,
      summary: `${score.passed ? 'Passed' : 'Failed'} ${template.name} — ${employee.firstName} ${employee.lastName}`,
      changes: { passed: score.passed, scorePercent: score.scorePercent, reason: score.reason },
    });

    return reply.status(201).send(
      ok(assessment, {
        score,
        completion,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Incidents (§22)
  // -------------------------------------------------------------------------

  app.get('/safety/incidents', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('INCIDENT_MANAGEMENT');
    request.authorize('incident:read');

    const pagination = parseQuery(request, paginationSchema);
    const query = parseQuery(
      request,
      z.object({
        status: z
          .enum(['REPORTED', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION', 'CLOSED'])
          .optional(),
      }),
    );
    const { skip, take } = toSkipTake(pagination);
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      db.incident.findMany({
        where,
        skip,
        take,
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          reference: true,
          title: true,
          severity: true,
          status: true,
          occurredAt: true,
          reportedAt: true,
          areaDescription: true,
          rootCause: true,
          location: { select: { id: true, name: true } },
          subject: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { correctiveActions: true } },
        },
      }),
      db.incident.count({ where }),
    ]);

    return paginated(items, total, pagination);
  });

  app.post('/safety/incidents', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.requireEntitlement('INCIDENT_MANAGEMENT');
    request.authorize('incident:create');

    const body = parseBody(
      request,
      z.object({
        title: z.string().trim().min(5).max(200),
        description: z.string().trim().min(10).max(8000),
        severity: z.enum([
          'NEAR_MISS',
          'FIRST_AID',
          'MEDICAL_TREATMENT',
          'LOST_TIME',
          'FATALITY',
          'PROPERTY_DAMAGE',
          'ENVIRONMENTAL',
        ]),
        occurredAt: z.coerce.date(),
        locationId: uuidSchema.optional(),
        areaDescription: z.string().max(500).optional(),
        subjectEmployeeId: uuidSchema.optional(),
      }),
    );

    const count = await db.incident.count();
    const reference = `INC-${new Date().getUTCFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const incident = await db.incident.create({
      data: {
        organizationId,
        reference,
        title: body.title,
        description: body.description,
        severity: body.severity,
        status: 'REPORTED',
        occurredAt: body.occurredAt,
        reportedById: request.principal?.userId ?? null,
        locationId: body.locationId ?? null,
        areaDescription: body.areaDescription ?? null,
        subjectEmployeeId: body.subjectEmployeeId ?? null,
      },
    });

    await request.audit({
      action: 'INCIDENT_REPORTED',
      entityType: 'incident',
      entityId: incident.id,
      summary: `Reported ${reference}: ${body.title}`,
      changes: { severity: body.severity },
    });

    return reply.status(201).send(ok(incident));
  });

  /**
   * Attaches remedial training to a corrective action.
   *
   * OLBOS never decides that an incident requires training. An authorised EHS
   * user names the courses; this endpoint records that decision and creates the
   * assignments (§22).
   */
  app.post('/safety/corrective-actions/:id/assign-training', async (request) => {
    const { organizationId, principal, db } = request.requireTenant();
    request.requireEntitlement('INCIDENT_MANAGEMENT');
    request.authorize('corrective_action:manage');
    request.authorize('training_assignment:create');

    const { id } = parseParams(request, idParams);
    const body = parseBody(
      request,
      z.object({
        courseIds: z.array(uuidSchema).min(1).max(20),
        employeeIds: z.array(uuidSchema).min(1).max(500),
        dueAt: z.coerce.date().optional(),
      }),
    );

    const action = await db.correctiveAction.findFirst({
      where: { id },
      select: { id: true, title: true },
    });
    if (!action) throw ApiError.notFound('Corrective action');

    const courses = await db.course.findMany({
      where: { id: { in: body.courseIds }, status: 'PUBLISHED' },
      select: { id: true, title: true, publishedVersionId: true },
    });
    if (courses.length === 0) throw ApiError.notFound('Published course');

    let created = 0;
    for (const course of courses) {
      for (const employeeId of body.employeeIds) {
        const existing = await db.trainingAssignment.findFirst({
          where: { employeeId, courseId: course.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
          select: { id: true },
        });
        if (existing) continue;

        await db.trainingAssignment.create({
          data: {
            organizationId,
            employeeId,
            courseId: course.id,
            courseVersionId: course.publishedVersionId,
            status: 'ASSIGNED',
            origin: 'INCIDENT_CORRECTIVE_ACTION',
            assignedById: principal.userId,
            dueAt: body.dueAt ?? null,
            notes: `Corrective action: ${action.title}`,
          },
        });
        created += 1;
      }
    }

    await db.correctiveAction.update({
      where: { id },
      data: { trainingCourseIds: body.courseIds, trainingAssignedAt: new Date() },
    });

    await request.audit({
      action: 'TRAINING_ASSIGNED',
      entityType: 'corrective_action',
      entityId: id,
      summary: `Assigned ${created} remedial training item(s) for "${action.title}"`,
      changes: { courseIds: body.courseIds, employeeCount: body.employeeIds.length },
    });

    return ok({ assignmentsCreated: created });
  });

  // -------------------------------------------------------------------------
  // Observations
  // -------------------------------------------------------------------------

  app.post('/safety/observations', async (request, reply) => {
    const { organizationId, db } = request.requireTenant();
    request.requireEntitlement('SAFETY_MODULE');
    request.authorize('observation:create');

    const body = parseBody(
      request,
      z.object({
        type: z.enum([
          'SAFE_BEHAVIOUR',
          'AT_RISK_BEHAVIOUR',
          'UNSAFE_CONDITION',
          'GOOD_CATCH',
          'SUGGESTION',
        ]),
        description: z.string().trim().min(10).max(4000),
        locationId: uuidSchema.optional(),
        areaDescription: z.string().max(500).optional(),
        departmentId: uuidSchema.optional(),
        riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
        immediateActionTaken: z.string().max(2000).optional(),
        isAnonymous: z.boolean().default(false),
      }),
    );

    const observation = await db.safetyObservation.create({
      data: {
        organizationId,
        type: body.type,
        description: body.description,
        locationId: body.locationId ?? null,
        areaDescription: body.areaDescription ?? null,
        departmentId: body.departmentId ?? null,
        riskLevel: body.riskLevel,
        immediateActionTaken: body.immediateActionTaken ?? null,
        isAnonymous: body.isAnonymous,
        // An anonymous report stores no reporter: the promise has to be real.
        reportedById: body.isAnonymous ? null : (request.principal?.userId ?? null),
        observedAt: new Date(),
        status: 'OPEN',
      },
    });

    return reply.status(201).send(ok(observation));
  });

  app.get('/safety/observations', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('SAFETY_MODULE');
    request.authorize('observation:read');

    const pagination = parseQuery(request, paginationSchema);
    const { skip, take } = toSkipTake(pagination);

    const [items, total] = await Promise.all([
      db.safetyObservation.findMany({
        skip,
        take,
        orderBy: { observedAt: 'desc' },
        select: {
          id: true,
          type: true,
          description: true,
          riskLevel: true,
          status: true,
          observedAt: true,
          areaDescription: true,
          isAnonymous: true,
          location: { select: { id: true, name: true } },
          reportedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      db.safetyObservation.count(),
    ]);

    // An anonymous observation never reveals its reporter, whatever the reader
    // is allowed to see elsewhere.
    return paginated(
      items.map((item) => (item.isAnonymous ? { ...item, reportedBy: null } : item)),
      total,
      pagination,
    );
  });

  app.get('/safety/jha', async (request) => {
    const { db } = request.requireTenant();
    request.requireEntitlement('SAFETY_MODULE');
    request.authorize('jha:read');

    return ok(
      await db.jhaJsa.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          overallRisk: true,
          reviewedAt: true,
          nextReviewAt: true,
          location: { select: { id: true, name: true } },
          tasks: {
            orderBy: { step: 'asc' },
            select: {
              id: true,
              step: true,
              description: true,
              hazards: {
                select: {
                  id: true,
                  hazard: true,
                  hazardCategory: true,
                  riskLevel: true,
                  controls: true,
                  recommendedCourseIds: true,
                },
              },
            },
          },
        },
      }),
    );
  });
};
