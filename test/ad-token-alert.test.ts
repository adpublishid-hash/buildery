import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  workspace: vi.fn(),
  email: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metaCapiDailyStat: { updateMany: mocks.claim },
    workspace: { findUnique: mocks.workspace },
  },
}));
vi.mock("@/lib/app-email", () => ({ sendAppEmail: mocks.email }));
vi.mock("@/lib/telegram", () => ({ sendWorkspaceTelegramMessage: mocks.telegram }));

import { alertAdTokenRejected } from "@/lib/ad-token-alert";

const input = {
  workspaceId: "ws_1",
  provider: "TIKTOK" as const,
  day: new Date("2026-09-13T00:00:00Z"),
  error: "HTTP 401 code 40105: Access token is incorrect",
};

describe("ad token alert", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.workspace.mockResolvedValue({
      name: "Toko",
      createdBy: { email: "Owner@Toko.id" },
      members: [{ user: { email: "owner@toko.id" } }, { user: { email: "admin@toko.id" } }],
    });
    mocks.email.mockResolvedValue({ ok: true, provider: "console" });
    mocks.telegram.mockResolvedValue({ ok: false, error: "disabled" });
  });

  it("tells each owner and admin once, with the platform's message", async () => {
    mocks.claim.mockResolvedValue({ count: 1 });

    const result = await alertAdTokenRejected(input);

    expect(mocks.claim).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", provider: "TIKTOK", day: input.day, alertedAt: null },
      data: { alertedAt: expect.any(Date) },
    });
    expect(mocks.email.mock.calls.map(([message]) => message.to).sort()).toEqual([
      "admin@toko.id",
      "owner@toko.id",
    ]);
    expect(mocks.email.mock.calls[0][0]).toMatchObject({
      subject: "Token TikTok Events API ditolak · Toko",
      text: expect.stringContaining("40105"),
    });
    expect(result).toMatchObject({ sent: true, recipients: 2 });
  });

  it("stays quiet when today's alert was already sent", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });

    await expect(alertAdTokenRejected(input)).resolves.toEqual({
      sent: false,
      reason: "already_alerted",
    });
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
  });
});
