/**
 * Notification content and delivery policy (§21).
 *
 * Two rules shape everything here:
 *   1. Never spam. Every notification carries a dedupe key, and categories that
 *      recur (expiry warnings, compliance digests) are batched.
 *   2. Say something useful. A notification names the training, the deadline and
 *      the action, so the recipient does not have to open the app to find out
 *      whether it matters.
 */

export type NotificationCategory =
  | 'TRAINING_ASSIGNED'
  | 'TRAINING_DUE'
  | 'TRAINING_OVERDUE'
  | 'TRAINING_EXPIRING'
  | 'TRAINING_EXPIRED'
  | 'CERTIFICATE_ISSUED'
  | 'CERTIFICATE_REVOKED'
  | 'COMPLIANCE_DIGEST'
  | 'SESSION_REMINDER'
  | 'ASSIGNMENT_DUE'
  | 'GRADE_POSTED'
  | 'ANNOUNCEMENT'
  | 'SECURITY'
  | 'SYSTEM';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export type DeliveryFrequency = 'immediate' | 'daily' | 'weekly';

export interface CategoryPolicy {
  readonly category: NotificationCategory;
  readonly label: string;
  readonly description: string;
  readonly defaultChannels: readonly NotificationChannel[];
  readonly defaultFrequency: DeliveryFrequency;
  /**
   * Security and compliance notices a user may not switch off. Everything else
   * is opt-out.
   */
  readonly mandatory: boolean;
  /** Suppress a repeat of the same event for this many hours. */
  readonly cooldownHours: number;
}

export const CATEGORY_POLICIES: Readonly<Record<NotificationCategory, CategoryPolicy>> = {
  TRAINING_ASSIGNED: {
    category: 'TRAINING_ASSIGNED',
    label: 'Training assigned',
    description: 'Sent when training is assigned to you.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 24,
  },
  TRAINING_DUE: {
    category: 'TRAINING_DUE',
    label: 'Training due soon',
    description: 'A reminder before assigned training is due.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'daily',
    mandatory: false,
    cooldownHours: 24,
  },
  TRAINING_OVERDUE: {
    category: 'TRAINING_OVERDUE',
    label: 'Training overdue',
    description: 'Sent when assigned training passes its due date.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'daily',
    mandatory: true,
    cooldownHours: 72,
  },
  TRAINING_EXPIRING: {
    category: 'TRAINING_EXPIRING',
    label: 'Training expiring',
    description: 'Sent as a certification approaches its expiration date.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'daily',
    mandatory: false,
    cooldownHours: 24 * 7,
  },
  TRAINING_EXPIRED: {
    category: 'TRAINING_EXPIRED',
    label: 'Training expired',
    description: 'Sent when a certification expires.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: true,
    cooldownHours: 24 * 7,
  },
  CERTIFICATE_ISSUED: {
    category: 'CERTIFICATE_ISSUED',
    label: 'Certificate issued',
    description: 'Sent when a certificate is issued to you.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 1,
  },
  CERTIFICATE_REVOKED: {
    category: 'CERTIFICATE_REVOKED',
    label: 'Certificate revoked',
    description: 'Sent when one of your certificates is revoked.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: true,
    cooldownHours: 1,
  },
  COMPLIANCE_DIGEST: {
    category: 'COMPLIANCE_DIGEST',
    label: 'Compliance digest',
    description: 'A periodic summary of your team compliance position.',
    defaultChannels: ['EMAIL'],
    defaultFrequency: 'weekly',
    mandatory: false,
    cooldownHours: 24 * 7,
  },
  SESSION_REMINDER: {
    category: 'SESSION_REMINDER',
    label: 'Session reminder',
    description: 'A reminder before a scheduled training session.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 12,
  },
  ASSIGNMENT_DUE: {
    category: 'ASSIGNMENT_DUE',
    label: 'Assignment due',
    description: 'A reminder before a course assignment is due.',
    defaultChannels: ['IN_APP'],
    defaultFrequency: 'daily',
    mandatory: false,
    cooldownHours: 24,
  },
  GRADE_POSTED: {
    category: 'GRADE_POSTED',
    label: 'Grade posted',
    description: 'Sent when a grade is published to you.',
    defaultChannels: ['IN_APP'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 1,
  },
  ANNOUNCEMENT: {
    category: 'ANNOUNCEMENT',
    label: 'Announcements',
    description: 'Course and organization announcements.',
    defaultChannels: ['IN_APP'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 1,
  },
  SECURITY: {
    category: 'SECURITY',
    label: 'Security alerts',
    description: 'Sign-ins from new devices, password changes and similar events.',
    defaultChannels: ['IN_APP', 'EMAIL'],
    defaultFrequency: 'immediate',
    mandatory: true,
    cooldownHours: 0,
  },
  SYSTEM: {
    category: 'SYSTEM',
    label: 'System notices',
    description: 'Service notices from the platform.',
    defaultChannels: ['IN_APP'],
    defaultFrequency: 'immediate',
    mandatory: false,
    cooldownHours: 1,
  },
};

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

export interface NotificationMessage {
  readonly subject: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly actionLabel?: string;
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : pluralForm}`;

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

export interface TrainingContext {
  readonly learnerName?: string;
  readonly courseTitle: string;
  readonly dueAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly daysUntil?: number | null;
  readonly daysOverdue?: number | null;
  readonly assignmentId?: string;
  readonly certificateNumber?: string;
  readonly organizationName?: string;
}

export const buildTrainingMessage = (
  category: NotificationCategory,
  context: TrainingContext,
): NotificationMessage => {
  switch (category) {
    case 'TRAINING_ASSIGNED':
      return {
        subject: `Training assigned: ${context.courseTitle}`,
        body: context.dueAt
          ? `You have been assigned ${context.courseTitle}. It is due by ${formatDate(context.dueAt)}.`
          : `You have been assigned ${context.courseTitle}.`,
        actionUrl: '/learning',
        actionLabel: 'Start training',
      };
    case 'TRAINING_DUE':
      return {
        subject: `Due soon: ${context.courseTitle}`,
        body: `${context.courseTitle} is due ${
          context.dueAt ? `on ${formatDate(context.dueAt)}` : 'soon'
        }${context.daysUntil != null ? ` (${plural(context.daysUntil, 'day')} left)` : ''}.`,
        actionUrl: '/learning',
        actionLabel: 'Complete training',
      };
    case 'TRAINING_OVERDUE':
      return {
        subject: `Overdue: ${context.courseTitle}`,
        body: `${context.courseTitle} is overdue${
          context.daysOverdue != null ? ` by ${plural(context.daysOverdue, 'day')}` : ''
        }. Please complete it as soon as possible.`,
        actionUrl: '/learning',
        actionLabel: 'Complete training',
      };
    case 'TRAINING_EXPIRING':
      return {
        subject: `Expiring soon: ${context.courseTitle}`,
        body: `Your ${context.courseTitle} training expires${
          context.expiresAt ? ` on ${formatDate(context.expiresAt)}` : ' soon'
        }${context.daysUntil != null ? ` (${plural(context.daysUntil, 'day')} left)` : ''}. Renew it to stay current.`,
        actionUrl: '/learning',
        actionLabel: 'Renew training',
      };
    case 'TRAINING_EXPIRED':
      return {
        subject: `Expired: ${context.courseTitle}`,
        body: `Your ${context.courseTitle} training expired${
          context.expiresAt ? ` on ${formatDate(context.expiresAt)}` : ''
        }. You are no longer current for this requirement.`,
        actionUrl: '/learning',
        actionLabel: 'Renew training',
      };
    case 'CERTIFICATE_ISSUED':
      return {
        subject: `Certificate issued: ${context.courseTitle}`,
        body: `Your certificate for ${context.courseTitle}${
          context.certificateNumber ? ` (${context.certificateNumber})` : ''
        } is ready${context.expiresAt ? `, valid until ${formatDate(context.expiresAt)}` : ''}.`,
        actionUrl: '/learning/certificates',
        actionLabel: 'View certificate',
      };
    case 'CERTIFICATE_REVOKED':
      return {
        subject: `Certificate revoked: ${context.courseTitle}`,
        body: `Your certificate for ${context.courseTitle}${
          context.certificateNumber ? ` (${context.certificateNumber})` : ''
        } has been revoked by ${context.organizationName ?? 'your organization'}.`,
        actionUrl: '/learning/certificates',
        actionLabel: 'View certificates',
      };
    default:
      return {
        subject: context.courseTitle,
        body: `An update is available for ${context.courseTitle}.`,
        actionUrl: '/learning',
      };
  }
};

export interface SupervisorDigestItem {
  readonly employeeName: string;
  readonly courseTitle: string;
  readonly status: 'OVERDUE' | 'EXPIRED' | 'EXPIRING' | 'MISSING';
  readonly dueAt?: Date | null;
}

/**
 * One digest per supervisor, rather than one email per employee per course —
 * the difference between a useful summary and an inbox a supervisor filters out.
 */
export const buildSupervisorDigest = (
  items: readonly SupervisorDigestItem[],
  context: { supervisorName?: string; compliancePercent?: number } = {},
): NotificationMessage => {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const headline = [
    counts.EXPIRED ? `${counts.EXPIRED} expired` : null,
    counts.OVERDUE ? `${counts.OVERDUE} overdue` : null,
    counts.MISSING ? `${counts.MISSING} missing` : null,
    counts.EXPIRING ? `${counts.EXPIRING} expiring` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const lines = items
    .slice(0, 20)
    .map(
      (item) =>
        `- ${item.employeeName}: ${item.courseTitle} (${item.status.toLowerCase()}${
          item.dueAt ? `, due ${formatDate(item.dueAt)}` : ''
        })`,
    );

  if (items.length > 20) lines.push(`- ...and ${items.length - 20} more`);

  return {
    subject:
      items.length === 0
        ? 'Team training compliance: all current'
        : `Team training compliance: ${headline}`,
    body: [
      context.compliancePercent != null
        ? `Your team is at ${context.compliancePercent}% training compliance.`
        : null,
      items.length === 0 ? 'No outstanding training items.' : 'Outstanding items:',
      ...lines,
    ]
      .filter(Boolean)
      .join('\n'),
    actionUrl: '/compliance',
    actionLabel: 'Open compliance dashboard',
  };
};

// ---------------------------------------------------------------------------
// Delivery decisions
// ---------------------------------------------------------------------------

export interface UserPreference {
  readonly category: NotificationCategory;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly frequency?: DeliveryFrequency;
}

export interface DeliveryDecision {
  readonly channels: NotificationChannel[];
  readonly frequency: DeliveryFrequency;
  readonly suppressedChannels: NotificationChannel[];
  readonly reason: string;
}

/**
 * Resolves the channels a notification should go out on, honouring user
 * preferences except where the category is mandatory.
 */
export const resolveDelivery = (
  category: NotificationCategory,
  preferences: readonly UserPreference[] = [],
  availableChannels: readonly NotificationChannel[] = ['IN_APP', 'EMAIL'],
): DeliveryDecision => {
  const policy = CATEGORY_POLICIES[category];
  const relevant = preferences.filter((p) => p.category === category);

  const channels: NotificationChannel[] = [];
  const suppressedChannels: NotificationChannel[] = [];

  const candidates = new Set<NotificationChannel>([
    ...policy.defaultChannels,
    ...relevant.filter((p) => p.enabled).map((p) => p.channel),
  ]);

  for (const channel of candidates) {
    if (!availableChannels.includes(channel)) {
      suppressedChannels.push(channel);
      continue;
    }
    const preference = relevant.find((p) => p.channel === channel);
    if (preference && !preference.enabled && !policy.mandatory) {
      suppressedChannels.push(channel);
      continue;
    }
    channels.push(channel);
  }

  const frequency =
    relevant.find((p) => p.channel === 'EMAIL')?.frequency ?? policy.defaultFrequency;

  return {
    channels,
    frequency,
    suppressedChannels,
    reason: policy.mandatory
      ? 'This category is mandatory and cannot be switched off'
      : 'Delivered according to user preferences',
  };
};

/**
 * Stable identity for one notifiable event. Writing with this key as a unique
 * constraint is what actually prevents duplicates — the check below is the fast
 * path, the database is the guarantee.
 */
export const dedupeKey = (parts: {
  category: NotificationCategory;
  entityId?: string | null;
  /** Distinguishes the 30-day warning from the 7-day one for the same item. */
  variant?: string | number | null;
}): string => [parts.category, parts.entityId ?? 'none', parts.variant ?? 'default'].join(':');

export interface SentNotification {
  readonly dedupeKey: string | null;
  readonly sentAt: Date;
}

/** True when an equivalent notification was sent inside the category cooldown. */
export const isWithinCooldown = (
  category: NotificationCategory,
  key: string,
  history: readonly SentNotification[],
  now: Date = new Date(),
): boolean => {
  const cooldownHours = CATEGORY_POLICIES[category].cooldownHours;
  if (cooldownHours <= 0) return false;
  const threshold = now.getTime() - cooldownHours * 3_600_000;
  return history.some((entry) => entry.dedupeKey === key && entry.sentAt.getTime() > threshold);
};

export interface BatchBucket<T> {
  readonly key: string;
  readonly items: T[];
}

/**
 * Groups pending notifications for digest delivery, so a supervisor with 30
 * overdue employees receives one email rather than thirty.
 */
export const batchByRecipient = <T extends { recipientId: string }>(
  items: readonly T[],
): BatchBucket<T>[] => {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const existing = buckets.get(item.recipientId);
    if (existing) existing.push(item);
    else buckets.set(item.recipientId, [item]);
  }
  return [...buckets.entries()].map(([key, bucketItems]) => ({ key, items: bucketItems }));
};
