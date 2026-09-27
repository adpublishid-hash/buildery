import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  integration: vi.fn(),
  create: vi.fn(),
  paymentUpdateMany: vi.fn(),
  setting: vi.fn(),
}));
const enqueueJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationSetting: { findUnique: db.integration },
    ecommerceSetting: { findUnique: db.setting },
    metaCapiEvent: { create: db.create },
    payment: { updateMany: db.paymentUpdateMany },
    // No extra pixels: only the primary one receives events.
    adPixel: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob }));

import {
  clearAdConsentCache,
  pruneStoredAdContexts,
  readStoredAdContext,
  sendWorkspaceAdEvent,
  toStoredAdContext,
} from "@/lib/ad-events";
import { buildPixelIdentity, isSafePixelIdentity } from "@/lib/ad-identity";
import { clearAdEventFlushPokeCache } from "@/lib/ad-event-queue";
import { clearGa4ConfigCache } from "@/lib/ga4-measurement";
import { clearMetaCapiConfigCache } from "@/lib/meta-capi";
import { clearTikTokConfigCache } from "@/lib/tiktok-events";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const enabled = {
  adConsentRequired: true,
  metaPixelId: "123456",
  metaCapiEnabled: true,
  metaCapiAccessToken: "t",
  metaCapiTestEventCode: null,
  tiktokPixelId: null,
  tiktokEventsApiEnabled: false,
  tiktokAccessToken: null,
  tiktokTestEventCode: null,
  googleAnalyticsId: null,
  googleAnalyticsApiSecret: null,
};
const event = {
  eventName: "AddToCart" as const,
  eventId: "atc:1",
  sourceUrl: "https://s.example/",
};

describe("cookie consent", () => {
  afterEach(() => {
    clearAdConsentCache();
    clearMetaCapiConfigCache();
    clearTikTokConfigCache();
    clearGa4ConfigCache();
    clearAdEventFlushPokeCache();
    vi.resetAllMocks();
  });

  it.each([undefined, null, "denied"] as const)(
    "sends nothing anywhere when consent is required and the answer is %s",
    async (adConsent) => {
      db.integration.mockResolvedValue(enabled);

      const result = await sendWorkspaceAdEvent("ws_1", { ...event, adConsent });

      const skipped = { queued: false, reason: "no_consent" };
      expect(result).toEqual({ meta: skipped, tiktok: skipped, ga4: skipped });
      expect(db.create).not.toHaveBeenCalled();
    }
  );

  it("sends once the visitor accepted", async () => {
    db.integration.mockResolvedValue(enabled);
    db.create.mockResolvedValue({ id: "row" });
    enqueueJob.mockResolvedValue({});

    const result = await sendWorkspaceAdEvent("ws_1", { ...event, adConsent: "granted" });

    expect(result.meta).toEqual({ queued: true, id: "row" });
  });

  it("does not ask for consent when the store does not require it", async () => {
    db.integration.mockResolvedValue({ ...enabled, adConsentRequired: false });
    db.create.mockResolvedValue({ id: "row" });
    enqueueJob.mockResolvedValue({});

    const result = await sendWorkspaceAdEvent("ws_1", event);
    expect(result.meta).toEqual({ queued: true, id: "row" });
  });

  it("normalises the currency to the store's setting", async () => {
    db.integration.mockResolvedValue({ ...enabled, adConsentRequired: false });
    db.setting.mockResolvedValue({ currencyCode: "usd" });
    db.create.mockResolvedValue({ id: "row" });
    enqueueJob.mockResolvedValue({});

    await sendWorkspaceAdEvent("ws_2", {
      ...event,
      customData: { currency: "IDR", value: 10 },
    });

    expect(db.create.mock.calls[0][0].data.payload.custom_data).toMatchObject({
      currency: "USD",
      value: 10,
    });
  });

  it("keeps the consent answer with the checkout context for the later purchase", () => {
    const stored = toStoredAdContext({ userAgent: "UA", adConsent: "granted", gaClientId: "1.2" });
    expect(readStoredAdContext(stored as never)).toEqual({
      userAgent: "UA",
      adConsent: "granted",
      gaClientId: "1.2",
    });
    expect(readStoredAdContext({ adConsent: "maybe" } as never)).toEqual({ adConsent: null });
  });

  it("clears checkout context from settled payments and stale pending ones", async () => {
    db.paymentUpdateMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-09-13T12:00:00Z");

    await expect(pruneStoredAdContexts(now)).resolves.toBe(3);

    const where = db.paymentUpdateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: { not: "PENDING" }, updatedAt: { lt: new Date("2026-09-13T11:00:00Z") } },
      { createdAt: { lt: new Date("2026-08-14T12:00:00Z") } },
    ]);
  });
});

describe("pixel identity", () => {
  it("hashes identity per platform format, never passing raw values", () => {
    const identity = buildPixelIdentity({
      email: " Buyer@Example.com ",
      phone: "0812-3456-7890",
      externalId: "cust_1",
    });
    expect(identity).toEqual({
      meta: {
        em: sha("buyer@example.com"),
        ph: sha("6281234567890"),
        external_id: sha("cust_1"),
      },
      tiktok: {
        email: sha("buyer@example.com"),
        phone_number: sha("+6281234567890"),
        external_id: sha("cust_1"),
      },
      google: {
        sha256_email_address: sha("buyer@example.com"),
        sha256_phone_number: sha("+6281234567890"),
      },
    });
    expect(isSafePixelIdentity(identity)).toBe(true);
    expect(JSON.stringify(identity)).not.toContain("buyer@example.com");
  });

  it("refuses to inline anything that is not a digest", () => {
    expect(
      isSafePixelIdentity({ meta: { em: "</script><script>alert(1)" }, tiktok: {}, google: {} })
    ).toBe(false);
  });
});
