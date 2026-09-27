import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Where a product's stock physically sits.
 *
 * This is a record, not an allocation: what may be sold is still the product's
 * own number. Splitting the sellable count across warehouses would force every
 * reservation, fulfilment and refund to pick a location, and two numbers that
 * can disagree are worse than one that cannot.
 *
 * So the interesting quantity is the difference — how much of the product has
 * not been placed anywhere yet, which is usually a counting mistake.
 */

export type LocationStockRow = {
  locationId: string;
  locationName: string;
  variantId: string | null;
  quantity: number;
};

export type ProductStockPlacement = {
  rows: LocationStockRow[];
  placed: number;
  /** Product stock minus what has been placed; negative means over-placed. */
  unplaced: number;
};

export async function productStockPlacement(input: {
  workspaceId: string;
  productId: string;
}): Promise<ProductStockPlacement> {
  const [product, rows] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, workspaceId: input.workspaceId },
      select: { stock: true },
    }),
    prisma.locationStock.findMany({
      where: { workspaceId: input.workspaceId, productId: input.productId },
      select: {
        locationId: true,
        variantId: true,
        quantity: true,
        location: { select: { name: true } },
      },
      orderBy: { location: { name: "asc" } },
    }),
  ]);

  const placed = rows.reduce((sum, row) => sum + row.quantity, 0);
  return {
    rows: rows.map((row) => ({
      locationId: row.locationId,
      locationName: row.location.name,
      variantId: row.variantId,
      quantity: row.quantity,
    })),
    placed,
    unplaced: (product?.stock ?? 0) - placed,
  };
}

export type PlacementResult =
  | { ok: true; placed: number }
  | { ok: false; error: string };

/** Sets how much of a product sits at one location. */
export async function setLocationStock(input: {
  workspaceId: string;
  locationId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
}): Promise<PlacementResult> {
  const quantity = Math.floor(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
    return { ok: false, error: "Jumlah tidak valid." };
  }

  const [location, product] = await Promise.all([
    prisma.pickupLocation.findFirst({
      where: { id: input.locationId, workspaceId: input.workspaceId },
      select: { id: true },
    }),
    prisma.product.findFirst({
      where: { id: input.productId, workspaceId: input.workspaceId },
      select: { id: true },
    }),
  ]);
  if (!location) return { ok: false, error: "Lokasi tidak ditemukan." };
  if (!product) return { ok: false, error: "Produk tidak ditemukan." };

  const variantId = input.variantId ?? null;
  if (variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId: input.productId },
      select: { id: true },
    });
    if (!variant) return { ok: false, error: "Varian tidak ditemukan." };
  }

  if (quantity === 0) {
    // Zero is the absence of a row, not a row saying nothing is there.
    await prisma.locationStock.deleteMany({
      where: { locationId: location.id, productId: product.id, variantId },
    });
  } else {
    // Prisma's compound-unique input will not take a null member, so the row
    // is found first rather than upserted.
    const existing = await prisma.locationStock.findFirst({
      where: { locationId: location.id, productId: product.id, variantId },
      select: { id: true },
    });
    if (existing) {
      await prisma.locationStock.update({
        where: { id: existing.id },
        data: { quantity },
      });
    } else {
      await prisma.locationStock.create({
        data: {
          workspaceId: input.workspaceId,
          locationId: location.id,
          productId: product.id,
          variantId,
          quantity,
        },
      });
    }
  }

  const placement = await productStockPlacement({
    workspaceId: input.workspaceId,
    productId: product.id,
  });
  return { ok: true, placed: placement.placed };
}

/** Moves stock between two locations, leaving the total untouched. */
export async function transferLocationStock(input: {
  workspaceId: string;
  fromLocationId: string;
  toLocationId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
}): Promise<PlacementResult> {
  const quantity = Math.floor(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Jumlah pindah harus lebih dari nol." };
  }
  if (input.fromLocationId === input.toLocationId) {
    return { ok: false, error: "Pilih dua lokasi yang berbeda." };
  }

  const variantId = input.variantId ?? null;
  const source = await prisma.locationStock.findFirst({
    where: {
      workspaceId: input.workspaceId,
      locationId: input.fromLocationId,
      productId: input.productId,
      variantId,
    },
    select: { id: true, quantity: true },
  });
  if (!source || source.quantity < quantity) {
    return { ok: false, error: "Stok di lokasi asal tidak cukup." };
  }

  const destination = await prisma.pickupLocation.findFirst({
    where: { id: input.toLocationId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!destination) return { ok: false, error: "Lokasi tujuan tidak ditemukan." };

  await prisma.$transaction(async (tx) => {
    const remaining = source.quantity - quantity;
    if (remaining === 0) {
      await tx.locationStock.delete({ where: { id: source.id } });
    } else {
      await tx.locationStock.update({
        where: { id: source.id },
        data: { quantity: remaining },
      });
    }
    const target = await tx.locationStock.findFirst({
      where: {
        locationId: destination.id,
        productId: input.productId,
        variantId,
      },
      select: { id: true },
    });
    if (target) {
      await tx.locationStock.update({
        where: { id: target.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await tx.locationStock.create({
        data: {
          workspaceId: input.workspaceId,
          locationId: destination.id,
          productId: input.productId,
          variantId,
          quantity,
        },
      });
    }
  });

  const placement = await productStockPlacement({
    workspaceId: input.workspaceId,
    productId: input.productId,
  });
  return { ok: true, placed: placement.placed };
}
