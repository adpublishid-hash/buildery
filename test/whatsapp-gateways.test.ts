import { describe, expect, it } from "vitest";

import { parseInboxWebhook } from "@/lib/whatsapp/inbox-parse";
import {
  buildSendRequest,
  KIRIMI_MAX_TEXT_LENGTH,
  parseSendResponse,
  WhatsAppConfigError,
  type WhatsAppConfig,
} from "@/lib/whatsapp/providers";
import { verifyInboxWebhook } from "@/lib/whatsapp/webhook-auth";

const base = { apiKey: "key-123", phoneNumberId: "", apiBaseUrl: "", graphVersion: "v25.0" };

describe("WAHA", () => {
  const waha: WhatsAppConfig = { ...base, provider: "WAHA", apiBaseUrl: "https://waha.toko.id/" };

  it("posts sendText with the X-Api-Key header and a c.us chat id", () => {
    const request = buildSendRequest(waha, "6281234567890", "Halo");
    expect(request.url).toBe("https://waha.toko.id/api/sendText");
    expect(request.headers["x-api-key"]).toBe("key-123");
    expect(JSON.parse(request.body)).toEqual({ session: "default", chatId: "6281234567890@c.us", text: "Halo" });
  });

  it("uses the configured session name", () => {
    const request = buildSendRequest({ ...waha, phoneNumberId: "toko" }, "628123456789", "Hi");
    expect(JSON.parse(request.body).session).toBe("toko");
  });

  it("requires the server URL", () => {
    expect(() => buildSendRequest({ ...waha, apiBaseUrl: "" }, "628123456789", "Hi")).toThrow(WhatsAppConfigError);
  });

  it("reads a serialized message id", () => {
    const outcome = parseSendResponse("WAHA", 201, JSON.stringify({ id: { _serialized: "true_62812@c.us_ABC" } }));
    expect(outcome).toEqual({ ok: true, providerMessageId: "true_62812@c.us_ABC" });
  });

  it("verifies the HMAC-SHA512 signature from the WAHA docs", () => {
    const rawBody = '{"event":"message","session":"default","engine":"WEBJS"}';
    const hmac =
      "208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89";
    const request = (signature: string) => ({
      provider: "WAHA" as const,
      secret: "my-secret-key",
      rawBody,
      headers: new Headers({ "x-webhook-hmac": signature, "x-webhook-hmac-algorithm": "sha512" }),
      url: new URL("https://toko.id/api/inbox/whatsapp/webhook?workspaceId=ws"),
    });
    expect(verifyInboxWebhook(request(hmac))).toEqual({ ok: true });
    expect(verifyInboxWebhook(request(hmac.replace(/^2/, "3")))).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("parses an inbound message and ignores our own, group and non-message events", () => {
    const event = (payload: Record<string, unknown>, name = "message") => ({ event: name, session: "default", payload });
    const parsed = parseInboxWebhook(
      event({ id: "false_6281@c.us_X", from: "6281234567890@c.us", fromMe: false, body: "Ada stok?", hasMedia: false, _data: { notifyName: "Sari" } })
    );
    expect(parsed).toMatchObject({ phone: "6281234567890", name: "Sari", body: "Ada stok?", kind: "TEXT", providerMessageId: "false_6281@c.us_X" });

    expect(parseInboxWebhook(event({ from: "6281234567890@c.us", fromMe: true, body: "x" }))).toBeNull();
    expect(parseInboxWebhook(event({ from: "12036@g.us", fromMe: false, body: "x" }))).toBeNull();
    expect(parseInboxWebhook(event({ status: "WORKING" }, "session.status"))).toBeNull();
  });

  it("keeps downloaded media", () => {
    const parsed = parseInboxWebhook({
      event: "message",
      session: "default",
      payload: {
        from: "6281234567890@c.us",
        body: "",
        hasMedia: true,
        media: { url: "https://waha.toko.id/api/files/a.jpg", mimetype: "image/jpeg", filename: null },
      },
    });
    expect(parsed).toMatchObject({ kind: "IMAGE", mediaUrl: "https://waha.toko.id/api/files/a.jpg", mediaMimeType: "image/jpeg" });
  });
});

describe("Woowa", () => {
  const woowa: WhatsAppConfig = { ...base, provider: "WOOWA" };

  it("posts send_message with the key in the body", () => {
    const request = buildSendRequest(woowa, "6281234567890", "Halo");
    expect(request.url).toBe("https://notifapi.com/api/send_message");
    expect(JSON.parse(request.body)).toEqual({ phone_no: "6281234567890", key: "key-123", message: "Halo" });
  });

  it("honours a dedicated server URL", () => {
    const request = buildSendRequest({ ...woowa, apiBaseUrl: "http://116.203.1.1" }, "628123456789", "Hi");
    expect(request.url).toBe("http://116.203.1.1/api/send_message");
  });

  it("treats the plain-text reply 'Success' as delivered and anything else as a failure", () => {
    expect(parseSendResponse("WOOWA", 200, "Success")).toEqual({ ok: true, providerMessageId: null });
    expect(parseSendResponse("WOOWA", 200, "phone_offline")).toEqual({ ok: false, error: "HTTP 200: phone_offline" });
  });
});

describe("Kirimi", () => {
  const kirimi: WhatsAppConfig = { ...base, provider: "KIRIMI", phoneNumberId: "DEV1", userCode: "U123" };

  it("posts send-message with credentials in the JSON body", () => {
    const request = buildSendRequest(kirimi, "6281234567890", "Halo");
    expect(request.url).toBe("https://api.kirimi.id/v1/send-message");
    expect(JSON.parse(request.body)).toEqual({
      user_code: "U123",
      device_id: "DEV1",
      receiver: "6281234567890",
      message: "Halo",
      secret: "key-123",
    });
  });

  it("truncates to Kirimi's message limit", () => {
    const request = buildSendRequest(kirimi, "6281234567890", "a".repeat(5000));
    expect(JSON.parse(request.body).message).toHaveLength(KIRIMI_MAX_TEXT_LENGTH);
  });

  it("requires the user code and device id", () => {
    expect(() => buildSendRequest({ ...kirimi, userCode: "" }, "628123456789", "Hi")).toThrow(/User Code/);
    expect(() => buildSendRequest({ ...kirimi, phoneNumberId: "" }, "628123456789", "Hi")).toThrow(/Device ID/);
  });

  it("reads the success envelope", () => {
    expect(parseSendResponse("KIRIMI", 200, JSON.stringify({ success: false, message: "device tidak terhubung" }))).toEqual({
      ok: false,
      error: "HTTP 200: device tidak terhubung",
    });
    expect(parseSendResponse("KIRIMI", 200, JSON.stringify({ success: true, data: {}, message: "ok" })).ok).toBe(true);
  });
});
