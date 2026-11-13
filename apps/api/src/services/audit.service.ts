import { getPrismaClient, type AuditAction, type PrismaClient } from '@olbos/database';

/**
 * Audit logging (§33).
 *
 * Writes go to an append-only table (enforced by a database trigger). The
 * application never updates or deletes an audit row, so this module exposes
 * only `record`.
 *
 * Redaction happens here rather than at each call site: a route that logs a
 * "user updated" event should not have to remember that the payload might carry
 * a password hash.
 */

const REDACTED = '[redacted]';

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'passwordconfirmation',
  'currentpassword',
  'newpassword',
  'token',
  'tokenhash',
  'secret',
  'apikey',
  'keyhash',
  'sessiontoken',
  'mfasecret',
  'accesskey',
  'secretaccesskey',
  'authorization',
  'cookie',
  'ssn',
  'creditcard',
];

const isSensitive = (key: string): boolean => {
  const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
  return SENSITIVE_KEYS.some((sensitive) => normalised.includes(sensitive));
};

/** Recursively replaces sensitive values, preserving structure for diffing. */
export const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redact(entry, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitive(key) ? REDACTED : redact(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...`;
  return value;
};

export interface AuditEvent {
  readonly organizationId?: string | null;
  readonly actorUserId?: string | null;
  readonly actorLabel?: string | null;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly summary?: string | null;
  readonly changes?: Record<string, unknown>;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
}

/**
 * Records an audit event.
 *
 * Never throws: an audit write must not turn a successful operation into a 500
 * for the user. A failure is surfaced through the returned flag and the logger
 * so it can be alerted on.
 */
export const recordAudit = async (
  event: AuditEvent,
  prisma: PrismaClient = getPrismaClient(),
): Promise<{ recorded: boolean; error?: string }> => {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: event.organizationId ?? null,
        actorUserId: event.actorUserId ?? null,
        actorLabel: event.actorLabel ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        summary: event.summary ?? null,
        changes: (redact(event.changes ?? {}) as object) ?? {},
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent?.slice(0, 500) ?? null,
        requestId: event.requestId ?? null,
      },
    });
    return { recorded: true };
  } catch (error) {
    return { recorded: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Compares two snapshots and returns only what changed, so an audit entry says
 * "role changed from X to Y" rather than dumping the whole record.
 */
export const diffSnapshots = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    changes[key] = {
      from: isSensitive(key) ? REDACTED : (redact(from) ?? null),
      to: isSensitive(key) ? REDACTED : (redact(to) ?? null),
    };
  }

  return changes;
};
