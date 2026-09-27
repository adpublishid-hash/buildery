import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendAppEmail, deleteMany, create } = vi.hoisted(() => ({
  sendAppEmail: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/app-email", () => ({ sendAppEmail }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationToken: { deleteMany, create },
  },
}));

import { issueVerificationCode } from "@/lib/verification";

describe("issueVerificationCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMany.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({});
  });

  it("persists a code and resolves after the email provider accepts it", async () => {
    sendAppEmail.mockResolvedValue({ ok: true, provider: "app-smtp" });

    const code = await issueVerificationCode("User@Example.com");

    expect(code).toMatch(/^\d{6}$/);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { identifier: "user@example.com" },
    });
    expect(sendAppEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com" })
    );
  });

  it("rejects when the email provider fails", async () => {
    sendAppEmail.mockResolvedValue({
      ok: false,
      error: "SMTP response timed out.",
    });

    await expect(issueVerificationCode("user@example.com")).rejects.toThrow(
      "Verification email could not be sent"
    );
  });
});
