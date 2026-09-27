import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

const sendEmail = vi.hoisted(() => vi.fn());
const getWorkspaceTelegramConfig = vi.hoisted(() => vi.fn());
const sendTelegramMessage = vi.hoisted(() => vi.fn());
const sendWorkspaceWhatsAppText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeNotification: {
      findMany: db.findMany,
      updateMany: db.updateMany,
      update: db.update,
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail,
}));

vi.mock("@/lib/whatsapp/send", () => ({ sendWorkspaceWhatsAppText }));

vi.mock("@/lib/telegram", () => ({
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
}));

import { retryStoreNotifications } from "@/lib/store-notification-retry";

const now = new Date("2026-09-09T08:00:00Z");

describe("retryStoreNotifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retries failed email notifications and marks them sent", async () => {
    db.findMany.mockResolvedValue([
      notification({ id: "notif_1", channel: "EMAIL", attempts: 1 }),
    ]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.update.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: true, provider: "console" });

    const summary = await retryStoreNotifications({ now });

    expect(summary).toEqual({ scanned: 1, sent: 1, failed: 0, skipped: 0 });
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: { in: ["EMAIL", "TELEGRAM", "WHATSAPP"] },
          attempts: { lt: 5 },
        }),
        take: 50,
      })
    );
    expect(db.updateMany).toHaveBeenCalledWith({
      where: {
        id: "notif_1",
        status: "FAILED",
        attempts: 1,
        channel: { in: ["EMAIL", "TELEGRAM", "WHATSAPP"] },
      },
      data: {
        status: "QUEUED",
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
        errorMessage: null,
      },
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        to: "buyer@example.com",
        subject: "Checkout reminder",
        text: "Please complete your payment.",
      })
    );
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "notif_1" },
      data: {
        status: "SENT",
        sentAt: now,
        errorMessage: null,
        nextAttemptAt: null,
      },
    });
  });

  it("schedules the next retry when email delivery fails", async () => {
    db.findMany.mockResolvedValue([
      notification({ id: "notif_2", channel: "EMAIL", attempts: 2 }),
    ]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.update.mockResolvedValue({});
    sendEmail.mockResolvedValue({ ok: false, error: "SMTP timeout" });

    const summary = await retryStoreNotifications({ now });

    expect(summary).toEqual({ scanned: 1, sent: 0, failed: 1, skipped: 0 });
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "notif_2" },
      data: {
        status: "FAILED",
        errorMessage: "SMTP timeout",
        nextAttemptAt: new Date("2026-09-09T08:08:00Z"),
      },
    });
  });

  it("retries Telegram using the stored recipient with current credentials", async () => {
    db.findMany.mockResolvedValue([
      notification({
        id: "notif_3",
        channel: "TELEGRAM",
        recipient: "stored_chat",
      }),
    ]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.update.mockResolvedValue({});
    getWorkspaceTelegramConfig.mockResolvedValue({
      botToken: "token",
      chatId: "current_chat",
      messageThreadId: null,
    });
    sendTelegramMessage.mockResolvedValue({ ok: true, provider: "telegram" });

    const summary = await retryStoreNotifications({ now });

    expect(summary.sent).toBe(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      { botToken: "token", chatId: "stored_chat", messageThreadId: null },
      "Please complete your payment."
    );
  });

  it("skips a notification if another worker already claimed it", async () => {
    db.findMany.mockResolvedValue([
      notification({ id: "notif_4", channel: "EMAIL", attempts: 1 }),
    ]);
    db.updateMany.mockResolvedValue({ count: 0 });

    const summary = await retryStoreNotifications({ now });

    expect(summary).toEqual({ scanned: 1, sent: 0, failed: 0, skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

function notification({
  id,
  channel,
  attempts = 0,
  recipient = "buyer@example.com",
}: {
  id: string;
  channel: "EMAIL" | "TELEGRAM" | "WHATSAPP";
  attempts?: number;
  recipient?: string;
}) {
  return {
    id,
    workspaceId: "workspace_1",
    channel,
    event: "ABANDONED_CHECKOUT_REMINDER",
    status: "FAILED",
    recipient,
    subject: "Checkout reminder",
    body: "Please complete your payment.",
    attempts,
    createdAt: new Date("2026-09-09T07:00:00Z"),
  };
}

/**
 * WhatsApp notifications used to be queued and then never delivered: the
 * store queued them with channel WHATSAPP, but the retry sweep only knew how
 * to send EMAIL and TELEGRAM, so those rows sat QUEUED forever.
 */
describe("whatsapp delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.updateMany.mockResolvedValue({ count: 1 });
    db.update.mockResolvedValue({});
  });

  it("sends a queued WhatsApp notification through the workspace config", async () => {
    db.findMany.mockResolvedValue([
      notification({ id: "notif_wa", channel: "WHATSAPP", attempts: 0 }),
    ]);
    sendWorkspaceWhatsAppText.mockResolvedValue({
      ok: true,
      providerMessageId: "wamid.1",
    });

    const summary = await retryStoreNotifications({ now });

    expect(summary.sent).toBe(1);
    expect(sendWorkspaceWhatsAppText).toHaveBeenCalledWith(
      "workspace_1",
      expect.any(String),
      expect.any(String)
    );
  });

  it("records a provider rejection as a failed attempt", async () => {
    db.findMany.mockResolvedValue([
      notification({ id: "notif_wa", channel: "WHATSAPP", attempts: 0 }),
    ]);
    sendWorkspaceWhatsAppText.mockResolvedValue({
      ok: false,
      permanent: true,
      error: "API key WhatsApp belum diisi di Settings > Integrasi.",
    });

    const summary = await retryStoreNotifications({ now });

    expect(summary.failed).toBe(1);
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "API key WhatsApp belum diisi di Settings > Integrasi.",
        }),
      })
    );
  });
});
