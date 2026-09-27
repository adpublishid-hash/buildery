import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { safeEqual, verifyInboxWebhook } from "@/lib/whatsapp/webhook-auth";

const SECRET = "app-secret-0123456789";
const URL_BASE = "https://landing.my.id/api/inbox/whatsapp/webhook?workspaceId=ws_1";
const BODY = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "62812", text: { body: "halo" } }] } }] }] });

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function input(overrides: Partial<Parameters<typeof verifyInboxWebhook>[0]> = {}) {
  return {
    provider: "WABA" as const,
    secret: SECRET,
    rawBody: BODY,
    headers: new Headers(),
    url: new URL(URL_BASE),
    ...overrides,
  };
}

describe("verifyInboxWebhook", () => {
  it("rejects everything when the workspace has no secret configured", () => {
    const result = verifyInboxWebhook(
      input({ secret: null, headers: new Headers({ "x-hub-signature-256": sign(BODY) }) })
    );
    expect(result).toEqual({ ok: false, reason: "no_secret_configured" });
  });

  it("accepts a Meta delivery with a valid signature", () => {
    const result = verifyInboxWebhook(
      input({ headers: new Headers({ "x-hub-signature-256": sign(BODY) }) })
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects a signature made with another secret", () => {
    const result = verifyInboxWebhook(
      input({ headers: new Headers({ "x-hub-signature-256": sign(BODY, "attacker") }) })
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a body that was altered after signing", () => {
    const tampered = BODY.replace("halo", "transfer ke rekening saya");
    const result = verifyInboxWebhook(
      input({
        rawBody: tampered,
        headers: new Headers({ "x-hub-signature-256": sign(BODY) }),
      })
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an unsigned delivery for a WABA workspace", () => {
    const result = verifyInboxWebhook(input());
    expect(result).toEqual({ ok: false, reason: "missing_credentials" });
  });

  it("does not let a WABA workspace fall back to a shared-token query param", () => {
    const result = verifyInboxWebhook(
      input({ url: new URL(`${URL_BASE}&secret=${SECRET}`) })
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a gateway presenting the secret in X-Webhook-Secret", () => {
    const result = verifyInboxWebhook(
      input({ provider: "ONESENDER", headers: new Headers({ "x-webhook-secret": SECRET }) })
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts a gateway presenting the secret as a bearer token", () => {
    const result = verifyInboxWebhook(
      input({ provider: "STARSENDER", headers: new Headers({ authorization: `Bearer ${SECRET}` }) })
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts a gateway that can only configure the URL", () => {
    const result = verifyInboxWebhook(
      input({ provider: "ONESENDER", url: new URL(`${URL_BASE}&secret=${SECRET}`) })
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects a gateway with the wrong secret", () => {
    const result = verifyInboxWebhook(
      input({ provider: "ONESENDER", headers: new Headers({ "x-webhook-secret": "wrong" }) })
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a gateway that presents nothing", () => {
    const result = verifyInboxWebhook(input({ provider: "ONESENDER" }));
    expect(result).toEqual({ ok: false, reason: "missing_credentials" });
  });
});

describe("safeEqual", () => {
  it("compares equal strings as equal", () => {
    expect(safeEqual("token-abc", "token-abc")).toBe(true);
  });

  it("rejects strings of a different length without throwing", () => {
    expect(safeEqual("short", "much-longer-token")).toBe(false);
  });

  it("rejects same-length strings that differ", () => {
    expect(safeEqual("token-abc", "token-abd")).toBe(false);
  });
});
