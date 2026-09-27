import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { errorEvent: { upsert: db.upsert } },
}));

import {
  describeError,
  errorFingerprint,
  normalizeErrorMessage,
  reportError,
  resetErrorReportingForTests,
  sanitizeContext,
} from "@/lib/error-reporting";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("normalizeErrorMessage", () => {
  it("collapses volatile values so one cause is one issue", () => {
    expect(normalizeErrorMessage("Order clx9k2m4p0000abcd1234efgh not found")).toBe(
      "Order <id> not found"
    );
    expect(normalizeErrorMessage("timeout after 3021ms on attempt 4")).toBe(
      "timeout after #ms on attempt #"
    );
    expect(
      normalizeErrorMessage("user 3f2b8c1a-9d4e-4f6a-8b2c-1e5d7a9c0b3f missing")
    ).toBe("user <uuid> missing");
    expect(normalizeErrorMessage("bounce for jane.doe+shop@example.co.id")).toBe(
      "bounce for <email>"
    );
  });
});

describe("errorFingerprint", () => {
  it("is stable across volatile values and distinct across sources", () => {
    const a = errorFingerprint("payments", "failed after 3 tries");
    const b = errorFingerprint("payments", "failed after 7 tries");
    const c = errorFingerprint("orders", "failed after 3 tries");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("uses the extra discriminator, e.g. a client digest", () => {
    expect(errorFingerprint("client:root", "boom", "111")).not.toBe(
      errorFingerprint("client:root", "boom", "222")
    );
  });
});

describe("describeError", () => {
  it("keeps name, message and stack of an Error", () => {
    const error = new TypeError("bad input");
    const described = describeError(error);
    expect(described.message).toBe("TypeError: bad input");
    expect(described.stack).toContain("bad input");
  });

  it("handles strings, objects and unserializable values", () => {
    expect(describeError("plain").message).toBe("plain");
    expect(describeError({ code: 42 }).message).toBe('{"code":42}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe("[object Object]");
  });

  it("truncates very long messages", () => {
    expect(describeError("x".repeat(5000)).message).toHaveLength(1000);
  });
});

describe("sanitizeContext", () => {
  it("redacts sensitive-looking keys at any depth", () => {
    expect(
      sanitizeContext({
        orderId: "o1",
        serverKey: "SB-Mid-server-abc",
        nested: { accessToken: "t", Authorization: "Bearer x", ok: 1 },
      })
    ).toEqual({
      orderId: "o1",
      serverKey: "[redacted]",
      nested: { accessToken: "[redacted]", Authorization: "[redacted]", ok: 1 },
    });
  });

  it("truncates oversized context instead of storing it whole", () => {
    const result = sanitizeContext({ blob: "y".repeat(10_000) }) as { truncated: string };
    expect(result.truncated).toHaveLength(4000);
  });

  it("returns undefined when there is no context", () => {
    expect(sanitizeContext(undefined)).toBeUndefined();
  });
});

describe("reportError", () => {
  beforeEach(() => {
    process.env.ERROR_REPORTING_IN_TESTS = "1";
    resetErrorReportingForTests();
    db.upsert.mockReset();
    db.upsert.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ERROR_REPORTING_IN_TESTS;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("still logs, and records the event", async () => {
    reportError("payments", new Error("gateway down"), { context: { orderId: "o1" } });
    await flush();

    expect(console.error).toHaveBeenCalledWith("[payments]", expect.any(Error));
    expect(db.upsert).toHaveBeenCalledTimes(1);
    const call = db.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      source: "payments",
      message: "Error: gateway down",
      count: 1,
      context: { orderId: "o1" },
    });
    expect(call.update).toMatchObject({ count: { increment: 1 }, resolvedAt: null });
  });

  it("counts repeats inside the window and writes them with the next occurrence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));

    reportError("analytics", new Error("insert failed"));
    reportError("analytics", new Error("insert failed"));
    reportError("analytics", new Error("insert failed"));
    expect(db.upsert).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-09-13T00:00:11Z"));
    reportError("analytics", new Error("insert failed"));
    expect(db.upsert).toHaveBeenCalledTimes(2);
    // Two throttled repeats plus this one.
    expect(db.upsert.mock.calls[1][0].update.count).toEqual({ increment: 3 });
  });

  it("never throws, even when the database write fails", async () => {
    db.upsert.mockRejectedValue(new Error("db down"));
    expect(() => reportError("orders", new Error("boom"))).not.toThrow();
    await flush();
    expect(console.error).toHaveBeenCalledWith(
      "[error-reporting] could not record error:",
      expect.any(Error)
    );
  });

  it("does not touch the database in tests unless asked to", async () => {
    delete process.env.ERROR_REPORTING_IN_TESTS;
    reportError("orders", new Error("boom"));
    await flush();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
