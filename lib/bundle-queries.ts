import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { bundleAvailability, type BundleComponent } from "@/lib/product-bundles";

/**
 * Reading what a bundle contains, and what that lets it sell.
 *
 * A bundle never stores a stock number: the products inside it are the truth,
 * and they change on every sale of the component on its own.
 */

type Db = Prisma.TransactionClient | PrismaClient;

export async function bundleContents(
  bundleIds: string[],
  db: Db = prisma
): Promise<Map<string, BundleComponent[]>> {
  const byBundle = new Map<string, BundleComponent[]>();
  if (bundleIds.length === 0) return byBundle;

  const rows = await db.productBundleItem.findMany({
    where: { bundleId: { in: bundleIds } },
    select: {
      bundleId: true,
      productId: true,
      variantId: true,
      quantity: true,
      product: { select: { name: true, type: true, stock: true } },
      variant: { select: { name: true, stock: true, isActive: true } },
    },
  });

  for (const row of rows) {
    const list = byBundle.get(row.bundleId) ?? [];
    list.push({
      productId: row.productId,
      variantId: row.variantId,
      quantity: Math.max(1, row.quantity),
      // An inactive variant can supply nothing, whatever its stock says.
      availableStock: row.variantId
        ? row.variant?.isActive
          ? row.variant.stock
          : 0
        : row.product.stock,
      tracksStock: row.product.type === "PHYSICAL",
      name: row.variant ? `${row.product.name} — ${row.variant.name}` : row.product.name,
    });
    byBundle.set(row.bundleId, list);
  }

  return byBundle;
}

/** How many of each bundle can be sold right now. */
export async function bundleStock(
  bundleIds: string[],
  db: Db = prisma
): Promise<Map<string, number>> {
  const contents = await bundleContents(bundleIds, db);
  const stock = new Map<string, number>();
  for (const id of bundleIds) {
    stock.set(id, bundleAvailability(contents.get(id) ?? []));
  }
  return stock;
}
