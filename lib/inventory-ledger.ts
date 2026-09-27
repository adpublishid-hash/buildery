import "server-only";

import type {
  InventoryMovementType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type RecordInventoryMovementInput = {
  workspaceId: string;
  productId: string;
  orderId?: string | null;
  actorId?: string | null;
  type: InventoryMovementType;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordInventoryMovement(
  tx: Tx,
  input: RecordInventoryMovementInput
) {
  if (input.quantityChange === 0) return null;

  return tx.inventoryMovement.create({
    data: {
      workspaceId: input.workspaceId,
      productId: input.productId,
      orderId: input.orderId ?? null,
      actorId: input.actorId ?? null,
      type: input.type,
      quantityChange: input.quantityChange,
      stockBefore: input.stockBefore,
      stockAfter: input.stockAfter,
      reason: input.reason?.trim() || null,
      metadata: input.metadata ?? {},
    },
  });
}

export function inventoryMovementLabel(type: InventoryMovementType) {
  if (type === "ORDER_RESERVATION") return "Reserved at checkout";
  if (type === "ORDER_RELEASE") return "Released to stock";
  if (type === "ORDER_FULFILLMENT") return "Sold after payment";
  if (type === "ORDER_RETURN") return "Returned to stock";
  if (type === "ORDER_CANCELLATION") return "Cancelled order stock";
  return "Manual adjustment";
}
