import { getEnv } from '@olbos/config';
import { Prisma, PrismaClient } from '../generated/client/index.js';
import { TenantIsolationError } from './errors.js';
import {
  belongsToTenant,
  isTenantOwnedModel,
  scopeOperation,
  type RelationMap,
} from './tenancy.js';

export { Prisma, PrismaClient };

/**
 * Relation graph derived from the generated schema: model -> field -> model.
 * Used to stamp `organizationId` onto nested writes.
 */
export const buildRelationMap = (): RelationMap => {
  const map: RelationMap = new Map();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Map<string, string>();
    for (const field of model.fields) {
      if (field.kind === 'object' && typeof field.type === 'string') {
        fields.set(field.name, field.type);
      }
    }
    map.set(model.name, fields);
  }
  return map;
};

let relationMap: RelationMap | undefined;
const getRelationMap = (): RelationMap => (relationMap ??= buildRelationMap());

const logLevels = (): Prisma.LogLevel[] => {
  const env = getEnv();
  if (env.NODE_ENV === 'production') return ['warn', 'error'];
  if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace') return ['query', 'warn', 'error'];
  return ['warn', 'error'];
};

export interface CreateClientOptions {
  datasourceUrl?: string;
  log?: Prisma.LogLevel[];
}

export const createPrismaClient = (options: CreateClientOptions = {}): PrismaClient =>
  new PrismaClient({
    log: options.log ?? logLevels(),
    ...(options.datasourceUrl ? { datasourceUrl: options.datasourceUrl } : {}),
  });

/**
 * Process-wide client.
 *
 * This client is NOT tenant-scoped. Use it only for platform-level work:
 * authentication lookups before a tenant is known, cross-tenant worker sweeps,
 * plan/entitlement catalogues, and migrations. Everything that serves a
 * request must go through `forTenant()`.
 */
declare global {
  // eslint-disable-next-line no-var
  var __olbosPrisma: PrismaClient | undefined;
}

export const getPrismaClient = (): PrismaClient => {
  globalThis.__olbosPrisma ??= createPrismaClient();
  return globalThis.__olbosPrisma;
};

export type TenantClient = ReturnType<typeof forTenant>;

/**
 * Returns a client bound to one organization. Every operation on a
 * tenant-owned model is filtered, stamped and verified against `organizationId`.
 */
export const forTenant = (organizationId: string, base: PrismaClient = getPrismaClient()) => {
  if (!organizationId) {
    throw new Error('forTenant() requires a non-empty organizationId');
  }
  const relations = getRelationMap();

  return base.$extends({
    name: `tenant:${organizationId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantOwnedModel(model)) {
            return query(args);
          }

          const { args: scoped, verifyResultTenant } = scopeOperation(
            model,
            operation,
            args,
            organizationId,
            relations,
          );

          const result = await query(scoped as typeof args);

          if (!verifyResultTenant || result === null || result === undefined) {
            return result;
          }

          // Unique lookups cannot carry a tenant filter, so the row is checked
          // after the fact. Returning null (rather than throwing) keeps a
          // cross-tenant id indistinguishable from a non-existent one.
          if (!belongsToTenant(result, organizationId)) {
            if (operation === 'findUniqueOrThrow') {
              throw new Prisma.PrismaClientKnownRequestError('No record found', {
                code: 'P2025',
                clientVersion: Prisma.prismaVersion.client,
              });
            }
            return null;
          }

          return result;
        },
      },
    },
  });
};

/**
 * A tenant client inside an interactive transaction.
 *
 * Prisma removes the connection-lifecycle methods from a transaction client —
 * `$extends` among them — which is why the extension has to be applied to the
 * client *before* opening the transaction, not to the `tx` inside it.
 */
export type TenantTransactionClient = Omit<
  TenantClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Runs `fn` inside a transaction that is itself tenant-scoped, so multi-step
 * workflows (complete training -> write record -> issue certificate) cannot
 * escape the tenant between statements.
 *
 * The order matters: `forTenant()` first, `$transaction()` second. Prisma
 * carries client extensions into an interactive transaction, so every query
 * `fn` makes is still filtered and stamped.
 */
export const withTenantTransaction = async <T>(
  organizationId: string,
  fn: (tx: TenantTransactionClient) => Promise<T>,
  base: PrismaClient = getPrismaClient(),
  options?: { timeout?: number; maxWait?: number },
): Promise<T> => {
  const tenant = forTenant(organizationId, base);
  return tenant.$transaction(async (tx) => fn(tx as TenantTransactionClient), options);
};

export { TenantIsolationError };
