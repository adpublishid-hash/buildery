import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A pending order used to lapse silently at the payment timeout. One reminder
 * goes out shortly before that, and exactly one: the sweep runs every few
 * minutes and must not mail the same buyer on every tick.
 */

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));
const queueOrderNotifications = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: db.findMany },
    $transaction: db.transaction,
  },
}));
vi.mock("@/lib/store-notifications", () => ({ queueOrderNotifications }));

import { sweepPaymentReminders } from "@/lib/payment-reminders";

const NOW = new Date("2026-09-14T10:00:00Z");

describe("sweepPaymentReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) =>
      callback({ payment: { updateMany: db.updateMany } })
    );
    db.updateMany.mockResolvedValue({ count: 1 });
    queueOrderNotifications.mockResolvedValue(undefined);
  });

  it("reminds a buyer whose window is closing", async () => {
    db.findMany.mockResolvedValue([{ id: "pay_1", orderId: "order_1" }]);

    const summary = await sweepPaymentReminders({ now: NOW });

    expect(summary.reminded).toBe(1);
    expect(queueOrderNotifications).toHaveBeenCalledWith(
      expect.anything(),
      "order_1",
      "PAYMENT_REMINDER"
    );
  });

  it("only looks at pending orders inside the lead window", async () => {
    db.findMany.mockResolvedValue([]);

    await sweepPaymentReminders({ now: NOW, leadHours: 3 });

    const where = db.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      kind: "ORDER",
      status: "PENDING",
      remindedAt: null,
    });
    // Already expired is out of scope: the expiry sweep cancels those, and
    // asking someone to pay for a void order is worse than saying nothing.
    expect(where.expiresAt.gt).toEqual(NOW);
    expect(where.expiresAt.lte).toEqual(new Date("2026-09-14T13:00:00Z"));
  });

  it("claims the payment before sending, so two sweeps cannot both mail", async () => {
    db.findMany.mockResolvedValue([{ id: "pay_1", orderId: "order_1" }]);
    // Another worker got there first.
    db.updateMany.mockResolvedValue({ count: 0 });

    const summary = await sweepPaymentReminders({ now: NOW });

    expect(summary.reminded).toBe(0);
    expect(queueOrderNotifications).not.toHaveBeenCalled();
  });

  it("keeps going when one order fails", async () => {
    db.findMany.mockResolvedValue([
      { id: "pay_1", orderId: "order_1" },
      { id: "pay_2", orderId: "order_2" },
    ]);
    queueOrderNotifications
      .mockRejectedValueOnce(new Error("email provider down"))
      .mockResolvedValueOnce(undefined);

    const summary = await sweepPaymentReminders({ now: NOW });

    expect(summary.reminded).toBe(1);
    expect(queueOrderNotifications).toHaveBeenCalledTimes(2);
  });

  it("does nothing when reminders are switched off", async () => {
    expect(await sweepPaymentReminders({ now: NOW, leadHours: 0 })).toEqual({
      reminded: 0,
    });
    expect(db.findMany).not.toHaveBeenCalled();
  });
});
