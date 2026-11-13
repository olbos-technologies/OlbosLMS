import { z, type ZodTypeAny } from 'zod';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../errors.js';

/**
 * Request parsing and response shaping.
 *
 * Every handler validates its input through these helpers, so an unvalidated
 * `request.body` never reaches a service. Zod failures are converted to the
 * API's 422 contract by the error handler.
 */

export const parseBody = <T extends ZodTypeAny>(request: FastifyRequest, schema: T): z.infer<T> =>
  schema.parse(request.body ?? {});

export const parseQuery = <T extends ZodTypeAny>(request: FastifyRequest, schema: T): z.infer<T> =>
  schema.parse(request.query ?? {});

export const parseParams = <T extends ZodTypeAny>(request: FastifyRequest, schema: T): z.infer<T> =>
  schema.parse(request.params ?? {});

export const uuidSchema = z.guid('Expected an identifier');

/**
 * A boolean from a query string.
 *
 * NOT `z.coerce.boolean()`: that applies JavaScript truthiness, so the string
 * "false" coerces to `true` and `?includePlanned=false` silently means the
 * opposite of what the caller asked for.
 */
export const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : value === 'true' || value === '1' || value === 'yes',
  );

export const idParams = z.object({ id: uuidSchema });

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const toSkipTake = (pagination: Pagination): { skip: number; take: number } => ({
  skip: (pagination.page - 1) * pagination.pageSize,
  take: pagination.pageSize,
});

/**
 * Turns a caller-supplied sort field into a Prisma `orderBy`, but only for
 * fields the endpoint explicitly allows. Anything else is a 400 rather than an
 * opening to order by a column the caller should not know about.
 */
export const toOrderBy = <T extends string>(
  pagination: Pagination,
  allowed: readonly T[],
  fallback: T,
): Record<string, 'asc' | 'desc'> => {
  const field = pagination.sort as T | undefined;
  if (field && !allowed.includes(field)) {
    throw ApiError.badRequest(`Cannot sort by "${field}".`, [
      { field: 'sort', message: `Allowed values: ${allowed.join(', ')}` },
    ]);
  }
  return { [field ?? fallback]: pagination.order };
};

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface Envelope<T> {
  readonly data: T;
  readonly meta?: Record<string, unknown>;
}

export const ok = <T>(data: T, meta?: Record<string, unknown>): Envelope<T> =>
  meta ? { data, meta } : { data };

export const paginated = <T>(
  items: T[],
  total: number,
  pagination: Pagination,
  extra?: Record<string, unknown>,
): Envelope<T[]> => ({
  data: items,
  meta: {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    ...extra,
  },
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const escapeCsv = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: readonly (readonly unknown[])[]): string =>
  rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

/**
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet treat a cell as a formula.
 * Exports are opened in Excel by definition, so values are neutralised here.
 */
export const csvSafe = (value: string | null | undefined): string => {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};
