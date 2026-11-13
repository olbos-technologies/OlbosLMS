import { ZodError } from 'zod';
import { TenantIsolationError } from '@olbos/database';
import { ForbiddenError } from '@olbos/permissions';
import { EntitlementRequiredError, UsageLimitExceededError } from '@olbos/billing';
import { AiUnavailableError } from '@olbos/ai';
import { StorageError } from '@olbos/storage';

/**
 * One error shape for the whole API.
 *
 * Two rules:
 *   * The client is told what it can act on and nothing more. Stack traces,
 *     SQL and internal identifiers never cross the boundary.
 *   * A tenant isolation violation is a 500 and an alert, never a 403 — a 403
 *     would confirm to a caller that the resource exists in another tenant.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ENTITLEMENT_REQUIRED'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ENTITLEMENT_REQUIRED: 402,
  USAGE_LIMIT_EXCEEDED: 402,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export interface ErrorDetail {
  readonly field?: string;
  readonly message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
    /** Extra context for the log only; never serialised to the client. */
    readonly logContext?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = STATUS_BY_CODE[code];
  }

  static badRequest(message: string, details: ErrorDetail[] = []): ApiError {
    return new ApiError('BAD_REQUEST', message, details);
  }

  static unauthenticated(message = 'Sign in to continue.'): ApiError {
    return new ApiError('UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have permission to do that.'): ApiError {
    return new ApiError('FORBIDDEN', message);
  }

  /**
   * Used for both "does not exist" and "exists in another tenant". Callers must
   * not be able to tell the two apart.
   */
  static notFound(resource = 'Resource'): ApiError {
    return new ApiError('NOT_FOUND', `${resource} was not found.`);
  }

  static conflict(message: string): ApiError {
    return new ApiError('CONFLICT', message);
  }

  static unprocessable(message: string, details: ErrorDetail[] = []): ApiError {
    return new ApiError('UNPROCESSABLE', message, details);
  }
}

export interface SerialisedError {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: ErrorDetail[];
    readonly requestId: string;
  };
}

const zodDetails = (error: ZodError): ErrorDetail[] =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
  }));

export interface NormalisedError {
  readonly status: number;
  readonly body: SerialisedError;
  /** True when the operations team should be paged, not just informed. */
  readonly alert: boolean;
  readonly logLevel: 'warn' | 'error';
  readonly cause: unknown;
}

/** Maps any thrown value onto the API's error contract. */
export const normaliseError = (error: unknown, requestId: string): NormalisedError => {
  const build = (
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[],
    options: { alert?: boolean; logLevel?: 'warn' | 'error' } = {},
  ): NormalisedError => ({
    status: STATUS_BY_CODE[code],
    body: {
      error: {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
        requestId,
      },
    },
    alert: options.alert ?? false,
    logLevel: options.logLevel ?? (STATUS_BY_CODE[code] >= 500 ? 'error' : 'warn'),
    cause: error,
  });

  if (error instanceof ApiError) {
    return build(error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return build('VALIDATION_FAILED', 'Some fields need attention.', zodDetails(error));
  }

  if (error instanceof TenantIsolationError) {
    // Application code tried to cross a tenant boundary. This is a bug, and the
    // caller learns nothing about it.
    return build('INTERNAL_ERROR', 'Something went wrong.', undefined, {
      alert: true,
      logLevel: 'error',
    });
  }

  if (error instanceof ForbiddenError) {
    return build('FORBIDDEN', 'You do not have permission to do that.');
  }

  if (error instanceof EntitlementRequiredError) {
    return build('ENTITLEMENT_REQUIRED', error.message);
  }

  if (error instanceof UsageLimitExceededError) {
    return build('USAGE_LIMIT_EXCEEDED', error.message);
  }

  if (error instanceof AiUnavailableError) {
    return build('SERVICE_UNAVAILABLE', error.message);
  }

  if (error instanceof StorageError) {
    return error.code === 'NOT_FOUND'
      ? build('NOT_FOUND', 'File was not found.')
      : build('BAD_REQUEST', 'That file could not be accepted.');
  }

  // Prisma known request errors.
  const asRecord = (error ?? {}) as { code?: unknown; statusCode?: unknown };
  const prismaCode = typeof asRecord.code === 'string' ? asRecord.code : undefined;
  if (prismaCode?.startsWith('P')) {
    switch (prismaCode) {
      case 'P2002':
        return build('CONFLICT', 'That value is already in use.');
      case 'P2003':
        return build('CONFLICT', 'A related record prevents this change.');
      case 'P2025':
        return build('NOT_FOUND', 'Resource was not found.');
      default:
        return build('INTERNAL_ERROR', 'Something went wrong.', undefined, { logLevel: 'error' });
    }
  }

  const fastifyStatus = typeof asRecord.statusCode === 'number' ? asRecord.statusCode : undefined;
  if (fastifyStatus === 429) {
    return build('RATE_LIMITED', 'Too many requests. Please slow down.');
  }
  if (fastifyStatus === 413) {
    return build('PAYLOAD_TOO_LARGE', 'That upload is too large.');
  }
  if (fastifyStatus !== undefined && fastifyStatus >= 400 && fastifyStatus < 500) {
    return build('BAD_REQUEST', 'The request could not be processed.');
  }

  return build('INTERNAL_ERROR', 'Something went wrong.', undefined, {
    alert: true,
    logLevel: 'error',
  });
};
