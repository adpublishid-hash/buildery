import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  formDeliveryFindMany: vi.fn(),
  formDeliveryUpdateMany: vi.fn(),
  formDeliveryUpdate: vi.fn(),
  formSubmissionFindUnique: vi.fn(),
}));
const performDelivery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    formDelivery: {
      findMany: db.formDeliveryFindMany,
      updateMany: db.formDeliveryUpdateMany,
      update: db.formDeliveryUpdate,
    },
    formSubmission: { findUnique: db.formSubmissionFindUnique },
  },
}));

// The real recordDeliveryOutcome is exercised through the prisma mock below,
// so only the network-touching half is stubbed.
vi.mock("@/lib/form-delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/form-delivery")>(
    "@/lib/form-delivery"
  );
  return { ...actual, performDelivery };
});

import { retryFormDeliveries } from "@/lib/form-delivery-retry";
import { FORM_DELIVERY_MAX_ATTEMPTS } from "@/lib/form-delivery";

const now = new Date("2026-09-12T12:00:00Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery_1",
    kind: "WEBHOOK",
    target: "https://hooks.example.com/x",
    attempts: 1,
    status: "FAILED",
    submissionId: "submission_1",
    ...overrides,
  };
}

function submission() {
  return {
    id: "submission_1",
    workspaceId: "ws_1",
    form: { title: "Kontak", fields: [] },
    workspace: { name: "Toko" },
  };
}

describe("retryFormDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.formDeliveryFindMany.mockResolvedValue([row()]);
    db.formDeliveryUpdateMany.mockResolvedValue({ count: 1 });
    db.formDeliveryUpdate.mockResolvedValue({});
    db.formSubmissionFindUnique.mockResolvedValue(submission());
    performDelivery.mockResolvedValue({ ok: true });
  });

  it("marks a recovered delivery as sent and clears its schedule", async () => {
    const summary = await retryFormDeliveries({ now });

    expect(summary).toEqual({ scanned: 1, sent: 1, failed: 0, skipped: 0 });
    expect(db.formDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: {
        status: "SENT",
        attempts: { increment: 1 },
        lastError: null,
        lastTriedAt: now,
        nextAttemptAt: null,
      },
    });
  });

  it("sweeps failed rows whose backoff has elapsed and stale pending rows", async () => {
    await retryFormDeliveries({ now });

    expect(db.formDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attempts: { lt: FORM_DELIVERY_MAX_ATTEMPTS },
          AND: [
            {
              OR: [
                { status: "FAILED", nextAttemptAt: { lte: now } },
                {
                  status: "PENDING",
                  createdAt: { lte: new Date("2026-09-12T11:55:00Z") },
                },
              ],
            },
          ],
        },
      })
    );
  });

  it("rescues a PENDING row left behind by a restart", async () => {
    db.formDeliveryFindMany.mockResolvedValue([
      row({ status: "PENDING", attempts: 0 }),
    ]);

    const summary = await retryFormDeliveries({ now });

    expect(summary.sent).toBe(1);
    expect(performDelivery).toHaveBeenCalledTimes(1);
  });

  it("schedules the next attempt with exponential backoff on failure", async () => {
    performDelivery.mockResolvedValue({ ok: false, error: "HTTP 503" });

    const summary = await retryFormDeliveries({ now });

    expect(summary).toEqual({ scanned: 1, sent: 0, failed: 1, skipped: 0 });
    expect(db.formDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: expect.objectContaining({
        status: "FAILED",
        lastError: "HTTP 503",
        // attempts was 1, so attempt 2 waits 2^2 = 4 minutes.
        nextAttemptAt: new Date("2026-09-12T12:04:00Z"),
      }),
    });
  });

  it("stops scheduling once the attempt ceiling is reached", async () => {
    db.formDeliveryFindMany.mockResolvedValue([
      row({ attempts: FORM_DELIVERY_MAX_ATTEMPTS - 1 }),
    ]);
    performDelivery.mockResolvedValue({ ok: false, error: "HTTP 500" });

    await retryFormDeliveries({ now });

    expect(db.formDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: expect.objectContaining({
        status: "FAILED",
        nextAttemptAt: null,
      }),
    });
  });

  it("never picks up a row that already spent every attempt", async () => {
    await retryFormDeliveries({ now });

    const where = db.formDeliveryFindMany.mock.calls[0][0].where;
    expect(where.attempts).toEqual({ lt: FORM_DELIVERY_MAX_ATTEMPTS });
  });

  it("skips a row another worker claimed first", async () => {
    db.formDeliveryUpdateMany.mockResolvedValue({ count: 0 });

    const summary = await retryFormDeliveries({ now });

    expect(summary).toEqual({ scanned: 1, sent: 0, failed: 0, skipped: 1 });
    expect(performDelivery).not.toHaveBeenCalled();
  });

  it("claims on the exact state it read, so two workers cannot both win", async () => {
    await retryFormDeliveries({ now });

    expect(db.formDeliveryUpdateMany).toHaveBeenCalledWith({
      where: { id: "delivery_1", status: "FAILED", attempts: 1 },
      data: { nextAttemptAt: null, lastTriedAt: now },
    });
  });

  it("skips a delivery whose submission has been deleted", async () => {
    db.formSubmissionFindUnique.mockResolvedValue(null);

    const summary = await retryFormDeliveries({ now });

    expect(summary.skipped).toBe(1);
    expect(performDelivery).not.toHaveBeenCalled();
  });

  it("caps the batch so one tick stays bounded", async () => {
    db.formDeliveryFindMany.mockResolvedValue([]);

    await retryFormDeliveries({ limit: 10_000, now });

    expect(db.formDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it("reports an empty sweep without touching anything", async () => {
    db.formDeliveryFindMany.mockResolvedValue([]);

    const summary = await retryFormDeliveries({ now });

    expect(summary).toEqual({ scanned: 0, sent: 0, failed: 0, skipped: 0 });
    expect(db.formDeliveryUpdateMany).not.toHaveBeenCalled();
  });
});
