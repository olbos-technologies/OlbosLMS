import type { PrismaClient } from '../generated/client/index.js';

/**
 * Privileged maintenance operations.
 *
 * `audit_logs` and `grade_audits` carry BEFORE UPDATE OR DELETE triggers, so
 * ordinary application code — including a cascade from `organizations` — cannot
 * remove compliance history. That is deliberate.
 *
 * Lawful erasure still has to be possible (§39: account deletion workflows,
 * GDPR-style data rights, retention policies), so it gets one explicit, narrow
 * path rather than a weaker trigger.
 *
 * Implementation note, and it matters: the obvious trick of
 * `SET LOCAL session_replication_role = 'replica'` is WRONG here. Replica mode
 * suspends *every* non-ALWAYS trigger, including the referential-integrity
 * triggers that implement ON DELETE CASCADE, so deleting an organization would
 * leave orphaned users, certificates and training records behind rather than
 * removing them. Instead, exactly the two append-only triggers are disabled,
 * inside a transaction, leaving cascade behaviour intact. `ALTER TABLE` is
 * transactional in PostgreSQL, so a rollback restores them.
 *
 * `ALTER TABLE ... DISABLE TRIGGER` requires table ownership. A correctly
 * provisioned deployment runs the application as a role that does not own these
 * tables, so application code cannot reach this path whatever a bug does.
 */

const APPEND_ONLY_TRIGGERS: readonly { table: string; trigger: string }[] = [
  { table: 'audit_logs', trigger: 'audit_logs_append_only' },
  { table: 'grade_audits', trigger: 'grade_audits_append_only' },
];

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const setAppendOnlyTriggers = async (tx: Tx, enabled: boolean): Promise<void> => {
  for (const { table, trigger } of APPEND_ONLY_TRIGGERS) {
    // Identifiers are compile-time constants from the list above, never input.
    // eslint-disable-next-line no-restricted-syntax
    await tx.$executeRawUnsafe(
      `ALTER TABLE "${table}" ${enabled ? 'ENABLE' : 'DISABLE'} TRIGGER "${trigger}"`,
    );
  }
};

/**
 * Runs `fn` with the append-only audit triggers suspended, restoring them
 * before the transaction commits.
 */
export const withAuditTrailErasure = async <T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> =>
  prisma.$transaction(
    async (tx) => {
      await setAppendOnlyTriggers(tx as Tx, false);
      const result = await fn(tx as Tx);
      await setAppendOnlyTriggers(tx as Tx, true);
      return result;
      // No `finally`: if `fn` throws, the transaction rolls back and PostgreSQL
      // restores the triggers with it. Re-enabling in a `finally` would issue a
      // statement on an already-aborted transaction and replace the real error
      // with a confusing "current transaction is aborted".
    },
    { timeout: options?.timeout ?? 120_000 },
  );

/**
 * Tenant-owned tables, ordered so that a table is deleted before any table it
 * has a blocking (RESTRICT / NO ACTION) foreign key to.
 *
 * The order is computed from the live catalogue rather than hand-maintained, so
 * adding a table or changing an FK cannot silently break tenant deletion.
 *
 * Why an ordered delete at all: several relations deliberately use RESTRICT so
 * that a course or a question cannot be deleted while a training record or a
 * quiz still references it. That protection is correct for day-to-day use, but
 * it means `DELETE FROM organizations` cannot rely on one cascade.
 */
export const tenantTablesInDeleteOrder = async (prisma: PrismaClient): Promise<string[]> => {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'organizationId'
  `;

  const edges = await prisma.$queryRaw<{ child: string; parent: string }[]>`
    SELECT src.relname AS child, tgt.relname AS parent
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
     WHERE c.contype = 'f'
       AND c.confdeltype IN ('a', 'r')
       AND src.relname <> tgt.relname
  `;

  const names = new Set(tables.map((row) => row.table_name));
  const dependents = new Map<string, Set<string>>();
  const blockingCount = new Map<string, number>();

  for (const table of names) {
    dependents.set(table, new Set());
    blockingCount.set(table, 0);
  }

  for (const edge of edges) {
    if (!names.has(edge.child) || !names.has(edge.parent)) continue;
    // The child must be deleted before the parent.
    const set = dependents.get(edge.parent) as Set<string>;
    if (set.has(edge.child)) continue;
    set.add(edge.child);
    blockingCount.set(edge.parent, (blockingCount.get(edge.parent) ?? 0) + 1);
  }

  // Kahn's algorithm: tables nothing blocks come first.
  const ready = [...names].filter((table) => (blockingCount.get(table) ?? 0) === 0).sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const table = ready.shift() as string;
    order.push(table);
    for (const [parent, children] of dependents) {
      if (!children.has(table)) continue;
      children.delete(table);
      const remaining = (blockingCount.get(parent) as number) - 1;
      blockingCount.set(parent, remaining);
      if (remaining === 0) ready.push(parent);
    }
  }

  if (order.length !== names.size) {
    const unresolved = [...names].filter((table) => !order.includes(table));
    throw new Error(
      `Cannot determine a tenant delete order; a foreign key cycle involves: ${unresolved.join(', ')}`,
    );
  }

  return order;
};

export interface PurgeResult {
  readonly organizationIds: string[];
  readonly tablesCleared: number;
  readonly rowsDeleted: number;
}

const purge = async (
  prisma: PrismaClient,
  where: { ids?: readonly string[]; slugs?: readonly string[] },
): Promise<PurgeResult> => {
  const targets = await prisma.organization.findMany({
    where: where.ids ? { id: { in: [...where.ids] } } : { slug: { in: [...(where.slugs ?? [])] } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { organizationIds: [], tablesCleared: 0, rowsDeleted: 0 };
  }

  const organizationIds = targets.map((row) => row.id);
  const order = await tenantTablesInDeleteOrder(prisma);

  return withAuditTrailErasure(prisma, async (tx) => {
    let rowsDeleted = 0;
    for (const table of order) {
      // Table names come from the catalogue, never from user input.
      // eslint-disable-next-line no-restricted-syntax
      rowsDeleted += await tx.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "organizationId" = ANY($1::uuid[])`,
        organizationIds,
      );
    }
    const removed = await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
    return {
      organizationIds,
      tablesCleared: order.length,
      rowsDeleted: rowsDeleted + removed.count,
    };
  });
};

/**
 * Permanently deletes one or more organizations and everything they own,
 * including their audit trails.
 *
 * Callers must record the erasure decision somewhere OUTSIDE the tenant (a
 * platform-level audit entry, a support ticket) before calling: once this
 * returns, the tenant's own history is gone.
 */
export const purgeOrganization = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<PurgeResult> => purge(prisma, { ids: [organizationId] });

/** Same, addressed by tenant slug. Used by the development seed. */
export const purgeOrganizationsBySlug = async (
  prisma: PrismaClient,
  slugs: readonly string[],
): Promise<PurgeResult> => purge(prisma, { slugs });

export interface IntegrityProblem {
  readonly table: string;
  readonly problem: string;
  readonly count: number;
}

/**
 * Looks for rows whose owning organization no longer exists.
 *
 * There should never be any: every tenant-owned table declares
 * `onDelete: Cascade`. A non-empty result means something bypassed referential
 * integrity, which is exactly the failure mode the note above describes.
 */
export const findOrphanedRows = async (prisma: PrismaClient): Promise<IntegrityProblem[]> => {
  const tables = [
    'users',
    'employees',
    'courses',
    'training_records',
    'certificates',
    'compliance_states',
    'audit_logs',
  ];

  const problems: IntegrityProblem[] = [];
  for (const table of tables) {
    const count = await countOrphans(prisma, table);
    if (count > 0) {
      problems.push({ table, problem: 'rows reference a deleted organization', count });
    }
  }
  return problems;
};

const countOrphans = async (prisma: PrismaClient, table: string): Promise<number> => {
  // Table names come from the fixed list above, never from input.
  // eslint-disable-next-line no-restricted-syntax
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count
       FROM "${table}" t
       LEFT JOIN organizations o ON o.id = t."organizationId"
      WHERE t."organizationId" IS NOT NULL AND o.id IS NULL`,
  );
  return Number(result[0]?.count ?? 0);
};
