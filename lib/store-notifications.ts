import "server-only";

import type {
  Prisma,
  PrismaClient,
  StoreNotificationEvent,
} from "@prisma/client";

import { queueWhatsAppInboxMessage } from "@/lib/ecommerce-integration";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
} from "@/lib/telegram";
import { nextStoreNotificationAttemptAt } from "@/lib/store-notification-retry";
import { formatPrice } from "@/lib/utils";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function queueAffiliateEmailNotification(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId: string;
    recipient: string;
    event: Extract<
      StoreNotificationEvent,
      | "AFFILIATE_APPLICATION_RECEIVED"
      | "AFFILIATE_APPROVED"
      | "AFFILIATE_SALE"
      | "COMMISSION_APPROVED"
      | "COMMISSION_REVERSED"
      | "PAYOUT_PAID"
    >;
    subject: string;
    body: string;
  }
) {
  await createAndSendEmail(tx, {
    ...input,
    orderId: null,
    html: simpleEmailHtml(input.subject, input.body),
  });
}

export async function queueCourseEmailNotification(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId: string;
    recipient: string;
    event: Extract<StoreNotificationEvent, "COURSE_ENROLLED" | "COURSE_COMPLETED" | "COURSE_ANNOUNCEMENT" | "LIVE_SESSION_REMINDER">;
    subject: string;
    body: string;
  }
) {
  await createAndSendEmail(tx, {
    ...input,
    orderId: null,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b"><h2>${escapeNotificationHtml(input.subject)}</h2><p>${escapeNotificationHtml(input.body).replace(/\n/g, "<br>")}</p></div>`,
  });
}

export async function queueMembershipEmailNotification(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId: string;
    recipient: string;
    event: Extract<
      StoreNotificationEvent,
      | "MEMBERSHIP_WELCOME"
      | "MEMBERSHIP_RENEWED"
      | "MEMBERSHIP_EXPIRING"
      | "MEMBERSHIP_EXPIRED"
      | "MEMBERSHIP_CANCELLED"
      | "MEMBERSHIP_PAYMENT_FAILED"
    >;
    subject: string;
    body: string;
  }
) {
  await createAndSendEmail(tx, {
    ...input,
    orderId: null,
    html: simpleEmailHtml(input.subject, input.body),
  });
}

type ManualPaymentSnapshot = {
  methodId?: string;
  type?: string;
  name?: string;
  accountName?: string | null;
  accountNumber?: string | null;
  qrImageUrl?: string | null;
  instructions?: string | null;
};

export async function queueOrderNotifications(
  tx: Tx,
  orderId: string,
  event: StoreNotificationEvent
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      workspace: {
        select: {
          name: true,
          createdBy: { select: { email: true, name: true } },
        },
      },
      customer: true,
      items: true,
      payment: true,
    },
  });
  if (!order) return;

  const customerName = order.customer?.name || order.customerNameSnapshot || "Customer";
  const customerEmail = order.customer?.email || order.customerEmailSnapshot;
  const customerPhone = order.customer?.phone || order.customerPhoneSnapshot;

  const isPaid = event === "PAYMENT_PAID";
  const isCancelled = event === "PAYMENT_CANCELLED";
  const isReminder = event === "PAYMENT_REMINDER";
  const manualPayment = readManualPayment(order.payment?.rawNotification);
  const itemSummary = order.items
    .map((item) => `${item.nameSnapshot} x${item.quantity}`)
    .join(", ");
  const customerSubject = isPaid
    ? `Pembayaran ${order.orderNumber} berhasil`
    : isCancelled
      ? `Pesanan ${order.orderNumber} dibatalkan`
      : isReminder
        ? `Selesaikan pembayaran ${order.orderNumber}`
        : `Pesanan ${order.orderNumber} diterima`;
  const customerBody = isReminder
    ? [
        `Halo ${customerName}, pesanan ${order.orderNumber} masih menunggu pembayaran.`,
        `Total tagihan: ${formatPrice(order.total)}.`,
        `Item: ${itemSummary}.`,
        "Selesaikan pembayaran sebelum batas waktu agar pesanan tidak dibatalkan otomatis.",
        manualPayment ? manualPaymentText(manualPayment) : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : isPaid
    ? [
        `Terima kasih ${customerName}.`,
        `Pembayaran order ${order.orderNumber} sebesar ${formatPrice(
          order.total
        )} sudah berhasil.`,
        `Kami akan segera memproses pesanan Anda.`,
      ].join("\n")
    : isCancelled
      ? [
          `Halo ${customerName}, order ${order.orderNumber} sudah dibatalkan.`,
          `Jika Anda belum menyelesaikan pembayaran, tagihan tersebut tidak perlu dibayar lagi.`,
          `Item: ${itemSummary}.`,
        ].join("\n")
    : [
        `Halo ${customerName}, order ${order.orderNumber} sudah kami terima.`,
        `Total tagihan: ${formatPrice(order.total)}.`,
        `Item: ${itemSummary}.`,
        manualPayment ? manualPaymentText(manualPayment) : "",
      ]
        .filter(Boolean)
        .join("\n\n");

  if (customerEmail) await createAndSendEmail(tx, {
    workspaceId: order.workspaceId,
    customerId: order.customerId,
    orderId: order.id,
    event,
    recipient: customerEmail,
    subject: customerSubject,
    body: customerBody,
    html: orderEmailHtml({
      workspaceName: order.workspace.name,
      title: customerSubject,
      intro: customerBody,
      orderNumber: order.orderNumber,
      total: order.total,
      items: order.items,
      manualPayment,
    }),
    replyTo: order.workspace.createdBy.email,
  });

  const ownerSubject = isPaid
    ? `Pembayaran diterima · ${order.orderNumber}`
    : isCancelled
      ? `Order dibatalkan · ${order.orderNumber}`
      : `Order baru · ${order.orderNumber}`;
  const ownerBody = [
    `${order.workspace.name} ${
      isPaid
        ? "menerima pembayaran"
        : isCancelled
          ? "membatalkan order"
          : "menerima order baru"
    }.`,
    `Customer: ${customerName}${customerEmail ? ` <${customerEmail}>` : ""}`,
    customerPhone ? `Phone: ${customerPhone}` : "",
    `Order: ${order.orderNumber}`,
    `Total: ${formatPrice(order.total)}`,
    `Item: ${itemSummary}`,
    manualPayment ? `Metode manual: ${manualPayment.name}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ownerEmail = order.workspace.createdBy.email;
  if (ownerEmail && ownerEmail !== customerEmail) {
    await createAndSendEmail(tx, {
      workspaceId: order.workspaceId,
      customerId: null,
      orderId: order.id,
      event,
      recipient: ownerEmail,
      subject: ownerSubject,
      body: ownerBody,
      html: orderEmailHtml({
        workspaceName: order.workspace.name,
        title: ownerSubject,
        intro: ownerBody,
        orderNumber: order.orderNumber,
        total: order.total,
        items: order.items,
        manualPayment,
      }),
      replyTo: customerEmail ?? undefined,
    });
  }

  await createAndSendTelegram(tx, {
    workspaceId: order.workspaceId,
    customerId: null,
    orderId: order.id,
    event,
    subject: ownerSubject,
    body: `${ownerSubject}\n\n${ownerBody}`,
  });

  if (customerPhone) {
    const conversation = await queueWhatsAppInboxMessage(tx, {
      workspaceId: order.workspaceId,
      customerId: order.customerId,
      contactName: customerName,
      contactPhone: customerPhone,
      body: customerBody,
    });

    await tx.storeNotification.create({
      data: {
        workspaceId: order.workspaceId,
        customerId: order.customerId,
        orderId: order.id,
        channel: "WHATSAPP",
        event,
        status: conversation ? "QUEUED" : "FAILED",
        recipient: customerPhone,
        subject: customerSubject,
        body: customerBody,
        errorMessage: conversation ? null : "Nomor WhatsApp tidak valid.",
      },
    });
  }
}

export async function queueRefundNotification(
  tx: Tx,
  refundId: string,
  event: StoreNotificationEvent
) {
  const refund = await tx.orderRefund.findUnique({
    where: { id: refundId },
    include: {
      workspace: {
        select: {
          name: true,
          createdBy: { select: { email: true, name: true } },
        },
      },
      customer: true,
      order: { select: { id: true, orderNumber: true, total: true } },
      items: {
        include: {
          orderItem: {
            select: {
              nameSnapshot: true,
              unitPrice: true,
              quantity: true,
            },
          },
        },
      },
    },
  });
  if (!refund) return;

  const subject = refundSubject(event, refund.order.orderNumber);
  const itemSummary =
    refund.items.length > 0
      ? refund.items
          .map((item) => {
            const restock =
              item.restockQuantity > 0 ? `, restock ${item.restockQuantity}` : "";
            return `${item.orderItem.nameSnapshot} refund ${item.quantity}${restock}`;
          })
          .join("; ")
      : "Tidak ada item spesifik.";
  const body = [
    refund.customer
      ? `Halo ${refund.customer.name},`
      : `Update refund untuk order ${refund.order.orderNumber}.`,
    refundBodyLine(event, refund.order.orderNumber, refund.amount),
    `Nominal: ${formatPrice(refund.amount)}.`,
    `Item: ${itemSummary}.`,
    refund.returnToStock ? "Item retur akan dikembalikan ke stok setelah refund selesai." : "",
    refund.provider === "midtrans" ? "Refund diproses melalui Midtrans." : "",
    refund.providerReference ? `Referensi: ${refund.providerReference}.` : "",
    refund.reason ? `Alasan: ${refund.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (refund.customer) {
    await createAndSendEmail(tx, {
      workspaceId: refund.workspaceId,
      customerId: refund.customerId,
      orderId: refund.order.id,
      event,
      recipient: refund.customer.email,
      subject,
      body,
      html: refundEmailHtml(subject, body),
      replyTo: refund.workspace.createdBy.email,
    });
  }

  const ownerBody = [
    `${refund.workspace.name}: ${subject}`,
    refund.customer
      ? `Customer: ${refund.customer.name} <${refund.customer.email}>`
      : "",
    refund.customer?.phone ? `Phone: ${refund.customer.phone}` : "",
    `Order: ${refund.order.orderNumber}`,
    `Nominal: ${formatPrice(refund.amount)}`,
    `Item: ${itemSummary}`,
    refund.provider === "midtrans" ? "Provider: Midtrans" : "Provider: manual",
    refund.providerReference ? `Referensi: ${refund.providerReference}` : "",
    refund.reason ? `Alasan: ${refund.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ownerEmail = refund.workspace.createdBy.email;
  if (ownerEmail && ownerEmail !== refund.customer?.email) {
    await createAndSendEmail(tx, {
      workspaceId: refund.workspaceId,
      customerId: null,
      orderId: refund.order.id,
      event,
      recipient: ownerEmail,
      subject,
      body: ownerBody,
      html: refundEmailHtml(subject, ownerBody),
      replyTo: refund.customer?.email,
    });
  }

  await createAndSendTelegram(tx, {
    workspaceId: refund.workspaceId,
    customerId: null,
    orderId: refund.order.id,
    event,
    subject,
    body: `${subject}\n\n${ownerBody}`,
  });

  if (refund.customer?.phone) {
    const conversation = await queueWhatsAppInboxMessage(tx, {
      workspaceId: refund.workspaceId,
      customerId: refund.customerId,
      contactName: refund.customer.name,
      contactPhone: refund.customer.phone,
      body,
    });

    await tx.storeNotification.create({
      data: {
        workspaceId: refund.workspaceId,
        customerId: refund.customerId,
        orderId: refund.order.id,
        channel: "WHATSAPP",
        event,
        status: conversation ? "QUEUED" : "FAILED",
        recipient: refund.customer.phone,
        subject,
        body,
        errorMessage: conversation ? null : "Nomor WhatsApp tidak valid.",
      },
    });
  }
}

async function createAndSendTelegram(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId: string | null;
    orderId: string | null;
    event: StoreNotificationEvent;
    subject: string;
    body: string;
  }
) {
  const config = await getWorkspaceTelegramConfig(input.workspaceId, tx);
  if (!config) return;

  const notification = await tx.storeNotification.create({
    data: {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      orderId: input.orderId,
      channel: "TELEGRAM",
      event: input.event,
      status: "QUEUED",
      recipient: config.chatId,
      subject: input.subject,
      body: input.body,
    },
  });

  const result = await sendTelegramMessage(config, input.body);
  const now = new Date();
  await tx.storeNotification.update({
    where: { id: notification.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? now : null,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      nextAttemptAt: result.ok ? null : nextStoreNotificationAttemptAt(1, now),
      errorMessage: result.ok ? null : result.error.slice(0, 500),
    },
  });
}

function escapeNotificationHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * A standalone store email that belongs to no order — a back-in-stock alert,
 * say. Recorded as a StoreNotification like every other one, so the retry
 * sweep and the audit trail treat it the same.
 */
export async function sendStoreEmail(input: {
  workspaceId: string;
  event: StoreNotificationEvent;
  recipient: string;
  subject: string;
  body: string;
}) {
  return createAndSendEmail(prisma, {
    workspaceId: input.workspaceId,
    customerId: null,
    orderId: null,
    event: input.event,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    html: simpleEmailHtml(input.subject, input.body),
  });
}

function simpleEmailHtml(title: string, body: string) {
  const paragraphs = body
    .split("\n\n")
    .map(
      (part) =>
        `<p style="margin:0 0 12px;line-height:1.6">${escapeHtml(part).replace(
          /\n/g,
          "<br />"
        )}</p>`
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:520px"><h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(
    title
  )}</h1>${paragraphs}</div>`;
}

async function createAndSendEmail(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId: string | null;
    orderId: string | null;
    event: StoreNotificationEvent;
    recipient: string;
    subject: string;
    body: string;
    html: string;
    replyTo?: string | null;
  }
) {
  const notification = await tx.storeNotification.create({
    data: {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      orderId: input.orderId,
      channel: "EMAIL",
      event: input.event,
      status: "QUEUED",
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
    },
  });

  const result = await sendEmail({
    workspaceId: input.workspaceId,
    to: input.recipient,
    subject: input.subject,
    text: input.body,
    html: input.html,
    replyTo: input.replyTo ?? undefined,
  });
  const now = new Date();

  await tx.storeNotification.update({
    where: { id: notification.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? now : null,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      nextAttemptAt: result.ok ? null : nextStoreNotificationAttemptAt(1, now),
      errorMessage: result.ok ? null : result.error.slice(0, 500),
    },
  });
}

function readManualPayment(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const manual = root.manualPayment;
  if (!manual || typeof manual !== "object" || Array.isArray(manual)) return null;
  const raw = manual as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!name) return null;
  return {
    methodId: typeof raw.methodId === "string" ? raw.methodId : undefined,
    type: typeof raw.type === "string" ? raw.type : undefined,
    name,
    accountName:
      typeof raw.accountName === "string" ? raw.accountName : null,
    accountNumber:
      typeof raw.accountNumber === "string" ? raw.accountNumber : null,
    qrImageUrl:
      typeof raw.qrImageUrl === "string" ? raw.qrImageUrl : null,
    instructions:
      typeof raw.instructions === "string" ? raw.instructions : null,
  } satisfies ManualPaymentSnapshot;
}

function manualPaymentText(manualPayment: ManualPaymentSnapshot) {
  return [
    `Metode pembayaran: ${manualPayment.name}`,
    manualPayment.accountName
      ? `Atas nama: ${manualPayment.accountName}`
      : "",
    manualPayment.accountNumber
      ? `Nomor akun/rekening: ${manualPayment.accountNumber}`
      : "",
    manualPayment.instructions
      ? `Instruksi: ${manualPayment.instructions}`
      : "Silakan transfer sesuai total tagihan, lalu tunggu konfirmasi admin.",
  ]
    .filter(Boolean)
    .join("\n");
}

function refundSubject(event: StoreNotificationEvent, orderNumber: string) {
  if (event === "REFUND_APPROVED") return `Refund ${orderNumber} disetujui`;
  if (event === "REFUND_REFUNDED") return `Refund ${orderNumber} selesai`;
  if (event === "REFUND_REJECTED") return `Refund ${orderNumber} ditolak`;
  if (event === "REFUND_CANCELLED") return `Refund ${orderNumber} dibatalkan`;
  return `Refund ${orderNumber} dicatat`;
}

function refundBodyLine(
  event: StoreNotificationEvent,
  orderNumber: string,
  amount: number
) {
  const formattedAmount = formatPrice(amount);
  if (event === "REFUND_APPROVED") {
    return `Permintaan refund order ${orderNumber} sebesar ${formattedAmount} sudah disetujui.`;
  }
  if (event === "REFUND_REFUNDED") {
    return `Refund order ${orderNumber} sebesar ${formattedAmount} sudah diproses.`;
  }
  if (event === "REFUND_REJECTED") {
    return `Permintaan refund order ${orderNumber} sebesar ${formattedAmount} ditolak.`;
  }
  if (event === "REFUND_CANCELLED") {
    return `Permintaan refund order ${orderNumber} sebesar ${formattedAmount} dibatalkan.`;
  }
  return `Permintaan refund order ${orderNumber} sebesar ${formattedAmount} sudah dicatat.`;
}

function refundEmailHtml(subject: string, body: string) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(subject)}</h1>
    <p style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(body)}</p>
  </div>`;
}

function orderEmailHtml(input: {
  workspaceName: string;
  title: string;
  intro: string;
  orderNumber: string;
  total: number;
  items: { nameSnapshot: string; quantity: number; unitPrice: number }[];
  manualPayment: ManualPaymentSnapshot | null;
}) {
  const itemRows = input.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;color:#52525b">${escapeHtml(
          item.nameSnapshot
        )} x${item.quantity}</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#18181b">${escapeHtml(
          formatPrice(item.unitPrice * item.quantity)
        )}</td></tr>`
    )
    .join("");
  const manual = input.manualPayment
    ? `<div style="margin-top:18px;padding:14px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;color:#78350f"><strong>Transfer manual</strong><pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;margin:8px 0 0">${escapeHtml(
        manualPaymentText(input.manualPayment)
      )}</pre></div>`
    : "";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b">
    <p style="font-size:12px;color:#71717a;margin:0 0 8px">${escapeHtml(
      input.workspaceName
    )}</p>
    <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(input.title)}</h1>
    <p style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(input.intro)}</p>
    <div style="margin-top:18px;padding:14px;border:1px solid #e4e4e7;border-radius:12px">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a">Order ${escapeHtml(
        input.orderNumber
      )}</p>
      <table style="width:100%;border-collapse:collapse">${itemRows}</table>
      <div style="border-top:1px solid #e4e4e7;margin-top:8px;padding-top:12px;display:flex;justify-content:space-between">
        <strong>Total</strong><strong>${escapeHtml(formatPrice(input.total))}</strong>
      </div>
    </div>
    ${manual}
  </div>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
