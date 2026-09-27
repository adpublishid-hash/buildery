import "server-only";

import type {
  Prisma,
  StoreNotificationChannel,
  StoreNotificationEvent,
} from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
} from "@/lib/telegram";
import { sendWorkspaceWhatsAppText } from "@/lib/whatsapp/send";

export const STORE_NOTIFICATION_MAX_ATTEMPTS = 5;
const STORE_NOTIFICATION_STALE_QUEUED_MINUTES = 5;
const STORE_NOTIFICATION_MAX_BACKOFF_MINUTES = 60;

const RETRYABLE_CHANNELS: StoreNotificationChannel[] = [
  "EMAIL",
  "TELEGRAM",
  "WHATSAPP",
];

const retryableNotificationSelect = {
  id: true,
  workspaceId: true,
  channel: true,
  event: true,
  status: true,
  recipient: true,
  subject: true,
  body: true,
  attempts: true,
  createdAt: true,
} as const;

type RetryableNotification = Prisma.StoreNotificationGetPayload<{
  select: typeof retryableNotificationSelect;
}>;

type DeliveryResult = { ok: true } | { ok: false; error: string };

export type StoreNotificationRetrySummary = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function retryStoreNotifications(
  options: { limit?: number; now?: Date } = {}
): Promise<StoreNotificationRetrySummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const staleQueuedCutoff = addMinutes(
    now,
    -STORE_NOTIFICATION_STALE_QUEUED_MINUTES
  );
  const due = await prisma.storeNotification.findMany({
    where: {
      channel: { in: RETRYABLE_CHANNELS },
      attempts: { lt: STORE_NOTIFICATION_MAX_ATTEMPTS },
      AND: [
        {
          OR: [
            { status: "FAILED" },
            { status: "QUEUED", createdAt: { lte: staleQueuedCutoff } },
          ],
        },
        {
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: retryableNotificationSelect,
  });

  const summary: StoreNotificationRetrySummary = {
    scanned: due.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const notification of due) {
    const attempt = notification.attempts + 1;
    const claim = await prisma.storeNotification.updateMany({
      where: {
        id: notification.id,
        status: notification.status,
        attempts: notification.attempts,
        channel: { in: RETRYABLE_CHANNELS },
      },
      data: {
        status: "QUEUED",
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
        errorMessage: null,
      },
    });

    if (claim.count !== 1) {
      summary.skipped += 1;
      continue;
    }

    const result = await deliverNotification(notification);
    if (result.ok) {
      await prisma.storeNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: now,
          errorMessage: null,
          nextAttemptAt: null,
        },
      });
      summary.sent += 1;
      continue;
    }

    await prisma.storeNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        errorMessage: result.error.slice(0, 500),
        nextAttemptAt:
          attempt >= STORE_NOTIFICATION_MAX_ATTEMPTS
            ? null
            : nextStoreNotificationAttemptAt(attempt, now),
      },
    });
    summary.failed += 1;
  }

  return summary;
}

export function nextStoreNotificationAttemptAt(
  attempts: number,
  now = new Date()
) {
  const minutes = Math.min(
    2 ** Math.max(0, attempts),
    STORE_NOTIFICATION_MAX_BACKOFF_MINUTES
  );
  return addMinutes(now, minutes);
}

async function deliverNotification(
  notification: RetryableNotification
): Promise<DeliveryResult> {
  const subject = notification.subject?.trim() || fallbackSubject(notification.event);
  if (notification.channel === "EMAIL") {
    const result = await sendEmail({
      workspaceId: notification.workspaceId,
      to: notification.recipient,
      subject,
      text: notification.body,
      html: notificationEmailHtml(subject, notification.body),
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  if (notification.channel === "TELEGRAM") {
    const config = await getWorkspaceTelegramConfig(notification.workspaceId);
    if (!config) {
      return { ok: false, error: "Telegram notifications are disabled." };
    }
    const result = await sendTelegramMessage(
      { ...config, chatId: notification.recipient },
      notification.body
    );
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  if (notification.channel === "WHATSAPP") {
    const result = await sendWorkspaceWhatsAppText(
      notification.workspaceId,
      notification.recipient,
      notification.body
    );
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  return {
    ok: false,
    error: `Retry is not supported for ${notification.channel}.`,
  };
}

function fallbackSubject(event: StoreNotificationEvent) {
  if (event === "PAYMENT_PAID") return "Pembayaran diterima";
  if (event === "PAYMENT_CANCELLED") return "Order dibatalkan";
  if (event === "ABANDONED_CHECKOUT_REMINDER") return "Reminder checkout";
  if (event === "LOW_STOCK_ALERT") return "Alert stok rendah";
  if (event === "REFUND_REQUESTED") return "Refund dicatat";
  if (event === "REFUND_APPROVED") return "Refund disetujui";
  if (event === "REFUND_REFUNDED") return "Refund selesai";
  if (event === "REFUND_REJECTED") return "Refund ditolak";
  if (event === "REFUND_CANCELLED") return "Refund dibatalkan";
  return "Order baru";
}

function notificationEmailHtml(subject: string, body: string) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(subject)}</h1>
    <p style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(body)}</p>
  </div>`;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
