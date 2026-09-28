import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  getConfig: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboxMessage: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/whatsapp/send", () => ({
  getWorkspaceWhatsAppConfig: mocks.getConfig,
  sendWhatsAppText: mocks.sendText,
}));

import {
  markInboxWhatsAppMessageFailed,
  sendQueuedInboxWhatsAppMessage,
} from "@/lib/whatsapp/inbox-send";

const queued = {
  id: "m1",
  workspaceId: "w1",
  status: "QUEUED",
  direction: "OUTBOUND",
  body: "Halo, pesanan Anda sudah dikirim.",
  conversation: { contactPhone: "+628123456789", channel: "WHATSAPP" },
};
const config = { provider: "FONNTE", apiKey: "k", phoneNumberId: "", apiBaseUrl: "", graphVersion: "v25.0" };

describe("sendQueuedInboxWhatsAppMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getConfig.mockResolvedValue(config);
  });

  it("sends a queued reply and marks it SENT with the provider id", async () => {
    mocks.findUnique.mockResolvedValue(queued);
    mocks.sendText.mockResolvedValue({ ok: true, providerMessageId: "wamid.1" });

    await expect(sendQueuedInboxWhatsAppMessage("m1")).resolves.toBe("sent via FONNTE");

    expect(mocks.sendText).toHaveBeenCalledWith(config, "+628123456789", queued.body);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: expect.objectContaining({
        status: "SENT",
        sentAt: expect.any(Date),
        providerMessageId: "wamid.1",
        errorMessage: null,
      }),
    });
  });

  it.each([
    ["SENT", "OUTBOUND", "already SENT"],
    ["FAILED", "OUTBOUND", "already FAILED"],
    ["RECEIVED", "INBOUND", "not an outbound message"],
  ])("never sends a %s %s message twice", async (status, direction, expected) => {
    mocks.findUnique.mockResolvedValue({ ...queued, status, direction });
    await expect(sendQueuedInboxWhatsAppMessage("m1")).resolves.toBe(expected);
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("ignores a message that no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(sendQueuedInboxWhatsAppMessage("gone")).resolves.toBe(
      "message no longer exists"
    );
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("fails without sending when WhatsApp was switched off after queueing", async () => {
    mocks.findUnique.mockResolvedValue(queued);
    mocks.getConfig.mockResolvedValue(null);

    await sendQueuedInboxWhatsAppMessage("m1");

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "FAILED", sentAt: null });
  });

  it("fails permanently on a configuration error instead of retrying", async () => {
    mocks.findUnique.mockResolvedValue(queued);
    mocks.sendText.mockResolvedValue({ ok: false, permanent: true, error: "Invalid token" });

    await expect(sendQueuedInboxWhatsAppMessage("m1")).resolves.toBe(
      "permanent failure: Invalid token"
    );
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      errorMessage: "Invalid token",
    });
  });

  it("keeps a transient failure QUEUED and throws so the runner retries", async () => {
    mocks.findUnique.mockResolvedValue(queued);
    mocks.sendText.mockResolvedValue({ ok: false, permanent: false, error: "HTTP 503" });

    await expect(sendQueuedInboxWhatsAppMessage("m1")).rejects.toThrow("HTTP 503");
    const data = mocks.update.mock.calls[0][0].data;
    expect(data).toEqual({ provider: "FONNTE", errorMessage: "HTTP 503" });
    expect(data).not.toHaveProperty("status");
  });
});

describe("markInboxWhatsAppMessageFailed", () => {
  it("only fails a message that is still queued", async () => {
    await markInboxWhatsAppMessageFailed("m1", "gave up");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: "QUEUED" },
      data: { status: "FAILED", sentAt: null, errorMessage: "gave up" },
    });
  });
});
