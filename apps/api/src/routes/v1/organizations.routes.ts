import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { type Prisma } from '@olbos/database';
import { DEFAULT_WARNING_INTERVALS } from '@olbos/core';
import { ok, parseBody } from '../../lib/http.js';
import { diffSnapshots } from '../../services/audit.service.js';

/**
 * Organization profile and settings.
 *
 * The tenant is always the caller's own: there is no `:organizationId`
 * parameter anywhere in this file, by design.
 *
 * `Organization` is the one model the tenant guard cannot scope, because it is
 * the tenant rather than something a tenant owns — it has an `id`, not an
 * `organizationId`, so it is deliberately absent from `TENANT_OWNED_MODELS`.
 * What keeps these handlers safe is that every `where` is keyed on the
 * `organizationId` resolved from the session. They still query through
 * `request.db` rather than an unscoped client so that any tenant-owned model
 * queried here later is guarded by default instead of by whoever notices.
 */
export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/organizations/current', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:read');

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        type: true,
        status: true,
        timezone: true,
        locale: true,
        primaryDomain: true,
        brandColor: true,
        settings: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            employees: true,
            courses: true,
            departments: true,
            locations: true,
          },
        },
      },
    });

    return ok(organization);
  });

  app.patch('/organizations/current', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:update');

    const body = parseBody(
      request,
      z.object({
        name: z.string().trim().min(2).max(200).optional(),
        legalName: z.string().trim().max(200).nullable().optional(),
        timezone: z.string().max(64).optional(),
        locale: z.string().max(16).optional(),
        primaryDomain: z.string().max(200).nullable().optional(),
        brandColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #0f4c81')
          .nullable()
          .optional(),
      }),
    );

    const before = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        legalName: true,
        timezone: true,
        locale: true,
        primaryDomain: true,
        brandColor: true,
      },
    });

    const organization = await db.organization.update({
      where: { id: organizationId },
      data: body,
      select: { id: true, name: true, timezone: true, locale: true, brandColor: true },
    });

    await request.audit({
      action: 'ORGANIZATION_UPDATED',
      entityType: 'organization',
      entityId: organizationId,
      summary: 'Updated organization profile',
      changes: diffSnapshots(
        (before ?? {}) as Record<string, unknown>,
        body as Record<string, unknown>,
      ),
    });

    return ok(organization);
  });

  /**
   * Organization-wide training policy.
   *
   * Note what is *not* here: no regulatory defaults. Warning ladders and
   * renewal intervals are the organization's own policy, and OLBOS never
   * pre-fills them with a claim about what a regulation requires (§14).
   */
  app.get('/organizations/current/settings', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:manage_settings');

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const settings = (organization?.settings ?? {}) as Record<string, unknown>;

    return ok({
      warningIntervalDays: settings.warningIntervalDays ?? [...DEFAULT_WARNING_INTERVALS],
      certificateDisclaimer: settings.certificateDisclaimer ?? null,
      notificationDefaults: settings.notificationDefaults ?? {},
      raw: settings,
    });
  });

  app.patch('/organizations/current/settings', async (request) => {
    const { organizationId, db } = request.requireTenant();
    request.authorize('organization:manage_settings');

    const body = parseBody(
      request,
      z.object({
        warningIntervalDays: z.array(z.number().int().min(1).max(3650)).max(10).optional(),
        certificateDisclaimer: z.string().max(2000).nullable().optional(),
        notificationDefaults: z.record(z.string(), z.unknown()).optional(),
      }),
    );

    const current = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    // Prisma's JSON input type does not accept `Record<string, unknown>`
    // directly; the round-trip pins it to a plain JSON value.
    const merged = JSON.parse(
      JSON.stringify({ ...((current?.settings ?? {}) as object), ...body }),
    ) as Prisma.InputJsonObject;

    await db.organization.update({
      where: { id: organizationId },
      data: { settings: merged },
    });

    await request.audit({
      action: 'SETTINGS_UPDATED',
      entityType: 'organization',
      entityId: organizationId,
      summary: 'Updated organization training settings',
      changes: body as Record<string, unknown>,
    });

    return ok(merged);
  });
};
