import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  fulfillmentEventCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
  },
}));

import { updateOrderFulfillment } from "@/lib/order-fulfillment";

const now = new Date("2026-09-09T08:00:00Z");

describe("updateOrderFulfillment", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks a paid physical order as shipped and moves it to processing", async () => {
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.orderFindUnique.mockResolvedValue(order({ status: "PAID" }));
    db.orderUpdate.mockResolvedValue({});
    db.fulfillmentEventCreate.mockResolvedValue({ id: "event_1" });

    const result = await updateOrderFulfillment("order_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      status: "SHIPPED",
      trackingCarrier: "JNE",
      trackingNumber: "JNE123",
      trackingUrl: "https://tracking.example.com/JNE123",
      note: "Handed to courier",
      now,
    });

    expect(result).toEqual({ ok: true, orderId: "order_1", status: "SHIPPED" });
    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: expect.objectContaining({
        status: "PROCESSING",
        fulfillmentStatus: "SHIPPED",
        fulfillmentTrackingCarrier: "JNE",
        fulfillmentTrackingNumber: "JNE123",
        fulfillmentTrackingUrl: "https://tracking.example.com/JNE123",
        fulfillmentNote: "Handed to courier",
        packedAt: now,
        shippedAt: now,
      }),
    });
    expect(db.fulfillmentEventCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        orderId: "order_1",
        actorId: "user_1",
        status: "SHIPPED",
        trackingCarrier: "JNE",
        trackingNumber: "JNE123",
        trackingUrl: "https://tracking.example.com/JNE123",
        note: "Handed to courier",
      },
    });
  });

  it("marks a delivered paid order as completed", async () => {
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.orderFindUnique.mockResolvedValue(order({ status: "PROCESSING" }));
    db.orderUpdate.mockResolvedValue({});
    db.fulfillmentEventCreate.mockResolvedValue({ id: "event_1" });

    await updateOrderFulfillment("order_1", {
      workspaceId: "workspace_1",
      status: "DELIVERED",
      now,
    });

    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        fulfillmentStatus: "DELIVERED",
        packedAt: now,
        shippedAt: now,
        deliveredAt: now,
      }),
    });
  });

  it("rejects invalid tracking URLs before opening a transaction", async () => {
    const result = await updateOrderFulfillment("order_1", {
      workspaceId: "workspace_1",
      status: "SHIPPED",
      trackingUrl: "resi.example.com/JNE123",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: "Tracking URL must start with http:// or https://.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

function makeTx() {
  return {
    order: {
      findUnique: db.orderFindUnique,
      update: db.orderUpdate,
    },
    fulfillmentEvent: {
      create: db.fulfillmentEventCreate,
    },
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    status: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    packedAt: null,
    shippedAt: null,
    deliveredAt: null,
    shippingAddress: null,
    payment: { status: "PAID" },
    items: [{ product: { type: "PHYSICAL" } }],
    ...overrides,
  };
}
