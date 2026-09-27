import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  productFindMany: vi.fn(),
  productUpdateMany: vi.fn(),
  productUpdate: vi.fn(),
  storeNotificationCreate: vi.fn(),
  storeNotificationUpdate: vi.fn(),
}));

const sendEmail = vi.hoisted(() => vi.fn());
const getWorkspaceTelegramConfig = vi.hoisted(() => vi.fn());
const sendTelegramMessage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    product: {
      findMany: db.productFindMany,
      updateMany: db.productUpdateMany,
      update: db.productUpdate,
    },
    storeNotification: {
      create: db.storeNotificationCreate,
      update: db.storeNotificationUpdate,
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail,
}));

vi.mock("@/lib/telegram", () => ({
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
}));

import { sweepLowStockAlerts } from "@/lib/low-stock-alerts";

const now = new Date("2026-09-09T08:00:00Z");

describe("sweepLowStockAlerts", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
  });

  it("alerts low-stock physical products over email and Telegram", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([product()]);
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.storeNotificationCreate
      .mockResolvedValueOnce({ id: "email_notification" })
      .mockResolvedValueOnce({ id: "telegram_notification" });
    db.storeNotificationUpdate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: true, provider: "console" });
    getWorkspaceTelegramConfig.mockResolvedValue({
      botToken: "token",
      chatId: "seller_chat",
      messageThreadId: null,
    });
    sendTelegramMessage.mockResolvedValue({ ok: true, provider: "telegram" });

    const summary = await sweepLowStockAlerts({ now });

    expect(summary).toEqual({
      scanned: 1,
      lowStock: 1,
      alerted: 1,
      resolved: 0,
      failed: 0,
      skipped: 0,
    });
    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "product_1",
        OR: [
          { lowStockAlertedAt: null },
          { lowStockAlertedAt: { lte: new Date("2026-09-08T08:00:00Z") } },
        ],
      },
      data: { lowStockAlertedAt: now, lowStockResolvedAt: null },
    });
    expect(db.storeNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        channel: "EMAIL",
        event: "LOW_STOCK_ALERT",
        recipient: "seller@example.com",
      }),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "seller@example.com",
        subject: "Stok menipis · Buildery Shirt",
        text: expect.stringContaining("Stok saat ini: 3"),
      })
    );
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "seller_chat" }),
      expect.stringContaining("Stok menipis · Buildery Shirt")
    );
  });

  it("skips duplicate alerts inside the cooldown window", async () => {
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([
      product({ lowStockAlertedAt: new Date("2026-09-09T07:30:00Z") }),
    ]);

    const summary = await sweepLowStockAlerts({ now });

    expect(summary).toEqual({
      scanned: 1,
      lowStock: 1,
      alerted: 0,
      resolved: 0,
      failed: 0,
      skipped: 1,
    });
    expect(db.productUpdateMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("clears alert state when stock recovers above the threshold", async () => {
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([
      product({
        stock: 12,
        lowStockAlertedAt: new Date("2026-09-08T07:00:00Z"),
      }),
    ]);
    db.productUpdateMany.mockResolvedValue({ count: 1 });

    const summary = await sweepLowStockAlerts({ now });

    expect(summary).toEqual({
      scanned: 1,
      lowStock: 0,
      alerted: 0,
      resolved: 1,
      failed: 0,
      skipped: 0,
    });
    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product_1", lowStockAlertedAt: { not: null } },
      data: { lowStockAlertedAt: null, lowStockResolvedAt: now },
    });
  });

  it("records failed delivery with retry metadata", async () => {
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([product()]);
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.storeNotificationCreate.mockResolvedValue({ id: "notification_1" });
    db.storeNotificationUpdate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: false, error: "SMTP timeout" });
    getWorkspaceTelegramConfig.mockResolvedValue(null);

    const summary = await sweepLowStockAlerts({ now });

    expect(summary).toEqual({
      scanned: 1,
      lowStock: 1,
      alerted: 1,
      resolved: 0,
      failed: 1,
      skipped: 0,
    });
    expect(db.storeNotificationUpdate).toHaveBeenCalledWith({
      where: { id: "notification_1" },
      data: {
        status: "FAILED",
        sentAt: null,
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: new Date("2026-09-09T08:02:00Z"),
        errorMessage: "SMTP timeout",
      },
    });
  });
});

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "product_1",
    workspaceId: "workspace_1",
    name: "Buildery Shirt",
    sku: "SHIRT-1",
    stock: 3,
    lowStockThreshold: null,
    lowStockAlertedAt: null,
    variants: [],
    workspace: {
      name: "Buildery Store",
      slug: "buildery",
      createdBy: {
        email: "seller@example.com",
        name: "Seller",
      },
      ecommerceSetting: {
        lowStockThreshold: 5,
      },
    },
    ...overrides,
  };
}

/**
 * A product's own stock is the sum of its variants, so a healthy total can hide
 * a size that has run out. The alert has to name which one.
 */
describe("sweepLowStockAlerts with variants", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("alerts when one variant is empty even though the total looks fine", async () => {
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([
      product({
        stock: 20,
        variants: [
          { id: "v1", name: "Hitam / S", stock: 12 },
          { id: "v2", name: "Hitam / M", stock: 0 },
          { id: "v3", name: "Hitam / L", stock: 8 },
        ],
      }),
    ]);
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.storeNotificationCreate.mockResolvedValue({ id: "email_notification" });
    db.storeNotificationUpdate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: true, provider: "console" });
    getWorkspaceTelegramConfig.mockResolvedValue(null);

    const summary = await sweepLowStockAlerts({ now });

    expect(summary.lowStock).toBe(1);
    expect(summary.alerted).toBe(1);
    const body = sendEmail.mock.calls[0][0].text as string;
    // Which variant ran out is the only actionable part of the alert.
    expect(body).toContain("Hitam / M (0)");
    expect(body).not.toContain("Hitam / L");
  });

  it("leaves a product alone when the total and every variant are healthy", async () => {
    db.queryRaw.mockResolvedValue([{ id: "product_1" }]);
    db.productFindMany.mockResolvedValue([
      product({
        stock: 20,
        lowStockAlertedAt: new Date("2026-09-01T00:00:00Z"),
        variants: [
          { id: "v1", name: "Hitam / S", stock: 12 },
          { id: "v2", name: "Hitam / M", stock: 8 },
        ],
      }),
    ]);
    db.productUpdateMany.mockResolvedValue({ count: 1 });

    const summary = await sweepLowStockAlerts({ now });

    expect(summary.lowStock).toBe(0);
    expect(summary.resolved).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
