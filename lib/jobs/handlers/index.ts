import "server-only";

import { sweepAbandonedCheckouts } from "@/lib/abandoned-recovery";
import { sweepLowStockAlerts } from "@/lib/low-stock-alerts";
import { flushMetaCapiQueue, pruneMetaCapiEvents } from "@/lib/meta-capi";
import { flushTikTokQueue } from "@/lib/tiktok-events";
import { flushGa4Queue } from "@/lib/ga4-measurement";
import { pruneStoredAdContexts } from "@/lib/ad-events";
import { rollupAnalytics } from "@/lib/analytics-rollup";
import { notifyInboxConversation } from "@/lib/inbox-notify";
import { pruneInboxMessages } from "@/lib/inbox-retention";
import { sweepPaymentReminders } from "@/lib/payment-reminders";
import { sweepStockNotifications } from "@/lib/stock-notifications";
import { reconcilePendingMidtransPayments } from "@/lib/payment-reconciliation";
import { reconcilePendingGatewayPayments } from "@/lib/integrations/payments/gateway";
import { expireOverduePayments } from "@/lib/payments";
import { pruneFinishedJobs } from "@/lib/jobs/queue";
import { retryFormDeliveries } from "@/lib/form-delivery-retry";
import { retryStoreNotifications } from "@/lib/store-notification-retry";
import {
  markInboxWhatsAppMessageFailed,
  sendQueuedInboxWhatsAppMessage,
} from "@/lib/whatsapp/inbox-send";
import type { JobHandler, JobKind } from "@/lib/jobs/types";
import { publishScheduledBlogPost } from "@/lib/blog-publication";
import { sweepMembershipLifecycle } from "@/lib/membership-lifecycle";
import { sweepAffiliateLifecycle } from "@/lib/affiliate-maintenance";
import { sweepWorkspaceLifecycle } from "@/lib/workspace-lifecycle";
import { sweepSaaSBilling } from "@/lib/saas-billing";

/**
 * A kind this runner no longer performs. Production still holds rows queued by
 * the previous scheduler; draining them as a no-op is better than letting the
 * runner throw on every tick, and better than deleting work silently.
 */
const retired = (replacement: string) => async () =>
  `retired; superseded by ${replacement}`;

/**
 * A kind that no longer exists as a feature. Production can still hold rows the
 * old scheduler queued, so the handler stays and resolves them quietly instead
 * of failing and retrying forever.
 */
const discontinued = async () => "discontinued; nothing to do";

export const JOB_HANDLERS: { [K in JobKind]: JobHandler<K> } = {
  WORKSPACE_LIFECYCLE_SWEEP: async () => {
    const summary = await sweepWorkspaceLifecycle();
    return `expiredInvitations=${summary.expiredInvitations} purgedWorkspaces=${summary.purgedWorkspaces} purgedUsers=${summary.purgedUsers} purgedOrders=${summary.purgedOrders}`;
  },
  AFFILIATE_LIFECYCLE_SWEEP: async () => {
    const summary = await sweepAffiliateLifecycle();
    return `approved=${summary.approved} anonymized=${summary.anonymized}`;
  },
  MEMBERSHIP_LIFECYCLE_SWEEP: async () => {
    const summary = await sweepMembershipLifecycle();
    return `expired=${summary.expired} reminded=${summary.reminded}`;
  },
  SAAS_BILLING_SWEEP: async () => {
    const summary = await sweepSaaSBilling();
    return [
      `expiredInvoices=${summary.expiredInvoices}`,
      `pastDue=${summary.pastDue}`,
      `expiredSubscriptions=${summary.expiredSubscriptions}`,
      `renewalInvoices=${summary.renewalInvoices}`,
      `reminded=${summary.reminded}`,
    ].join(" ");
  },
  BLOG_PUBLICATION: async (payload) => {
    const postId = typeof payload?.postId === "string" ? payload.postId : null;
    const version =
      typeof payload?.version === "number" && Number.isInteger(payload.version)
        ? payload.version
        : null;
    if (!postId || !version) return "invalid blog publication payload";
    return publishScheduledBlogPost(postId, version);
  },
  ABANDONED_SCAN: retired("ABANDONED_CHECKOUT_SWEEP"),
  ABANDONED_RECOVERY: retired("ABANDONED_CHECKOUT_SWEEP"),
  NOTIFICATION_RETRY: retired("STORE_NOTIFICATION_RETRY"),
  WHATSAPP_SEND: async (payload, { job }) => {
    const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
    if (!messageId) return "payload has no messageId";
    try {
      return await sendQueuedInboxWhatsAppMessage(messageId);
    } catch (error) {
      // Out of retries: show FAILED in the inbox rather than a message that
      // looks queued forever.
      if (job.attempts + 1 >= job.maxAttempts) {
        await markInboxWhatsAppMessageFailed(
          messageId,
          error instanceof Error ? error.message : "WhatsApp send failed."
        );
      }
      throw error;
    }
  },
  LOW_STOCK_SCAN: retired("LOW_STOCK_ALERT_SWEEP"),
  // The weekly summary email was removed on 15 Sep 2026.
  WEEKLY_REPORT_SWEEP: discontinued,
  WEEKLY_REPORT: discontinued,
  INBOX_NOTIFY: async (payload) => {
    const conversationId =
      typeof payload?.conversationId === "string" ? payload.conversationId : null;
    if (!conversationId) return "payload has no conversationId";
    return notifyInboxConversation(conversationId);
  },
  STOCK_NOTIFY_SWEEP: async () => {
    const summary = await sweepStockNotifications();
    return `told ${summary.notified} shoppers their product is back`;
  },
  PAYMENT_REMINDER_SWEEP: async () => {
    const summary = await sweepPaymentReminders();
    return `reminded ${summary.reminded} buyers before their payment window closes`;
  },
  INBOX_PRUNE: async () => {
    const summary = await pruneInboxMessages();
    return `pruned ${summary.messages} messages from ${summary.conversations} dormant conversations`;
  },
  // Flushes every server-side ad platform (Meta CAPI, TikTok Events API); the
  // kind keeps its original name so existing scheduled rows still run.
  META_CAPI_FLUSH: async () => {
    const summary = await flushMetaCapiQueue();
    const tiktok = await flushTikTokQueue();
    const ga4 = await flushGa4Queue();
    const prunedEvents = await pruneMetaCapiEvents();
    const prunedContexts = await pruneStoredAdContexts();
    const prunedJobs = await pruneFinishedJobs();
    return [
      `workspaces=${summary.workspaces}`,
      `sent=${summary.sent}`,
      `failed=${summary.failed}`,
      `retrying=${summary.retrying}`,
      `stale=${summary.staleDropped}`,
      `discarded=${summary.discarded}`,
      tiktok.workspaces > 0
        ? `tiktok(sent=${tiktok.sent} failed=${tiktok.failed} retrying=${tiktok.retrying} stale=${tiktok.staleDropped} discarded=${tiktok.discarded})`
        : "",
      ga4.workspaces > 0
        ? `ga4(sent=${ga4.sent} failed=${ga4.failed} retrying=${ga4.retrying} stale=${ga4.staleDropped})`
        : "",
      prunedEvents > 0 ? `prunedEvents=${prunedEvents}` : "",
      prunedContexts > 0 ? `prunedAdContexts=${prunedContexts}` : "",
      prunedJobs > 0 ? `prunedJobs=${prunedJobs}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  PAYMENT_EXPIRY_SWEEP: async () => {
    const summary = await expireOverduePayments();
    return [
      `scanned=${summary.scanned}`,
      `expired=${summary.expired}`,
      summary.failed > 0 ? `failed=${summary.failed}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  PAYMENT_RECONCILIATION: async () => {
    const summary = await reconcilePendingMidtransPayments();
    const gateways = await reconcilePendingGatewayPayments();
    return [
      gateways.scanned > 0
        ? `gateways=${gateways.scanned}/synced:${gateways.synced}/failed:${gateways.failed}`
        : "",
      summary.unconfigured ? "unconfigured=true" : "",
      `scanned=${summary.scanned}`,
      summary.synced > 0 ? `synced=${summary.synced}` : "",
      summary.unchanged > 0 ? `unchanged=${summary.unchanged}` : "",
      summary.notFound > 0 ? `notFound=${summary.notFound}` : "",
      summary.failed > 0 ? `failed=${summary.failed}` : "",
      summary.skipped > 0 ? `skipped=${summary.skipped}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  ABANDONED_CHECKOUT_SWEEP: async () => {
    const summary = await sweepAbandonedCheckouts();
    return [
      `scanned=${summary.scanned}`,
      summary.opened > 0 ? `opened=${summary.opened}` : "",
      `contacted=${summary.contacted}`,
      summary.skipped > 0 ? `skipped=${summary.skipped}` : "",
      summary.failed > 0 ? `failed=${summary.failed}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  STORE_NOTIFICATION_RETRY: async () => {
    const summary = await retryStoreNotifications();
    return [
      `scanned=${summary.scanned}`,
      `sent=${summary.sent}`,
      summary.failed > 0 ? `failed=${summary.failed}` : "",
      summary.skipped > 0 ? `skipped=${summary.skipped}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  FORM_DELIVERY_RETRY: async () => {
    const summary = await retryFormDeliveries();
    return [
      `scanned=${summary.scanned}`,
      `sent=${summary.sent}`,
      summary.failed > 0 ? `failed=${summary.failed}` : "",
      summary.skipped > 0 ? `skipped=${summary.skipped}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  ANALYTICS_ROLLUP: async () => {
    const summary = await rollupAnalytics();
    return [
      `days=${summary.days}`,
      `workspaces=${summary.workspaces}`,
      summary.pruned > 0 ? `prunedEvents=${summary.pruned}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
  LOW_STOCK_ALERT_SWEEP: async () => {
    const summary = await sweepLowStockAlerts();
    return [
      `scanned=${summary.scanned}`,
      `lowStock=${summary.lowStock}`,
      summary.alerted > 0 ? `alerted=${summary.alerted}` : "",
      summary.resolved > 0 ? `resolved=${summary.resolved}` : "",
      summary.failed > 0 ? `failed=${summary.failed}` : "",
      summary.skipped > 0 ? `skipped=${summary.skipped}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  },
};
