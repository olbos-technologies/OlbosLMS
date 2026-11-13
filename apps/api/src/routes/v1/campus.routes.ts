import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../errors.js';
import {
  ok,
  paginated,
  paginationSchema,
  parseBody,
  parseQuery,
  toSkipTake,
  uuidSchema,
} from '../../lib/http.js';

const code = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((v) => v.toUpperCase());
const name = z.string().trim().min(2).max(200);
const date = z
  .string()
  .date()
  .transform((v) => new Date(`${v}T00:00:00Z`));
const programBody = z
  .object({
    code,
    name,
    award: z.enum(['CERTIFICATE', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE']),
    requiredCredits: z.number().int().min(1).max(500),
  })
  .strict();
const termBody = z
  .object({ code, name, startsOn: date, endsOn: date })
  .strict()
  .refine((v) => v.endsOn >= v.startsOn, {
    message: 'Term end must be on or after its start.',
    path: ['endsOn'],
  });
const courseBody = z
  .object({ code, title: name, programId: uuidSchema, credits: z.number().int().min(0).max(30) })
  .strict();
const sectionBody = z
  .object({
    code,
    academicCourseId: uuidSchema,
    termId: uuidSchema,
    capacity: z.number().int().min(1).max(10000),
    lmsCourseId: uuidSchema.optional(),
  })
  .strict();

export const campusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/campus/programs', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('campus:read');
    const page = parseQuery(request, paginationSchema);
    const [rows, total] = await Promise.all([
      db.academicProgram.findMany({ ...toSkipTake(page), orderBy: { code: 'asc' } }),
      db.academicProgram.count(),
    ]);
    return paginated(rows, total, page);
  });
  app.get('/campus/terms', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('campus:read');
    const page = parseQuery(request, paginationSchema);
    const [rows, total] = await Promise.all([
      db.academicTerm.findMany({ ...toSkipTake(page), orderBy: { startsOn: 'desc' } }),
      db.academicTerm.count(),
    ]);
    return paginated(rows, total, page);
  });
  app.get('/campus/courses', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('campus:read');
    const page = parseQuery(request, paginationSchema);
    const [rows, total] = await Promise.all([
      db.academicCourse.findMany({ ...toSkipTake(page), orderBy: { code: 'asc' } }),
      db.academicCourse.count(),
    ]);
    return paginated(rows, total, page);
  });
  app.get('/campus/sections', async (request) => {
    const { db } = request.requireTenant();
    request.authorize('campus:read');
    const page = parseQuery(request, paginationSchema);
    const [rows, total] = await Promise.all([
      db.academicSection.findMany({ ...toSkipTake(page), orderBy: { createdAt: 'desc' } }),
      db.academicSection.count(),
    ]);
    return paginated(rows, total, page);
  });
  app.post('/campus/programs', async (request, reply) => {
    const { db, organizationId } = request.requireTenant();
    request.authorize('campus:manage');
    request.requireEntitlement('CAMPUS_MODULE');
    const body = parseBody(request, programBody);
    const row = await db.academicProgram.create({ data: { ...body, organizationId } });
    await request.audit({
      action: 'CAMPUS_PROGRAM_CREATED',
      entityType: 'academic_program',
      entityId: row.id,
      summary: 'Created academic program',
    });
    return reply.code(201).send(ok(row));
  });
  app.post('/campus/terms', async (request, reply) => {
    const { db, organizationId } = request.requireTenant();
    request.authorize('campus:manage');
    request.requireEntitlement('CAMPUS_MODULE');
    const body = parseBody(request, termBody);
    const row = await db.academicTerm.create({ data: { ...body, organizationId } });
    await request.audit({
      action: 'CAMPUS_TERM_CREATED',
      entityType: 'academic_term',
      entityId: row.id,
      summary: 'Created academic term',
    });
    return reply.code(201).send(ok(row));
  });
  app.post('/campus/courses', async (request, reply) => {
    const { db, organizationId } = request.requireTenant();
    request.authorize('campus:manage');
    request.requireEntitlement('CAMPUS_MODULE');
    const body = parseBody(request, courseBody);
    if (!(await db.academicProgram.findFirst({ where: { id: body.programId } })))
      throw ApiError.notFound('Program');
    const row = await db.academicCourse.create({ data: { ...body, organizationId } });
    await request.audit({
      action: 'CAMPUS_COURSE_CREATED',
      entityType: 'academic_course',
      entityId: row.id,
      summary: 'Created academic catalog course',
    });
    return reply.code(201).send(ok(row));
  });
  app.post('/campus/sections', async (request, reply) => {
    const { db, organizationId } = request.requireTenant();
    request.authorize('campus:manage');
    request.requireEntitlement('CAMPUS_MODULE');
    const body = parseBody(request, sectionBody);
    if (!(await db.academicCourse.findFirst({ where: { id: body.academicCourseId } })))
      throw ApiError.notFound('Academic course');
    if (!(await db.academicTerm.findFirst({ where: { id: body.termId } })))
      throw ApiError.notFound('Term');
    if (body.lmsCourseId) {
      request.authorize('course:read');
      const course = await db.course.findFirst({
        where: { id: body.lmsCourseId, deletedAt: null, archivedAt: null },
      });
      if (!course) throw ApiError.notFound('LMS course');
      if (course.type !== 'ACADEMIC') throw ApiError.unprocessable('Link an academic LMS course.');
    }
    const row = await db.academicSection.create({ data: { ...body, organizationId } });
    await request.audit({
      action: 'CAMPUS_SECTION_CREATED',
      entityType: 'academic_section',
      entityId: row.id,
      summary: 'Created academic section',
    });
    return reply.code(201).send(ok(row));
  });
};
