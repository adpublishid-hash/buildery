import "server-only";

import type { ScheduledJob, ScheduledJobKind } from "@prisma/client";

export type JobPayloads = {
  BLOG_PUBLICATION: { postId?: unknown; version?: unknown };
  META_CAPI_FLUSH: Record<string, never>;
  PAYMENT_RECONCILIATION: Record<string, never>;
  PAYMENT_EXPIRY_SWEEP: Record<string, never>;
  ABANDONED_CHECKOUT_SWEEP: Record<string, never>;
  STORE_NOTIFICATION_RETRY: Record<string, never>;
  LOW_STOCK_ALERT_SWEEP: Record<string, never>;
  FORM_DELIVERY_RETRY: Record<string, never>;
  /**
   * One operator-written outbound WhatsApp message (inbox reply, follow-up).
   * Persisted as JSON and possibly left by the previous scheduler, so the
   * handler re-validates it.
   */
  WHATSAPP_SEND: { messageId?: unknown };
  ANALYTICS_ROLLUP: Record<string, never>;
  /** Tells the team one conversation has an unread customer message. */
  INBOX_NOTIFY: { conversationId?: unknown };
  INBOX_PRUNE: Record<string, never>;
  PAYMENT_REMINDER_SWEEP: Record<string, never>;
  STOCK_NOTIFY_SWEEP: Record<string, never>;
  MEMBERSHIP_LIFECYCLE_SWEEP: Record<string, never>;
  AFFILIATE_LIFECYCLE_SWEEP: Record<string, never>;
  WORKSPACE_LIFECYCLE_SWEEP: Record<string, never>;
  SAAS_BILLING_SWEEP: Record<string, never>;
  // Retired kinds from the earlier lineage. Kept so the runner is total over
  // ScheduledJobKind and can drain rows the old scheduler left behind.
  ABANDONED_SCAN: Record<string, never>;
  ABANDONED_RECOVERY: Record<string, never>;
  NOTIFICATION_RETRY: Record<string, never>;
  LOW_STOCK_SCAN: Record<string, never>;
  // The weekly summary email, removed on 15 Sep 2026.
  WEEKLY_REPORT_SWEEP: Record<string, never>;
  WEEKLY_REPORT: Record<string, never>;
};

export type JobKind = ScheduledJobKind;

export type JobContext = {
  job: ScheduledJob;
  workerId: string;
};

export type JobHandler<K extends JobKind> = (
  payload: JobPayloads[K],
  context: JobContext
) => Promise<string | void>;
