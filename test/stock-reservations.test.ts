import { afterEach, describe, expect, it, vi } from "vitest";

import {
  releaseOrderStockReservation,
  reserveStockForOrder,
  StockReservationError,
} from "@/lib/stock-reservations";

describe("stock reservations", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reserves merged physical stock atomically", async () => {
    const tx = makeTx();
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.product.findUnique.mockResolvedValue({ workspaceId: "workspace_1", stock: 7 });

    await reserveStockForOrder(tx as never, [
      { productId: "product_1", name: "T-Shirt", quantity: 1 },
      { productId: "product_1", name: "T-Shirt", quantity: 2 },
    ], { orderId: "order_1" });

    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "product_1",
        type: "PHYSICAL",
        stock: { gte: 3 },
      },
      data: { stock: { decrement: 3 } },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: null,
        type: "ORDER_RESERVATION",
        quantityChange: -3,
        stockBefore: 10,
        stockAfter: 7,
        reason: "Reserved for T-Shirt",
        metadata: {},
      },
    });
  });

  it("throws a typed error when stock is no longer available", async () => {
    const tx = makeTx();
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reserveStockForOrder(tx as never, [
        { productId: "product_1", name: "T-Shirt", quantity: 2 },
      ])
    ).rejects.toBeInstanceOf(StockReservationError);
  });

  it("releases a reservation only once", async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      workspaceId: "workspace_1",
      stockReservedAt: new Date("2026-09-09T00:00:00Z"),
      stockReleasedAt: null,
      items: [
        {
          productId: "product_1",
          nameSnapshot: "T-Shirt",
          quantity: 1,
          product: { type: "PHYSICAL" },
        },
        {
          productId: "product_1",
          nameSnapshot: "T-Shirt",
          quantity: 2,
          product: { type: "PHYSICAL" },
        },
        {
          productId: "digital_1",
          nameSnapshot: "Ebook",
          quantity: 1,
          product: { type: "DIGITAL" },
        },
      ],
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.product.findUnique.mockResolvedValue({ stock: 13 });

    await expect(
      releaseOrderStockReservation(tx as never, "order_1")
    ).resolves.toBe(true);

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order_1",
        stockReservedAt: { not: null },
        stockReleasedAt: null,
      },
      data: { stockReleasedAt: expect.any(Date) },
    });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "product_1", type: "PHYSICAL" },
      data: { stock: { increment: 3 } },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: null,
        type: "ORDER_RELEASE",
        quantityChange: 3,
        stockBefore: 10,
        stockAfter: 13,
        reason: "Released reserved stock for T-Shirt",
        metadata: {},
      },
    });
  });

  it("does not release stock twice", async () => {
    const tx = makeTx();
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      workspaceId: "workspace_1",
      stockReservedAt: new Date("2026-09-09T00:00:00Z"),
      stockReleasedAt: new Date("2026-09-09T00:10:00Z"),
      items: [],
    });

    await expect(
      releaseOrderStockReservation(tx as never, "order_1")
    ).resolves.toBe(false);

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

function makeTx() {
  return {
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    product: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
  } as never as {
    order: {
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    product: {
      updateMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    inventoryMovement: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}
