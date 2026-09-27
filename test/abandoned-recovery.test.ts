import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  transaction: vi.fn(),
  txOrderFindUnique: vi.fn(),
  recoveryCreate: vi.fn(),
  recoveryUpdateMany: vi.fn(),
  followUpCreate: vi.fn(),
  storeNotificationCreate: vi.fn(),
  storeNotificationUpdate: vi.fn(),
}));

const sendEmail = vi.hoisted(() => vi.fn());
const queueWhatsAppInboxMessage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: db.orderFindMany,
    },
    $transaction: db.transaction,
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail,
}));

vi.mock("@/lib/ecommerce-integration", () => ({
  queueWhatsAppInboxMessage,
}));

import { sweepAbandonedCheckouts } from "@/lib/abandoned-recovery";

const now = new Date("2026-09-09T08:00:00Z");

describe("sweepAbandonedCheckouts", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
  });

  it("contacts due pending checkout and records notification attempts", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const order = orderFixture({
      createdAt: new Date("2026-09-09T07:00:00Z"),
      abandonedRecovery: null,
    });
    db.orderFindMany.mockResolvedValue([order]);
    db.transaction.mockImplementation(async (callback) => callback(makeTx(order)));
    db.recoveryCreate.mockResolvedValue({ id: "recovery_1" });
    db.followUpCreate.mockResolvedValue({ id: "task_1" });
    db.storeNotificationCreate.mockResolvedValue({ id: "notification_1" });
    db.storeNotificationUpdate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: true, provider: "console" });
    queueWhatsAppInboxMessage.mockResolvedValue({ id: "conversation_1" });

    const summary = await sweepAbandonedCheckouts({ now });

    expect(summary).toEqual({
      scanned: 1,
      opened: 1,
      contacted: 1,
      skipped: 0,
      failed: 0,
    });
    expect(db.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          createdAt: { lte: new Date("2026-09-09T07:30:00Z") },
        }),
      })
    );
    expect(db.recoveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        orderId: "order_1",
        status: "CONTACTED",
        attempts: 1,
        lastContactedAt: now,
      }),
    });
    expect(db.followUpCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Recover ORD-1",
        channel: "EMAIL",
        priority: "HIGH",
      }),
    });
    expect(db.storeNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "EMAIL",
        event: "ABANDONED_CHECKOUT_REMINDER",
        recipient: "buyer@example.com",
      }),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        text: expect.stringContaining(
          "https://app.example.com/payment/resume?ref=BD-1&access="
        ),
      })
    );
    expect(queueWhatsAppInboxMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactPhone: "+62812345678",
        body: expect.stringContaining("Lanjutkan: https://app.example.com/payment/resume"),
      })
    );
  });

  it("skips snoozed checkout until the snooze window passes", async () => {
    const order = orderFixture({
      createdAt: new Date("2026-09-09T06:00:00Z"),
      abandonedRecovery: {
        id: "recovery_1",
        status: "SNOOZED",
        attempts: 1,
        lastContactedAt: new Date("2026-09-09T06:30:00Z"),
        snoozedUntil: new Date("2026-09-10T08:00:00Z"),
        recoveredAt: null,
        ignoredAt: null,
        note: null,
        workspaceId: "workspace_1",
        orderId: "order_1",
        createdAt: new Date("2026-09-09T06:30:00Z"),
        updatedAt: new Date("2026-09-09T06:30:00Z"),
      },
    });
    db.orderFindMany.mockResolvedValue([order]);

    const summary = await sweepAbandonedCheckouts({ now });

    expect(summary).toEqual({
      scanned: 1,
      opened: 0,
      contacted: 0,
      skipped: 1,
      failed: 0,
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

function makeTx(order: ReturnType<typeof orderFixture>) {
  db.txOrderFindUnique.mockResolvedValue(order);
  return {
    order: {
      findUnique: db.txOrderFindUnique,
    },
    abandonedCheckoutRecovery: {
      create: db.recoveryCreate,
      updateMany: db.recoveryUpdateMany,
    },
    followUpTask: {
      create: db.followUpCreate,
    },
    storeNotification: {
      create: db.storeNotificationCreate,
      update: db.storeNotificationUpdate,
    },
  };
}

function orderFixture({
  createdAt,
  abandonedRecovery,
}: {
  createdAt: Date;
  abandonedRecovery: Record<string, unknown> | null;
}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    customerId: "customer_1",
    orderNumber: "ORD-1",
    status: "PENDING",
    total: 250_000,
    createdAt,
    abandonedRecovery,
    customer: {
      id: "customer_1",
      workspaceId: "workspace_1",
      name: "Buyer",
      email: "buyer@example.com",
      phone: "+62812345678",
      password: null,
      lastLoginAt: null,
      createdAt: new Date("2026-09-09T00:00:00Z"),
      updatedAt: new Date("2026-09-09T00:00:00Z"),
    },
    items: [
      {
        id: "item_1",
        orderId: "order_1",
        productId: "product_1",
        nameSnapshot: "T-Shirt",
        unitPrice: 125_000,
        quantity: 2,
      },
    ],
    payment: {
      id: "payment_1",
      workspaceId: "workspace_1",
      kind: "ORDER",
      status: "PENDING",
      provider: "midtrans",
      amount: 250_000,
      description: "Order ORD-1",
      midtransOrderId: "BD-1",
      snapToken: null,
      snapRedirectUrl: null,
      transactionId: null,
      transactionStatus: null,
      paymentType: null,
      fraudStatus: null,
      rawNotification: null,
      paidAt: null,
      expiresAt: new Date("2026-09-09T09:00:00Z"),
      orderId: "order_1",
      enrollmentId: null,
      customerMembershipId: null,
      createdAt: new Date("2026-09-09T07:00:00Z"),
      updatedAt: new Date("2026-09-09T07:00:00Z"),
    },
    workspace: {
      name: "Demo Store",
      slug: "demo",
      createdBy: { email: "seller@example.com" },
    },
  };
}
