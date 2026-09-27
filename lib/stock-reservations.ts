import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { recordInventoryMovement } from "@/lib/inventory-ledger";
import { bundleContents } from "@/lib/bundle-queries";
import { expandBundleLines } from "@/lib/product-bundles";

type Tx = Prisma.TransactionClient | PrismaClient;

export type StockReservationLine = {
  productId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
};

export class StockReservationError extends Error {
  constructor(
    message: string,
    readonly productId: string
  ) {
    super(message);
    this.name = "StockReservationError";
  }
}

export async function reserveStockForOrder(
  tx: Tx,
  lines: StockReservationLine[],
  context: { orderId?: string | null; reason?: string | null } = {}
) {
  for (const line of mergeStockLines(lines)) {
    if (line.variantId) {
      const variantUpdated = await tx.productVariant.updateMany({
        where: { id: line.variantId, productId: line.productId, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });
      if (variantUpdated.count !== 1) {
        throw new StockReservationError(
          `"${line.name}" does not have enough variant stock. Please refresh your cart.`,
          line.productId
        );
      }
    }
    const updated = await tx.product.updateMany({
      where: {
        id: line.productId,
        type: "PHYSICAL",
        stock: { gte: line.quantity },
      },
      data: { stock: { decrement: line.quantity } },
    });
    if (updated.count !== 1) {
      throw new StockReservationError(
        `"${line.name}" does not have enough stock. Please refresh your cart.`,
        line.productId
      );
    }
    const product = await tx.product.findUnique({
      where: { id: line.productId },
      select: { workspaceId: true, stock: true },
    });
    if (product) {
      await recordInventoryMovement(tx, {
        workspaceId: product.workspaceId,
        productId: line.productId,
        orderId: context.orderId ?? null,
        type: "ORDER_RESERVATION",
        quantityChange: -line.quantity,
        stockBefore: product.stock + line.quantity,
        stockAfter: product.stock,
        reason: context.reason ?? `Reserved for ${line.name}`,
      });
    }
  }
}

export async function releaseOrderStockReservation(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      workspaceId: true,
      stockReservedAt: true,
      stockReleasedAt: true,
      items: {
        select: {
          productId: true,
          variantId: true,
          quantity: true,
          nameSnapshot: true,
          product: { select: { type: true } },
        },
      },
    },
  });
  if (!order?.stockReservedAt || order.stockReleasedAt) return false;

  const claimed = await tx.order.updateMany({
    where: {
      id: order.id,
      stockReservedAt: { not: null },
      stockReleasedAt: null,
    },
    data: { stockReleasedAt: new Date() },
  });
  if (claimed.count !== 1) return false;

  // A bundle reserved its contents, not itself, so it has to give those back —
  // releasing the bundle's own row would credit stock that was never taken.
  const bundleIds = order.items
    .filter((item) => item.product?.type === "BUNDLE" && item.productId)
    .map((item) => item.productId!);
  const bundles = await bundleContents(bundleIds, tx);

  const lines = expandBundleLines(
    order.items
      .filter(
        (item) =>
          item.productId &&
          (item.product?.type === "PHYSICAL" || item.product?.type === "BUNDLE") &&
          item.quantity > 0
      )
      .map((item) => ({
        productId: item.productId!,
        variantId: item.variantId,
        name: item.nameSnapshot,
        quantity: item.quantity,
      })),
    bundles
  );

  for (const line of mergeStockLines(lines)) {
    if (line.variantId) {
      await tx.productVariant.updateMany({
        where: { id: line.variantId, productId: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }
    await tx.product.updateMany({
      where: { id: line.productId, type: "PHYSICAL" },
      data: { stock: { increment: line.quantity } },
    });
    const product = await tx.product.findUnique({
      where: { id: line.productId },
      select: { stock: true },
    });
    if (product) {
      await recordInventoryMovement(tx, {
        workspaceId: order.workspaceId,
        productId: line.productId,
        orderId: order.id,
        type: "ORDER_RELEASE",
        quantityChange: line.quantity,
        stockBefore: product.stock - line.quantity,
        stockAfter: product.stock,
        reason: `Released reserved stock for ${line.name}`,
      });
    }
  }

  return true;
}

function mergeStockLines(lines: StockReservationLine[]) {
  const merged = new Map<string, StockReservationLine>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = `${line.productId}:${line.variantId ?? "base"}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }
  return Array.from(merged.values());
}
