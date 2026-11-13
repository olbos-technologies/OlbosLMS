export * from '../generated/client/index.js';
export {
  buildRelationMap,
  createPrismaClient,
  forTenant,
  getPrismaClient,
  withTenantTransaction,
  type CreateClientOptions,
  type TenantClient,
  type TenantTransactionClient,
} from './client.js';
export { MissingTenantContextError, TenantIsolationError } from './errors.js';
export {
  findOrphanedRows,
  purgeOrganization,
  purgeOrganizationsBySlug,
  tenantTablesInDeleteOrder,
  withAuditTrailErasure,
  type IntegrityProblem,
  type PurgeResult,
} from './maintenance.js';
export {
  belongsToTenant,
  isTenantOwnedModel,
  NULLABLE_TENANT_MODELS,
  scopeData,
  scopeOperation,
  scopeWhere,
  TENANT_OWNED_MODELS,
  type RelationMap,
  type ScopeResult,
  type TenantOwnedModel,
} from './tenancy.js';
