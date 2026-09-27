import { createHash } from "node:crypto";

import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
  tokenDeleteMany: vi.fn(),
  tokenCreate: vi.fn(),
  tokenFindFirst: vi.fn(),
  transaction: vi.fn(),
}));
const sendAppEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: db.userFindUnique, updateMany: db.userUpdateMany },
    verificationToken: {
      deleteMany: db.tokenDeleteMany,
      create: db.tokenCreate,
      findFirst: db.tokenFindFirst,
    },
    $transaction: db.transaction,
  },
}));
vi.mock("@/lib/app-email", () => ({ sendAppEmail }));
vi.mock("@/lib/app-email-templates", () => ({
  passwordResetEmail: (input: { resetUrl: string }) => ({
    subject: "Reset password",
    text: input.resetUrl,
    html: input.resetUrl,
  }),
}));

import { requestPasswordReset, resetPassword } from "@/lib/password-reset";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userFindUnique.mockResolvedValue({ name: "Budi", email: "budi@contoh.id" });
    db.tokenDeleteMany.mockResolvedValue({ count: 0 });
    db.tokenCreate.mockResolvedValue({});
    sendAppEmail.mockResolvedValue({ ok: true });
  });

  it("stores only a hash of the token, never the token itself", async () => {
    await requestPasswordReset("Budi@Contoh.id");

    const stored = db.tokenCreate.mock.calls[0][0].data.token as string;
    const emailed = sendAppEmail.mock.calls[0][0].text as string;
    const rawToken = new URL(emailed).searchParams.get("token")!;

    expect(stored).toBe(`password-reset:${sha256(rawToken)}`);
    expect(stored).not.toContain(rawToken);
  });

  it("invalidates earlier links before issuing a new one", async () => {
    await requestPasswordReset("budi@contoh.id");

    expect(db.tokenDeleteMany).toHaveBeenCalledWith({
      where: { identifier: "password-reset:budi@contoh.id" },
    });
    expect(db.tokenDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.tokenCreate.mock.invocationCallOrder[0]
    );
  });

  it("normalizes the email so casing cannot create a second token", async () => {
    await requestPasswordReset("  BUDI@contoh.ID ");
    expect(db.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "budi@contoh.id" } })
    );
  });

  it("does nothing observable for an unknown email", async () => {
    db.userFindUnique.mockResolvedValue(null);

    await expect(requestPasswordReset("nobody@contoh.id")).resolves.toBeUndefined();
    // No token, no email: the caller cannot learn whether the account exists.
    expect(db.tokenCreate).not.toHaveBeenCalled();
    expect(sendAppEmail).not.toHaveBeenCalled();
  });

  it("issues a token that expires within the hour", async () => {
    const before = Date.now();
    await requestPasswordReset("budi@contoh.id");
    const expires = db.tokenCreate.mock.calls[0][0].data.expires as Date;

    expect(expires.getTime()).toBeGreaterThan(before);
    expect(expires.getTime()).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 1000);
  });
});

describe("resetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tokenFindFirst.mockResolvedValue({
      identifier: "password-reset:budi@contoh.id",
      token: "stored",
      expires: new Date(Date.now() + 30 * 60 * 1000),
    });
    db.tokenDeleteMany.mockResolvedValue({ count: 1 });
    db.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    db.userUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("looks the token up by its hash", async () => {
    await resetPassword({ email: "budi@contoh.id", token: "raw-token", password: "NewPass123!" });

    expect(db.tokenFindFirst).toHaveBeenCalledWith({
      where: {
        identifier: "password-reset:budi@contoh.id",
        token: `password-reset:${sha256("raw-token")}`,
      },
    });
  });

  it("stores a bcrypt hash of the new password", async () => {
    await resetPassword({ email: "budi@contoh.id", token: "raw-token", password: "NewPass123!" });

    const hashed = db.userUpdateMany.mock.calls[0][0].data.password as string;
    expect(hashed).not.toBe("NewPass123!");
    expect(await bcrypt.compare("NewPass123!", hashed)).toBe(true);
  });

  it("consumes the token so the link cannot be reused", async () => {
    await resetPassword({ email: "budi@contoh.id", token: "raw-token", password: "NewPass123!" });
    expect(db.tokenDeleteMany).toHaveBeenCalledWith({
      where: { identifier: "password-reset:budi@contoh.id" },
    });
  });

  it("rejects an unknown or already-used token", async () => {
    db.tokenFindFirst.mockResolvedValue(null);

    const result = await resetPassword({ email: "budi@contoh.id", token: "raw", password: "x" });

    expect(result).toEqual({ ok: false, error: "Link reset tidak valid atau sudah dipakai." });
    expect(db.userUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an expired token and cleans it up", async () => {
    db.tokenFindFirst.mockResolvedValue({
      identifier: "password-reset:budi@contoh.id",
      token: "stored",
      expires: new Date(Date.now() - 1000),
    });

    const result = await resetPassword({ email: "budi@contoh.id", token: "raw", password: "x" });

    expect(result.ok).toBe(false);
    expect(db.userUpdateMany).not.toHaveBeenCalled();
    expect(db.tokenDeleteMany).toHaveBeenCalled();
  });

  it("rejects a blank token without touching the database", async () => {
    const result = await resetPassword({ email: "budi@contoh.id", token: "   ", password: "x" });

    expect(result).toEqual({ ok: false, error: "Link reset tidak valid." });
    expect(db.tokenFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the token to the email it was issued for", async () => {
    // A valid token for one account must not reset another account.
    await resetPassword({ email: "victim@contoh.id", token: "raw-token", password: "x" });

    expect(db.tokenFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ identifier: "password-reset:victim@contoh.id" }),
    });
  });
});
