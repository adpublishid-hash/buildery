import "server-only";

import { prisma } from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/public-url";
import { sendStoreEmail } from "@/lib/store-notifications";

/**
 * "Tell me when it's back."
 *
 * A sold-out product page was a dead end: the shopper left and nothing brought
 * them back when stock arrived. One email per signup, sent by a sweep rather
 * than at the moment stock changes — restocking often happens in bursts, and a
 * per-write hook would fire mid-transaction.
 */

/** One key per thing to watch, so a product with no variant dedupes too. */
export function stockTargetKey(productId: string, variantId?: string | null) {
  return `${productId}:${variantId ?? ""}`;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 200);
}

const MAX_PER_RUN = 200;

export type StockSweepSummary = { notified: number };

export async function sweepStockNotifications(
  options: { now?: Date } = {}
): Promise<StockSweepSummary> {
  const now = options.now ?? new Date();

  const waiting = await prisma.stockNotification.findMany({
    where: {
      notifiedAt: null,
      product: { status: "ACTIVE" },
      // Either the whole product is back, or the exact variant is.
      OR: [
        { variantId: null, product: { stock: { gt: 0 } } },
        { variant: { is: { stock: { gt: 0 }, isActive: true } } },
      ],
    },
    select: {
      id: true,
      email: true,
      workspaceId: true,
      product: { select: { name: true, slug: true } },
      variant: { select: { name: true } },
      workspace: { select: { slug: true, name: true } },
    },
    take: MAX_PER_RUN,
    orderBy: { createdAt: "asc" },
  });

  let notified = 0;
  for (const entry of waiting) {
    try {
      // Claim first: two overlapping sweeps must not both email.
      const claimed = await prisma.stockNotification.updateMany({
        where: { id: entry.id, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count !== 1) continue;

      const name = entry.variant
        ? `${entry.product.name} — ${entry.variant.name}`
        : entry.product.name;
      const url = publicSiteUrl(
        entry.workspace.slug,
        `products/${entry.product.slug}`
      );

      await sendStoreEmail({
        workspaceId: entry.workspaceId,
        event: "BACK_IN_STOCK",
        recipient: entry.email,
        subject: `${name} sudah tersedia lagi`,
        body: [
          `${name} yang Anda tunggu sudah tersedia kembali di ${entry.workspace.name}.`,
          "Stok terbatas — segera pesan sebelum habis lagi.",
          url,
        ].join("\n\n"),
      });
      notified += 1;
    } catch (error) {
      // One failed email must not stop the rest of the sweep.
      console.warn(`[stock-notify] ${entry.email} failed:`, error);
    }
  }

  return { notified };
}
