import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ok, parseBody } from '../../lib/http.js';
import { buildInstitutionSetup } from '@olbos/core';

const timezone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid IANA timezone.');

export const institutionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/institutions/setup', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:update');
    const [organization, programs, terms, courses, sections, administrators] = await Promise.all([
      db.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          legalName: true,
          contactEmail: true,
          billingEmail: true,
          websiteUrl: true,
          timezone: true,
          brandColor: true,
        },
      }),
      db.academicProgram.count(),
      db.academicTerm.count(),
      db.academicCourse.count(),
      db.academicSection.count(),
      db.userRole.count({
        where: {
          role: { permissions: { has: 'organization:update' } },
          user: { status: 'ACTIVE', deletedAt: null },
          scopeType: 'ORGANIZATION',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);
    return ok({
      organization,
      checklist: buildInstitutionSetup({
        profileReady: !!organization.contactEmail && !!organization.legalName,
        programs,
        terms,
        courses,
        sections,
        administrators,
      }),
      counts: { programs, terms, courses, sections, administrators },
    });
  });
  app.patch('/institutions/profile', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:update');
    const body = parseBody(
      request,
      z
        .object({
          name: z.string().trim().min(2).max(200),
          legalName: z.string().trim().min(2).max(200),
          type: z.enum(['UNIVERSITY', 'COLLEGE', 'SCHOOL', 'TRAINING_CENTER', 'OTHER']),
          contactEmail: z.string().trim().email().max(320),
          billingEmail: z.string().trim().email().max(320).nullable().optional(),
          websiteUrl: z
            .string()
            .url()
            .max(500)
            .refine((value) => new URL(value).protocol === 'https:', 'Use an HTTPS website URL.')
            .nullable(),
          timezone,
          brandColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .nullable(),
        })
        .strict(),
    );
    if ('billingEmail' in body) request.authorize('billing:manage');
    const organization = await db.$transaction(async (tx) => {
      const row = await tx.organization.update({
        where: { id: organizationId },
        data: body,
        select: { id: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: request.principal!.userId,
          action: 'ORGANIZATION_UPDATED',
          entityType: 'organization',
          entityId: organizationId,
          summary: 'Updated institution profile',
        },
      });
      return row;
    });
    return ok(organization);
  });
};
