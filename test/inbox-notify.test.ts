import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  sendTelegram: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboxConversation: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

vi.mock("@/lib/telegram", () => ({
  sendWorkspaceTelegramMessage: mocks.sendTelegram,
}));

import { NOTIFY_THROTTLE_MINUTES, notifyInboxConversation } from "@/lib/inbox-notify";

const NOW = new Date("2026-09-13T10:00:00Z");

const conversation = {
  id: "c1",
  workspaceId: "w1",
  contactName: "Budi Santoso",
  contactPhone: "6281234567890",
  lastMessagePreview: "Pesanan saya bagaimana?",
  unreadCount: 2,
  notifiedAt: null as Date | null,
  assignedTo: null as { name: string | null; email: string } | null,
  workspace: { name: "Toko Contoh" },
};

describe("notifyInboxConversation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sendTelegram.mockResolvedValue({ ok: true });
  });

  it("tells the team who wrote, with a link straight to the thread", async () => {
    mocks.findUnique.mockResolvedValue({ ...conversation });

    const result = await notifyInboxConversation("c1", { now: NOW });

    expect(result).toContain("telegram");
    const [workspaceId, text] = mocks.sendTelegram.mock.calls[0];
    expect(workspaceId).toBe("w1");
    expect(text).toContain("Budi Santoso");
    expect(text).toContain("6281234567890");
    expect(text).toContain("Pesanan saya bagaimana?");
    expect(text).toContain("/dashboard/inbox?c=c1");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notifiedAt: NOW } })
    );
  });

  it("says nothing when an operator has already read the thread", async () => {
    mocks.findUnique.mockResolvedValue({ ...conversation, unreadCount: 0 });

    expect(await notifyInboxConversation("c1", { now: NOW })).toBe("already read");
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
  });

  it("does not alert twice for a customer typing in bursts", async () => {
    mocks.findUnique.mockResolvedValue({
      ...conversation,
      notifiedAt: new Date(NOW.getTime() - (NOTIFY_THROTTLE_MINUTES - 1) * 60_000),
    });

    expect(await notifyInboxConversation("c1", { now: NOW })).toBe("throttled");
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
  });

  it("alerts again once the throttle window has passed", async () => {
    mocks.findUnique.mockResolvedValue({
      ...conversation,
      notifiedAt: new Date(NOW.getTime() - (NOTIFY_THROTTLE_MINUTES + 1) * 60_000),
    });

    expect(await notifyInboxConversation("c1", { now: NOW })).toContain("telegram");
    expect(mocks.sendTelegram).toHaveBeenCalledOnce();
  });

  it("leaves notifiedAt alone when Telegram is off, so the alert is not lost", async () => {
    mocks.findUnique.mockResolvedValue({ ...conversation });
    mocks.sendTelegram.mockResolvedValue({
      ok: false,
      error: "Telegram notifications disabled.",
    });

    const result = await notifyInboxConversation("c1", { now: NOW });

    expect(result).toContain("not sent");
    // Otherwise turning Telegram on later would skip the waiting conversation.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("names the assignee when one is set", async () => {
    mocks.findUnique.mockResolvedValue({
      ...conversation,
      assignedTo: { name: "Dewi", email: "dewi@toko.test" },
    });

    await notifyInboxConversation("c1", { now: NOW });
    expect(mocks.sendTelegram.mock.calls[0][1]).toContain("Dewi");
  });

  it("shrugs off a conversation that was deleted before the job ran", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await notifyInboxConversation("gone", { now: NOW })).toContain(
      "no longer exists"
    );
  });
});
