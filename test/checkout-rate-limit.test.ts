import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creating an order reserves stock when the store decrements at checkout, and
 * the reservation only lapses at the payment timeout — 24 hours by default.
 * Unthrottled, anyone could hold a shop's whole inventory hostage with orders
 * they never intend to pay for.
 */

const rateLimitByIp = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({ rateLimitByIp }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique },
    product: { findMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: () => {} }),
  headers: () => new Headers(),
}));

import { createOrderAction } from "@/lib/actions/order";

function checkoutForm() {
  const form = new FormData();
  form.set("name", "Budi Santoso");
  form.set("email", "budi@contoh.test");
  form.set("checkoutRequestId", "a".repeat(24));
  return form;
}

describe("checkout throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a flood of checkouts before touching the database", async () => {
    rateLimitByIp.mockResolvedValue({ ok: false, retryAfter: 240, remaining: 0 });

    const result = await createOrderAction("workspace_1", checkoutForm());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Terlalu banyak|menit/);
    // No order lookup, so no stock was reserved and no payment was created.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("throttles by IP on the checkout action", async () => {
    rateLimitByIp.mockResolvedValue({ ok: false, retryAfter: 60, remaining: 0 });

    await createOrderAction("workspace_1", checkoutForm());

    expect(rateLimitByIp).toHaveBeenCalledWith(
      "checkout-order",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("lets a normal shopper through to the checkout itself", async () => {
    rateLimitByIp.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 9 });
    findUnique.mockResolvedValue(null);

    const result = await createOrderAction("workspace_1", checkoutForm());

    // It got past the throttle: the next failure is the empty cart, not a limit.
    expect(findUnique).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toMatch(/Terlalu banyak/);
  });
});
