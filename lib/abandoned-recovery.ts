import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { queueWhatsAppInboxMessage } from "@/lib/ecommerce-integration";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { issuePublicAccessToken } from "@/lib/public-access-token";
import { publicSiteHref } from "@/lib/public-url";
import { nextStoreNotificationAttemptAt } from "@/lib/store-notification-retry";
import { formatDate, formatPrice } from "@/lib/utils";
import { reportError } from "@/lib/error-reporting";

const FIRST_REMINDER_DELAY_MINUTES = 30;
const SECOND_REMINDER_DELAY_MINUTES = 6 * 60;
const MAX_AUTO_ATTEMPTS = 2;

type Tx = Prisma.TransactionClient | PrismaClient;

const abandonedOrderInclude = {
  abandonedRecovery: true,
  customer: true,
  items: true,
  payment: true,
  workspace: {
    select: {
      name: true,
      slug: true,
      createdBy: { select: { email: true } },
    },
  },
} as const;

type AbandonedOrder = Prisma.OrderGetPayload<{
  include: typeof abandonedOrderInclude;
}>;

export type AbandonedCheckoutSweepSummary = {
  scanned: number;
  opened: number;
  contacted: number;
  skipped: number;
  failed: number;
};

export async function sweepAbandonedCheckouts(
  options: { limit?: number; now?: Date } = {}
): Promise<AbandonedCheckoutSweepSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const firstCutoff = minutesAgo(now, FIRST_REMINDER_DELAY_MINUTES);
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING",
      customerId: { not: null },
      createdAt: { lte: firstCutoff },
      payment: {
        is: {
          status: "PENDING",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      OR: [
        { abandonedRecovery: { is: null } },
        {
          abandonedRecovery: {
            is: {
              status: { in: ["OPEN", "CONTACTED", "SNOOZED"] },
            },
          },
        },
      ],
    },
    include: abandonedOrderInclude,
    orderBy: { createdAt: "asc" },
    take: limit * 3,
  });

  const summary: AbandonedCheckoutSweepSummary = {
    scanned: candidates.length,
    opened: 0,
    contacted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    if (summary.contacted >= limit) break;
    if (!isReminderDue(candidate, now)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: candidate.id },
          include: abandonedOrderInclude,
        });
        if (!order || !isReminderDue(order, now)) {
          return { contacted: false, opened: false };
        }

        const attempt = (order.abandonedRecovery?.attempts ?? 0) + 1;
        const opened = await claimRecoveryAttempt(tx, order, now);
        if (!opened.claimed) return { contacted: false, opened: false };

        await queueAbandonedReminder(tx, order, attempt, now);
        return { contacted: true, opened: opened.created };
      });

      if (result.contacted) {
        summary.contacted += 1;
        if (result.opened) summary.opened += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      reportError("abandoned failed to contact checkout", error, {
        context: { orderNumber: candidate.orderNumber },
      });
    }
  }

  return summary;
}

async function claimRecoveryAttempt(
  tx: Tx,
  order: AbandonedOrder,
  now: Date
): Promise<{ claimed: boolean; created: boolean }> {
  const data = {
    status: "CONTACTED" as const,
    attempts: { increment: 1 },
    lastContactedAt: now,
    snoozedUntil: null,
    recoveredAt: null,
    ignoredAt: null,
    note: `Auto reminder sent at ${now.toISOString()}`,
  };

  if (!order.abandonedRecovery) {
    try {
      await tx.abandonedCheckoutRecovery.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          status: "CONTACTED",
          attempts: 1,
          lastContactedAt: now,
          note: data.note,
        },
      });
      return { claimed: true, created: true };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return { claimed: false, created: false };
      }
      throw error;
    }
  }

  const updated = await tx.abandonedCheckoutRecovery.updateMany({
    where: {
      id: order.abandonedRecovery.id,
      status: order.abandonedRecovery.status,
      attempts: order.abandonedRecovery.attempts,
    },
    data,
  });
  return { claimed: updated.count === 1, created: false };
}

async function queueAbandonedReminder(
  tx: Tx,
  order: AbandonedOrder,
  attempt: number,
  now: Date
) {
  if (!order.customer || !order.payment) return;

  const recoveryUrl = buildRecoveryUrl(order, now);
  const paymentDeadline =
    order.payment.expiresAt && order.payment.expiresAt > now
      ? formatDate(order.payment.expiresAt)
      : null;
  const itemSummary = order.items
    .map((item) => `${item.nameSnapshot} x${item.quantity}`)
    .join(", ");
  const subject =
    attempt > 1
      ? `Reminder terakhir untuk checkout ${order.orderNumber}`
      : `Checkout ${order.orderNumber} masih menunggu pembayaran`;
  const body = [
    `Halo ${order.customer.name},`,
    `Checkout Anda di ${order.workspace.name} masih menunggu pembayaran sebesar ${formatPrice(
      order.total
    )}.`,
    itemSummary ? `Item: ${itemSummary}.` : "",
    paymentDeadline ? `Batas pembayaran: ${paymentDeadline}.` : "",
    `Lanjutkan pembayaran: ${recoveryUrl}`,
    "Abaikan pesan ini jika pembayaran sudah berhasil.",
  ]
    .filter(Boolean)
    .join("\n\n");

  await tx.followUpTask.create({
    data: {
      workspaceId: order.workspaceId,
      customerId: order.customerId,
      orderId: order.id,
      title: `Recover ${order.orderNumber}`,
      note: body,
      channel: "EMAIL",
      priority: "HIGH",
      dueAt: now,
    },
  });

  const notification = await tx.storeNotification.create({
    data: {
      workspaceId: order.workspaceId,
      customerId: order.customerId,
      orderId: order.id,
      channel: "EMAIL",
      event: "ABANDONED_CHECKOUT_REMINDER",
      status: "QUEUED",
      recipient: order.customer.email,
      subject,
      body,
    },
  });

  const email = await sendEmail({
    workspaceId: order.workspaceId,
    to: order.customer.email,
    subject,
    text: body,
    html: reminderEmailHtml({
      workspaceName: order.workspace.name,
      title: subject,
      body,
      orderNumber: order.orderNumber,
      total: order.total,
      recoveryUrl,
    }),
    replyTo: order.workspace.createdBy.email,
  });

  await tx.storeNotification.update({
    where: { id: notification.id },
    data: {
      status: email.ok ? "SENT" : "FAILED",
      sentAt: email.ok ? now : null,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      nextAttemptAt: email.ok ? null : nextStoreNotificationAttemptAt(1, now),
      errorMessage: email.ok ? null : email.error.slice(0, 500),
    },
  });

  if (order.customer.phone) {
    const whatsAppBody = [
      `Halo ${order.customer.name}, checkout ${order.orderNumber} masih menunggu pembayaran.`,
      `Total: ${formatPrice(order.total)}.`,
      `Lanjutkan: ${recoveryUrl}`,
    ].join("\n");
    const conversation = await queueWhatsAppInboxMessage(tx, {
      workspaceId: order.workspaceId,
      customerId: order.customer.id,
      contactName: order.customer.name,
      contactPhone: order.customer.phone,
      body: whatsAppBody,
    });

    await tx.storeNotification.create({
      data: {
        workspaceId: order.workspaceId,
        customerId: order.customerId,
        orderId: order.id,
        channel: "WHATSAPP",
        event: "ABANDONED_CHECKOUT_REMINDER",
        status: conversation ? "QUEUED" : "FAILED",
        recipient: order.customer.phone,
        subject,
        body: whatsAppBody,
        errorMessage: conversation ? null : "Nomor WhatsApp tidak valid.",
      },
    });
  }
}

function isReminderDue(order: AbandonedOrder, now: Date) {
  if (order.status !== "PENDING") return false;
  if (!order.payment || order.payment.status !== "PENDING") return false;
  if (order.payment.expiresAt && order.payment.expiresAt <= now) return false;

  const recovery = order.abandonedRecovery;
  if (recovery?.status === "RECOVERED" || recovery?.status === "IGNORED") {
    return false;
  }
  if (recovery?.snoozedUntil && recovery.snoozedUntil > now) return false;

  const attempts = recovery?.attempts ?? 0;
  if (attempts >= MAX_AUTO_ATTEMPTS) return false;

  const base =
    attempts === 0
      ? order.createdAt
      : recovery?.lastContactedAt ?? order.createdAt;
  const delay =
    attempts === 0
      ? FIRST_REMINDER_DELAY_MINUTES
      : SECOND_REMINDER_DELAY_MINUTES;
  return addMinutes(base, delay) <= now;
}

function buildRecoveryUrl(order: AbandonedOrder, now: Date) {
  if (!order.payment) return absoluteAppUrl(publicSiteHref(order.workspace.slug));
  const ttlSeconds = recoveryTokenTtlSeconds(order.payment.expiresAt, now);

  if (order.payment.provider.startsWith("manual:")) {
    const access = issuePublicAccessToken("order", order.id, ttlSeconds);
    return absoluteAppUrl(
      publicSiteHref(
        order.workspace.slug,
        `checkout/success?order=${encodeURIComponent(
          order.orderNumber
        )}&access=${encodeURIComponent(access)}`
      )
    );
  }

  const access = issuePublicAccessToken("payment", order.payment.id, ttlSeconds);
  return absoluteAppUrl(
    `/payment/resume?ref=${encodeURIComponent(
      order.payment.midtransOrderId
    )}&access=${encodeURIComponent(access)}`
  );
}

function recoveryTokenTtlSeconds(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return 7 * 24 * 60 * 60;
  return Math.max(60 * 60, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

function absoluteAppUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return new URL(pathOrUrl, base).toString();
}

function minutesAgo(now: Date, minutes: number) {
  return addMinutes(now, -minutes);
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function reminderEmailHtml(input: {
  workspaceName: string;
  title: string;
  body: string;
  orderNumber: string;
  total: number;
  recoveryUrl: string;
}) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b">
    <p style="font-size:12px;color:#71717a;margin:0 0 8px">${escapeHtml(
      input.workspaceName
    )}</p>
    <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(input.title)}</h1>
    <p style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(input.body)}</p>
    <div style="margin-top:18px;padding:14px;border:1px solid #e4e4e7;border-radius:12px">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a">Order ${escapeHtml(
        input.orderNumber
      )}</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#18181b">${escapeHtml(
        formatPrice(input.total)
      )}</p>
      <a href="${escapeHtml(
        input.recoveryUrl
      )}" style="display:inline-block;margin-top:14px;border-radius:10px;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 14px;font-weight:600">Lanjutkan pembayaran</a>
    </div>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
