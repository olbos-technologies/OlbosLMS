export {
  batchByRecipient,
  buildSupervisorDigest,
  buildTrainingMessage,
  CATEGORY_POLICIES,
  dedupeKey,
  isWithinCooldown,
  resolveDelivery,
  type BatchBucket,
  type CategoryPolicy,
  type DeliveryDecision,
  type DeliveryFrequency,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationMessage,
  type SentNotification,
  type SupervisorDigestItem,
  type TrainingContext,
  type UserPreference,
} from './templates.js';

export {
  InAppTransport,
  LogTransport,
  TransportRouter,
  type DeliveryReceipt,
  type NotificationTransport,
  type OutboundNotification,
} from './transport.js';
