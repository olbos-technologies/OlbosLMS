import { MissingTenantContextError, TenantIsolationError } from './errors.js';

/**
 * Tenant isolation.
 *
 * Every table that carries `organizationId` is listed here. A client produced
 * by `forTenant()` rewrites the arguments of every Prisma operation on those
 * models so that:
 *
 *   * reads are filtered to the tenant,
 *   * writes are stamped with the tenant (including nested creates),
 *   * an explicit `organizationId` that disagrees with the context is rejected
 *     rather than silently honoured,
 *   * `findUnique` results belonging to another tenant are discarded, because
 *     Prisma will not accept a non-unique filter in a unique lookup.
 *
 * The rewrite functions below are pure so they can be unit tested without a
 * database; `tests/integration/tenant-isolation.test.ts` then proves the same
 * behaviour end to end against Postgres.
 */

/** Models that carry an `organizationId` column and are therefore tenant-owned. */
export const TENANT_OWNED_MODELS = [
  'AiConversation',
  'AiGeneration',
  'AiMessage',
  'AiUsageRecord',
  'Announcement',
  'ApiKey',
  'Assignment',
  'AttendanceEntry',
  'AuditLog',
  'CalendarEvent',
  'Certificate',
  'ComplianceState',
  'CorrectiveAction',
  'Course',
  'CourseModule',
  'CoursePrerequisite',
  'CourseVersion',
  'Credential',
  'Department',
  'Discussion',
  'DiscussionPost',
  'Employee',
  'Enrollment',
  'EntitlementOverride',
  'Grade',
  'GradeAudit',
  'GradebookCategory',
  'Incident',
  'Integration',
  'Invoice',
  'JhaHazard',
  'JhaJsa',
  'JhaTask',
  'JobRole',
  'LearningPath',
  'LearningPathItem',
  'Lesson',
  'LessonProgress',
  'Location',
  'Notification',
  'NotificationPreference',
  'PracticalAssessment',
  'PracticalAssessmentTemplate',
  'PracticalCriterion',
  'PracticalCriterionResult',
  'Question',
  'QuestionBank',
  'QuestionOption',
  'Quiz',
  'QuizAttempt',
  'QuizQuestion',
  'QuizResponse',
  'ReportRun',
  'Role',
  'SafetyCourseProfile',
  'SafetyObservation',
  'SafetyScenario',
  'ScenarioAttempt',
  'StoredFile',
  'Submission',
  'Subscription',
  'TrainingAssignment',
  'TrainingRecord',
  'TrainingRequirement',
  'TrainingSession',
  'UsageRecord',
  'User',
  'UserRole',
  'UserSession',
] as const;

export type TenantOwnedModel = (typeof TENANT_OWNED_MODELS)[number];

const TENANT_OWNED = new Set<string>(TENANT_OWNED_MODELS);

/**
 * Models whose `organizationId` is nullable because platform-level rows exist:
 * platform staff accounts, platform-wide roles, and platform audit entries.
 * A tenant-scoped client still filters them to the tenant — it simply cannot
 * see the platform rows, which is the intended behaviour.
 */
export const NULLABLE_TENANT_MODELS = new Set<string>(['User', 'Role', 'AuditLog', 'UserSession']);

export const isTenantOwnedModel = (model: string | undefined): model is TenantOwnedModel =>
  typeof model === 'string' && TENANT_OWNED.has(model);

/** model -> (relation field -> related model). Built from the Prisma DMMF. */
export type RelationMap = Map<string, Map<string, string>>;

type AnyArgs = Record<string, unknown>;

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const UNIQUE_READ_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow']);

/** Operations whose `where` accepts non-unique filters alongside a unique one. */
const FILTERABLE_WRITE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

const NESTED_WRITE_KEYS = ['create', 'createMany', 'connectOrCreate', 'upsert'] as const;

const isPlainObject = (value: unknown): value is AnyArgs =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * Rejects an explicit `organizationId` that disagrees with the tenant context.
 * Accepting it silently would let a caller-supplied body decide the tenant —
 * exactly the class of bug tenant isolation exists to prevent.
 */
const assertMatchingTenant = (
  value: unknown,
  organizationId: string,
  model: string,
  operation: string,
): void => {
  if (value === undefined || value === null) return;
  if (value === organizationId) return;
  throw new TenantIsolationError({
    model,
    operation,
    expectedOrganizationId: organizationId,
    receivedOrganizationId: typeof value === 'string' ? value : JSON.stringify(value),
  });
};

/** Adds `organizationId` to a `where` clause without dropping existing filters. */
export const scopeWhere = (
  where: unknown,
  organizationId: string,
  model: string,
  operation: string,
): AnyArgs => {
  if (!isPlainObject(where)) return { organizationId };

  if ('organizationId' in where) {
    const current = where.organizationId;
    // A plain string must match; a filter object (e.g. `{ in: [...] }`) is
    // combined with the tenant filter via AND so it can only narrow, never widen.
    if (typeof current === 'string' || current === null) {
      assertMatchingTenant(current, organizationId, model, operation);
      return { ...where, organizationId };
    }
    const { organizationId: nested, ...rest } = where;
    return {
      ...rest,
      AND: [{ organizationId }, { organizationId: nested }, ...toArray(where.AND)],
    };
  }

  return { ...where, organizationId };
};

const toArray = (value: unknown): AnyArgs[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as AnyArgs[]) : [value as AnyArgs];
};

/**
 * Stamps `organizationId` onto a create/update payload and recurses into nested
 * writes so that `course.create({ data: { modules: { create: [...] } } })` also
 * stamps the modules.
 */
export const scopeData = (
  data: unknown,
  organizationId: string,
  model: string,
  operation: string,
  relations: RelationMap,
  stampSelf: boolean,
): unknown => {
  if (Array.isArray(data)) {
    return data.map((entry) =>
      scopeData(entry, organizationId, model, operation, relations, stampSelf),
    );
  }
  if (!isPlainObject(data)) return data;

  const result: AnyArgs = { ...data };

  if (stampSelf && isTenantOwnedModel(model)) {
    assertMatchingTenant(result.organizationId, organizationId, model, operation);
    result.organizationId = organizationId;
  }

  const modelRelations = relations.get(model);
  if (!modelRelations) return result;

  for (const [field, value] of Object.entries(result)) {
    const relatedModel = modelRelations.get(field);
    if (!relatedModel || !isPlainObject(value)) continue;
    if (!isTenantOwnedModel(relatedModel)) continue;

    const nested: AnyArgs = { ...value };
    for (const key of NESTED_WRITE_KEYS) {
      if (!(key in nested)) continue;
      if (key === 'createMany') {
        const payload = nested[key];
        if (isPlainObject(payload) && 'data' in payload) {
          nested[key] = {
            ...payload,
            data: scopeData(payload.data, organizationId, relatedModel, operation, relations, true),
          };
        }
        continue;
      }
      if (key === 'connectOrCreate') {
        nested[key] = mapMaybeArray(nested[key], (entry) =>
          isPlainObject(entry) && 'create' in entry
            ? {
                ...entry,
                where: scopeWhere(entry.where, organizationId, relatedModel, operation),
                create: scopeData(
                  entry.create,
                  organizationId,
                  relatedModel,
                  operation,
                  relations,
                  true,
                ),
              }
            : entry,
        );
        continue;
      }
      if (key === 'upsert') {
        nested[key] = mapMaybeArray(nested[key], (entry) =>
          isPlainObject(entry)
            ? {
                ...entry,
                where: scopeWhere(entry.where, organizationId, relatedModel, operation),
                create: scopeData(
                  entry.create,
                  organizationId,
                  relatedModel,
                  operation,
                  relations,
                  true,
                ),
                update: scopeData(
                  entry.update,
                  organizationId,
                  relatedModel,
                  operation,
                  relations,
                  false,
                ),
              }
            : entry,
        );
        continue;
      }
      nested[key] = scopeData(
        nested[key],
        organizationId,
        relatedModel,
        operation,
        relations,
        true,
      );
    }
    result[field] = nested;
  }

  return result;
};

const mapMaybeArray = (value: unknown, fn: (entry: unknown) => unknown): unknown =>
  Array.isArray(value) ? value.map(fn) : fn(value);

export interface ScopeResult {
  args: AnyArgs;
  /**
   * True when Prisma would reject a tenant filter in `where` (unique lookups),
   * so the caller must verify the returned row's tenant instead.
   */
  verifyResultTenant: boolean;
}

/** Rewrites one Prisma operation's arguments for a tenant. Pure. */
export const scopeOperation = (
  model: string,
  operation: string,
  args: unknown,
  organizationId: string,
  relations: RelationMap,
): ScopeResult => {
  const input: AnyArgs = isPlainObject(args) ? { ...args } : {};

  if (UNIQUE_READ_OPERATIONS.has(operation)) {
    return { args: input, verifyResultTenant: true };
  }

  if (READ_OPERATIONS.has(operation)) {
    return {
      args: { ...input, where: scopeWhere(input.where, organizationId, model, operation) },
      verifyResultTenant: false,
    };
  }

  if (CREATE_OPERATIONS.has(operation)) {
    return {
      args: {
        ...input,
        data: scopeData(input.data, organizationId, model, operation, relations, true),
      },
      verifyResultTenant: false,
    };
  }

  if (FILTERABLE_WRITE_OPERATIONS.has(operation)) {
    const next: AnyArgs = {
      ...input,
      where: scopeWhere(input.where, organizationId, model, operation),
    };
    if ('data' in next) {
      next.data = scopeData(next.data, organizationId, model, operation, relations, false);
    }
    if (operation === 'upsert') {
      next.create = scopeData(input.create, organizationId, model, operation, relations, true);
      next.update = scopeData(input.update, organizationId, model, operation, relations, false);
    }
    return { args: next, verifyResultTenant: false };
  }

  // Unknown operation: fail closed rather than leaking.
  throw new MissingTenantContextError(model, operation);
};

/** Confirms a row returned by a unique lookup belongs to the calling tenant. */
export const belongsToTenant = (row: unknown, organizationId: string): boolean => {
  if (!isPlainObject(row)) return true;
  if (!('organizationId' in row)) return true;
  return row.organizationId === organizationId;
};
