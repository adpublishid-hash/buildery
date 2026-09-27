import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assertPublicHttpUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/telegram", () => ({
  getWorkspaceTelegramConfig: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));
vi.mock("@/lib/outbound-url", () => ({ assertPublicHttpUrl }));

import { performDelivery, webhookSignature } from "@/lib/form-delivery";

const submission = {
  id: "sub_1",
  formId: "form_1",
  workspaceId: "ws_1",
  data: { email: "a@b.test" },
  ipAddress: null,
  userAgent: null,
  referrer: null,
  createdAt: new Date("2026-09-12T10:00:00Z"),
  form: { title: "Kontak", slug: "kontak", fields: [] },
} as never;

const row = { id: "d1", kind: "WEBHOOK" as const, target: "https://hooks.example.com/x", attempts: 0 };

describe("webhook delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertPublicHttpUrl.mockResolvedValue({
      ok: true,
      url: new URL("https://hooks.example.com/x"),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-checks the host at send time, not just at save time", async () => {
    await performDelivery(row, submission, "Toko");

    expect(assertPublicHttpUrl).toHaveBeenCalledWith(
      "https://hooks.example.com/x"
    );
  });

  it("refuses to send when the host check fails", async () => {
    assertPublicHttpUrl.mockResolvedValue({
      ok: false,
      error: "URL tidak boleh mengarah ke alamat jaringan privat.",
    });

    const result = await performDelivery(row, submission, "Toko");

    expect(result).toEqual({
      ok: false,
      error: "URL tidak boleh mengarah ke alamat jaringan privat.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs the exact body it sends", async () => {
    await performDelivery(row, submission, "Toko");

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const timestamp = headers["X-Buildery-Timestamp"];

    expect(headers["X-Buildery-Signature"]).toBe(
      `sha256=${webhookSignature("ws_1", timestamp, init.body as string)}`
    );
  });

  it("does not follow redirects, and reports one as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 302 })
    );

    const result = await performDelivery(row, submission, "Toko");

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.redirect).toBe("manual");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/redirect/i);
  });

  it("reports a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await performDelivery(row, submission, "Toko");

    expect(result).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("turns a thrown network error into a failure result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const result = await performDelivery(row, submission, "Toko");

    expect(result).toEqual({ ok: false, error: "ECONNRESET" });
  });
});

describe("webhookSignature", () => {
  it("is stable for the same workspace, timestamp, and body", () => {
    const a = webhookSignature("ws_1", "1757671200", '{"a":1}');
    const b = webhookSignature("ws_1", "1757671200", '{"a":1}');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when the body changes", () => {
    expect(webhookSignature("ws_1", "1757671200", '{"a":1}')).not.toBe(
      webhookSignature("ws_1", "1757671200", '{"a":2}')
    );
  });

  it("changes when the timestamp changes, so a capture cannot be replayed", () => {
    expect(webhookSignature("ws_1", "1757671200", '{"a":1}')).not.toBe(
      webhookSignature("ws_1", "1757671260", '{"a":1}')
    );
  });

  it("differs per workspace, so one tenant's secret cannot forge another's", () => {
    expect(webhookSignature("ws_1", "1757671200", '{"a":1}')).not.toBe(
      webhookSignature("ws_2", "1757671200", '{"a":1}')
    );
  });
});
