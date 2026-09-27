import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaceFindUnique: vi.fn(),
  orderFindUnique: vi.fn(),
  orderRefundFindMany: vi.fn(),
}));
const createOrderRefund = vi.hoisted(() => vi.fn());
const rateLimitByIp = vi.hoisted(() => vi.fn());
const verifyPublicAccessToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findUnique: db.workspaceFindUnique },
    order: { findUnique: db.orderFindUnique },
    orderRefund: { findMany: db.orderRefundFindMany },
  },
}));

vi.mock("@/lib/order-refunds", () => ({ createOrderRefund }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByIp }));
vi.mock("@/lib/public-access-token", () => ({ verifyPublicAccessToken }));

import {
  MAX_RETURN_NOTE_LENGTH,
  MAX_RETURN_REASON_LENGTH,
  submitPublicReturnRequest,
} from "@/lib/public-return-requests";

const ALLOWED = { ok: true, retryAfter: 0, remaining: 4 };

function input(overrides: Partial<Parameters<typeof submitPublicReturnRequest>[0]> = {}) {
  return {
    workspaceSlug: "toko",
    orderNumber: "ORD-1",
    accessToken: "valid-token",
    amount: 50_000,
    reason: "Barang rusak saat diterima.",
    note: null,
    items: [{ orderItemId: "item_1", quantity: 1, restockQuantity: 1 }],
    ...overrides,
  };
}

describe("submitPublicReturnRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitByIp.mockResolvedValue(ALLOWED);
    verifyPublicAccessToken.mockReturnValue(true);
    db.workspaceFindUnique.mockResolvedValue({ id: "ws_1", slug: "toko" });
    db.orderFindUnique.mockResolvedValue({ id: "order_1", status: "PAID" });
    db.orderRefundFindMany.mockResolvedValue([]);
    createOrderRefund.mockResolvedValue({ ok: true, refundId: "refund_1", status: "REQUESTED" });
  });

  it("creates a RETURN request when the access token is valid", async () => {
    const result = await submitPublicReturnRequest(input());

    expect(result).toEqual({
      ok: true,
      workspaceId: "ws_1",
      orderId: "order_1",
      refundId: "refund_1",
    });
    expect(createOrderRefund).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({
        workspaceId: "ws_1",
        type: "RETURN",
        status: "REQUESTED",
        amount: 50_000,
        returnToStock: true,
        notify: true,
      })
    );
  });

  it("files a plain REFUND when nothing is being sent back", async () => {
    await submitPublicReturnRequest(
      input({ items: [{ orderItemId: "item_1", quantity: 1, restockQuantity: 0 }] })
    );

    expect(createOrderRefund).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ type: "REFUND", returnToStock: false })
    );
  });

  it("rejects an invalid access token without saying whether the order exists", async () => {
    verifyPublicAccessToken.mockReturnValue(false);

    const result = await submitPublicReturnRequest(input({ accessToken: "forged" }));

    expect(result).toEqual({ ok: false, error: "Order link is invalid or expired." });
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("gives an unknown store the same answer as a bad token", async () => {
    db.workspaceFindUnique.mockResolvedValue(null);

    const result = await submitPublicReturnRequest(input({ workspaceSlug: "tidak-ada" }));

    expect(result).toEqual({ ok: false, error: "Order link is invalid or expired." });
    expect(db.orderFindUnique).not.toHaveBeenCalled();
  });

  it("blocks a rate-limited IP before touching the database", async () => {
    rateLimitByIp.mockResolvedValue({ ok: false, retryAfter: 300, remaining: 0 });

    const result = await submitPublicReturnRequest(input());

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("5 minutes");
    expect(db.workspaceFindUnique).not.toHaveBeenCalled();
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("blocks an order that has burned its own request budget", async () => {
    rateLimitByIp.mockImplementation(async (action: string) =>
      action.startsWith("order-return-request:")
        ? { ok: false, retryAfter: 600, remaining: 0 }
        : ALLOWED
    );

    const result = await submitPublicReturnRequest(input());

    expect(result.ok).toBe(false);
    expect(rateLimitByIp).toHaveBeenCalledWith(
      "order-return-request:order_1",
      3,
      10 * 60 * 1000
    );
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("spends the per-order budget only after the token checks out", async () => {
    verifyPublicAccessToken.mockReturnValue(false);

    await submitPublicReturnRequest(input({ accessToken: "forged" }));

    expect(rateLimitByIp).toHaveBeenCalledTimes(1);
    expect(rateLimitByIp).toHaveBeenCalledWith(
      "order-return-request",
      5,
      10 * 60 * 1000
    );
  });

  it("refuses a duplicate of an open request with the same items and amount", async () => {
    db.orderRefundFindMany.mockResolvedValue([
      {
        id: "refund_open",
        amount: 50_000,
        // Same set, different order — the signature is order-independent.
        items: [
          { orderItemId: "item_1", quantity: 1, restockQuantity: 1 },
        ],
      },
    ]);

    const result = await submitPublicReturnRequest(input());

    expect(result).toEqual({
      ok: false,
      error: "A request with the same items and amount is already being reviewed.",
    });
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("allows a genuinely different follow-up request", async () => {
    db.orderRefundFindMany.mockResolvedValue([
      {
        id: "refund_open",
        amount: 50_000,
        items: [{ orderItemId: "item_2", quantity: 1, restockQuantity: 0 }],
      },
    ]);

    const result = await submitPublicReturnRequest(input());

    expect(result.ok).toBe(true);
    expect(createOrderRefund).toHaveBeenCalled();
  });

  it("only matches duplicates against requests still open", async () => {
    await submitPublicReturnRequest(input());

    expect(db.orderRefundFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order_1", status: { in: ["REQUESTED", "APPROVED"] } },
      })
    );
  });

  it("rejects an over-long reason instead of truncating it", async () => {
    const result = await submitPublicReturnRequest(
      input({ reason: "x".repeat(MAX_RETURN_REASON_LENGTH + 1) })
    );

    expect(result).toEqual({
      ok: false,
      error: `Reason must be ${MAX_RETURN_REASON_LENGTH} characters or fewer.`,
    });
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("rejects an over-long note", async () => {
    const result = await submitPublicReturnRequest(
      input({ note: "y".repeat(MAX_RETURN_NOTE_LENGTH + 1) })
    );

    expect(result).toEqual({
      ok: false,
      error: `Note must be ${MAX_RETURN_NOTE_LENGTH} characters or fewer.`,
    });
  });

  it("accepts free text sitting exactly on the limit", async () => {
    const result = await submitPublicReturnRequest(
      input({
        reason: "x".repeat(MAX_RETURN_REASON_LENGTH),
        note: "y".repeat(MAX_RETURN_NOTE_LENGTH),
      })
    );

    expect(result.ok).toBe(true);
  });

  it("falls back to a default reason when the customer leaves it blank", async () => {
    await submitPublicReturnRequest(input({ reason: "   " }));

    expect(createOrderRefund).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ reason: "Customer return request", note: null })
    );
  });

  it("refuses an order whose payment is not confirmed", async () => {
    db.orderFindUnique.mockResolvedValue({ id: "order_1", status: "PENDING" });

    const result = await submitPublicReturnRequest(input());

    expect(result).toEqual({
      ok: false,
      error: "Return/refund request is only available after payment is confirmed.",
    });
    expect(createOrderRefund).not.toHaveBeenCalled();
  });

  it("rejects a negative refund amount", async () => {
    const result = await submitPublicReturnRequest(input({ amount: -1 }));

    expect(result).toEqual({
      ok: false,
      error: "Refund amount must be zero or greater.",
    });
  });

  it("passes through a refund service failure unchanged", async () => {
    createOrderRefund.mockResolvedValue({
      ok: false,
      error: "Refund amount exceeds the remaining refundable amount (10000).",
    });

    const result = await submitPublicReturnRequest(input());

    expect(result).toEqual({
      ok: false,
      error: "Refund amount exceeds the remaining refundable amount (10000).",
    });
  });

  describe("evidence", () => {
    const validUrl = "/uploads/ws_1/return-evidence/abc.jpg";

    function evidence(overrides: Record<string, unknown> = {}) {
      return {
        url: validUrl,
        name: "kerusakan.jpg",
        mimeType: "image/jpeg",
        size: 120_000,
        ...overrides,
      };
    }

    it("attaches evidence that came from this workspace's upload route", async () => {
      const result = await submitPublicReturnRequest(
        input({ evidence: [evidence()] })
      );

      expect(result.ok).toBe(true);
      expect(createOrderRefund).toHaveBeenCalledWith(
        "order_1",
        expect.objectContaining({
          evidence: [
            {
              url: validUrl,
              name: "kerusakan.jpg",
              mimeType: "image/jpeg",
              size: 120_000,
            },
          ],
        })
      );
    });

    it("rejects a file claimed to live under another workspace", async () => {
      const result = await submitPublicReturnRequest(
        input({
          evidence: [
            evidence({ url: "/uploads/ws_2/return-evidence/secret.jpg" }),
          ],
        })
      );

      expect(result).toEqual({
        ok: false,
        error: "Bukti tidak valid. Upload ulang filenya.",
      });
      expect(createOrderRefund).not.toHaveBeenCalled();
    });

    it("rejects a path outside the evidence directory", async () => {
      const result = await submitPublicReturnRequest(
        input({ evidence: [evidence({ url: "/uploads/ws_1/products/a.jpg" })] })
      );

      expect(result.ok).toBe(false);
      expect(createOrderRefund).not.toHaveBeenCalled();
    });

    it("rejects a traversal attempt inside an otherwise valid prefix", async () => {
      const result = await submitPublicReturnRequest(
        input({
          evidence: [
            evidence({ url: "/uploads/ws_1/return-evidence/../../../.env" }),
          ],
        })
      );

      expect(result.ok).toBe(false);
      expect(createOrderRefund).not.toHaveBeenCalled();
    });

    it("rejects a disallowed mime type", async () => {
      const result = await submitPublicReturnRequest(
        input({
          evidence: [
            evidence({
              url: "/uploads/ws_1/return-evidence/payload.svg",
              mimeType: "image/svg+xml",
            }),
          ],
        })
      );

      expect(result).toEqual({
        ok: false,
        error: "Gunakan file PNG, JPG, WEBP, atau PDF.",
      });
    });

    it("accepts a PDF receipt", async () => {
      const result = await submitPublicReturnRequest(
        input({
          evidence: [
            evidence({
              url: "/uploads/ws_1/return-evidence/resi.pdf",
              mimeType: "application/pdf",
            }),
          ],
        })
      );

      expect(result.ok).toBe(true);
    });

    it("rejects a file larger than the upload ceiling", async () => {
      const result = await submitPublicReturnRequest(
        input({ evidence: [evidence({ size: 6 * 1024 * 1024 })] })
      );

      expect(result).toEqual({
        ok: false,
        error: "Ukuran file bukti maksimal 5 MB.",
      });
    });

    it("caps how many files one request may carry", async () => {
      const result = await submitPublicReturnRequest(
        input({
          evidence: Array.from({ length: 6 }, (_, index) =>
            evidence({ url: `/uploads/ws_1/return-evidence/${index}.jpg` })
          ),
        })
      );

      expect(result).toEqual({
        ok: false,
        error: "Maksimal 5 file bukti per request.",
      });
    });

    it("collapses a file submitted twice", async () => {
      await submitPublicReturnRequest(
        input({ evidence: [evidence(), evidence()] })
      );

      expect(createOrderRefund).toHaveBeenCalledWith(
        "order_1",
        expect.objectContaining({ evidence: [expect.objectContaining({ url: validUrl })] })
      );
    });

    it("files a request with no evidence at all", async () => {
      const result = await submitPublicReturnRequest(input());

      expect(result.ok).toBe(true);
      expect(createOrderRefund).toHaveBeenCalledWith(
        "order_1",
        expect.objectContaining({ evidence: [] })
      );
    });
  });
});
