import "server-only";

import type { Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { nextStoreNotificationAttemptAt } from "@/lib/store-notification-retry";
import {
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
} from "@/lib/telegram";

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const LOW_STOCK_ALERT_COOLDOWN_HOURS = 24;

const lowStockProductInclude = {
  // A product's own stock is the sum of its variants, so a healthy total can
  // hide a size that has run out completely.
  variants: {
    where: { isActive: true },
    select: { id: true, name: true, stock: true },
    orderBy: { name: "asc" },
  },
  workspace: {
    select: {
      name: true,
      slug: true,
      createdBy: { select: { email: true, name: true } },
      ecommerceSetting: { select: { lowStockThreshold: true } },
    },
  },
} as const;

type LowStockProduct = Prisma.ProductGetPayload<{
  include: typeof lowStockProductInclude;
}>;

type DeliverySummary = {
  attempted: number;
  failed: number;
};

export type LowStockAlertSweepSummary = {
  scanned: number;
  lowStock: number;
  alerted: number;
  resolved: number;
  failed: number;
  skipped: number;
};

export async function sweepLowStockAlerts(
  options: { limit?: number; now?: Date } = {}
): Promise<LowStockAlertSweepSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const alertCutoff = hoursAgo(now, LOW_STOCK_ALERT_COOLDOWN_HOURS);
  const candidateIds = await findCandidateProductIds(limit);
  const products = candidateIds.length
    ? await prisma.product.findMany({
        where: { id: { in: candidateIds } },
        include: lowStockProductInclude,
      })
    : [];
  const position = new Map(candidateIds.map((id, index) => [id, index]));
  products.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  const summary: LowStockAlertSweepSummary = {
    scanned: products.length,
    lowStock: 0,
    alerted: 0,
    resolved: 0,
    failed: 0,
    skipped: 0,
  };

  for (const product of products) {
    const threshold = effectiveLowStockThreshold(product);
    const lowVariants = product.variants.filter(
      (variant) => variant.stock <= threshold
    );
    if (product.stock > threshold && lowVariants.length === 0) {
      const resolved = await prisma.product.updateMany({
        where: { id: product.id, lowStockAlertedAt: { not: null } },
        data: { lowStockAlertedAt: null, lowStockResolvedAt: now },
      });
      if (resolved.count === 1) summary.resolved += 1;
      continue;
    }

    summary.lowStock += 1;
    if (!isAlertDue(product, alertCutoff)) {
      summary.skipped += 1;
      continue;
    }

    const claimed = await prisma.product.updateMany({
      where: {
        id: product.id,
        OR: [
          { lowStockAlertedAt: null },
          { lowStockAlertedAt: { lte: alertCutoff } },
        ],
      },
      data: { lowStockAlertedAt: now, lowStockResolvedAt: null },
    });
    if (claimed.count !== 1) {
      summary.skipped += 1;
      continue;
    }

    const delivery = await sendLowStockAlert(product, threshold, now);
    if (delivery.attempted === 0) {
      summary.skipped += 1;
      await prisma.product.update({
        where: { id: product.id },
        data: { lowStockAlertedAt: null },
      });
      continue;
    }

    summary.alerted += 1;
    summary.failed += delivery.failed;
  }

  return summary;
}

async function findCandidateProductIds(limit: number) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id"
    FROM "Product" p
    LEFT JOIN "EcommerceSetting" es ON es."workspaceId" = p."workspaceId"
    WHERE p."type" = 'PHYSICAL'::"ProductType"
      AND p."status" = 'ACTIVE'::"ProductStatus"
      AND (
        p."lowStockAlertedAt" IS NOT NULL
        OR p."stock" <= COALESCE(
          p."lowStockThreshold",
          es."lowStockThreshold",
          ${DEFAULT_LOW_STOCK_THRESHOLD}
        )
        OR EXISTS (
          SELECT 1 FROM "ProductVariant" v
          WHERE v."productId" = p."id"
            AND v."isActive" = true
            AND v."stock" <= COALESCE(
              p."lowStockThreshold",
              es."lowStockThreshold",
              ${DEFAULT_LOW_STOCK_THRESHOLD}
            )
        )
      )
    ORDER BY
      CASE WHEN p."lowStockAlertedAt" IS NULL THEN 0 ELSE 1 END,
      p."updatedAt" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}

function effectiveLowStockThreshold(product: LowStockProduct) {
  return Math.max(
    0,
    product.lowStockThreshold ??
      product.workspace.ecommerceSetting?.lowStockThreshold ??
      DEFAULT_LOW_STOCK_THRESHOLD
  );
}

function isAlertDue(product: LowStockProduct, alertCutoff: Date) {
  return !product.lowStockAlertedAt || product.lowStockAlertedAt <= alertCutoff;
}

async function sendLowStockAlert(
  product: LowStockProduct,
  threshold: number,
  now: Date
): Promise<DeliverySummary> {
  const subject = `Stok menipis · ${product.name}`;
  const productUrl = absoluteAppUrl(`/dashboard/products/${product.id}/edit`);
  const lowVariants = product.variants.filter(
    (variant) => variant.stock <= threshold
  );
  const body = [
    `${product.workspace.name} perlu restock produk.`,
    `Produk: ${product.name}`,
    product.sku ? `SKU: ${product.sku}` : "",
    `Stok saat ini: ${product.stock}`,
    // Which variant ran out is the part the seller has to act on; the total
    // can look healthy while one size is at zero.
    lowVariants.length > 0
      ? `Varian menipis: ${lowVariants
          .map((variant) => `${variant.name} (${variant.stock})`)
          .join(", ")}`
      : "",
    `Ambang alert: ${threshold}`,
    `Kelola produk: ${productUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const summary: DeliverySummary = { attempted: 0, failed: 0 };
  const ownerEmail = product.workspace.createdBy.email;
  if (ownerEmail) {
    summary.attempted += 1;
    const ok = await createAndSendEmail({
      workspaceId: product.workspaceId,
      recipient: ownerEmail,
      subject,
      body,
      html: lowStockEmailHtml({
        workspaceName: product.workspace.name,
        productName: product.name,
        stock: product.stock,
        threshold,
        productUrl,
      }),
      now,
    });
    if (!ok) summary.failed += 1;
  }

  const config = await getWorkspaceTelegramConfig(product.workspaceId);
  if (config) {
    summary.attempted += 1;
    const ok = await createAndSendTelegram({
      workspaceId: product.workspaceId,
      recipient: config.chatId,
      subject,
      body: `${subject}\n\n${body}`,
      config,
      now,
    });
    if (!ok) summary.failed += 1;
  }

  return summary;
}

async function createAndSendEmail(input: {
  workspaceId: string;
  recipient: string;
  subject: string;
  body: string;
  html: string;
  now: Date;
}) {
  const notification = await prisma.storeNotification.create({
    data: {
      workspaceId: input.workspaceId,
      customerId: null,
      orderId: null,
      channel: "EMAIL",
      event: "LOW_STOCK_ALERT",
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
  });

  await prisma.storeNotification.update({
    where: { id: notification.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? input.now : null,
      attempts: { increment: 1 },
      lastAttemptAt: input.now,
      nextAttemptAt: result.ok ? null : nextStoreNotificationAttemptAt(1, input.now),
      errorMessage: result.ok ? null : result.error.slice(0, 500),
    },
  });

  return result.ok;
}

async function createAndSendTelegram(input: {
  workspaceId: string;
  recipient: string;
  subject: string;
  body: string;
  config: NonNullable<Awaited<ReturnType<typeof getWorkspaceTelegramConfig>>>;
  now: Date;
}) {
  const notification = await prisma.storeNotification.create({
    data: {
      workspaceId: input.workspaceId,
      customerId: null,
      orderId: null,
      channel: "TELEGRAM",
      event: "LOW_STOCK_ALERT",
      status: "QUEUED",
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
    },
  });

  const result = await sendTelegramMessage(input.config, input.body);
  await prisma.storeNotification.update({
    where: { id: notification.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? input.now : null,
      attempts: { increment: 1 },
      lastAttemptAt: input.now,
      nextAttemptAt: result.ok ? null : nextStoreNotificationAttemptAt(1, input.now),
      errorMessage: result.ok ? null : result.error.slice(0, 500),
    },
  });

  return result.ok;
}

function absoluteAppUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return new URL(pathOrUrl, base).toString();
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function lowStockEmailHtml(input: {
  workspaceName: string;
  productName: string;
  stock: number;
  threshold: number;
  productUrl: string;
}) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b">
    <p style="font-size:12px;color:#71717a;margin:0 0 8px">${escapeHtml(
      input.workspaceName
    )}</p>
    <h1 style="font-size:22px;margin:0 0 12px">Stok produk menipis</h1>
    <div style="margin-top:18px;padding:14px;border:1px solid #e4e4e7;border-radius:12px">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a">${escapeHtml(
        input.productName
      )}</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#18181b">Stok ${escapeHtml(
        String(input.stock)
      )}</p>
      <p style="margin:8px 0 0;color:#52525b">Ambang alert: ${escapeHtml(
        String(input.threshold)
      )}</p>
      <a href="${escapeHtml(
        input.productUrl
      )}" style="display:inline-block;margin-top:14px;border-radius:10px;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 14px;font-weight:600">Kelola produk</a>
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
