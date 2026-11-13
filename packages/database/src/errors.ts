/**
 * Raised whenever a query would cross a tenant boundary. This is a programming
 * error, never a user error: it means application code tried to read or write
 * another organization's data. It must surface as a 500 and an alert, not as a
 * 403 that a caller could probe.
 */
export class TenantIsolationError extends Error {
  readonly code = 'TENANT_ISOLATION_VIOLATION';

  constructor(
    readonly detail: {
      model: string;
      operation: string;
      expectedOrganizationId: string;
      receivedOrganizationId?: string | null;
    },
  ) {
    super(
      `Tenant isolation violation on ${detail.model}.${detail.operation}: ` +
        `expected organizationId=${detail.expectedOrganizationId}, ` +
        `received organizationId=${String(detail.receivedOrganizationId)}`,
    );
    this.name = 'TenantIsolationError';
  }
}

/** Raised when a tenant-owned model is queried with no tenant context at all. */
export class MissingTenantContextError extends Error {
  readonly code = 'MISSING_TENANT_CONTEXT';

  constructor(
    readonly model: string,
    readonly operation: string,
  ) {
    super(
      `${model}.${operation} is tenant-owned and was called without a tenant context. ` +
        `Use forTenant(organizationId) instead of the unscoped client.`,
    );
    this.name = 'MissingTenantContextError';
  }
}
