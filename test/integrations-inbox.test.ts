import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  metaSendMessage,
  parseMetaWebhook,
  parseTelegramUpdate,
  telegramSecretToken,
  telegramSendMessage,
  telegramSetWebhook,
  validVisitorToken,
  verifyMetaSignature,
  webchatContactId,
} from "@/lib/integrations/inbox/requests";
import { serviceWindow } from "@/lib/inbox";

describe("Telegram", () => {
  const update = (message: Record<string, unknown>) => ({
    update_id: 1,
    message: { message_id: 42, chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Budi", last_name: "S" }, ...message },
  });

  it("parses a private text message with a namespaced id", () => {
    expect(parseTelegramUpdate(update({ text: "Halo" }))).toEqual({
      contactId: "777",
      name: "Budi S",
      body: "Halo",
      kind: "TEXT",
      providerMessageId: "tg:777:42",
      mediaUrl: null,
      mediaMimeType: null,
      mediaFilename: null,
    });
  });

  it("keeps a photo's caption but never a token-bearing file link", () => {
    const parsed = parseTelegramUpdate(update({ photo: [{ file_id: "abc" }], caption: "rusak" }));
    expect(parsed).toMatchObject({ kind: "IMAGE", body: "rusak", mediaUrl: null });
  });

  it("ignores groups, bots, and updates without a message", () => {
    expect(parseTelegramUpdate(update({ text: "x", chat: { id: -1, type: "group" } }))).toBeNull();
    expect(parseTelegramUpdate(update({ text: "x", from: { is_bot: true } }))).toBeNull();
    expect(parseTelegramUpdate({ update_id: 2, edited_message: {} })).toBeNull();
  });

  it("derives a stable secret token that changes with the key or the bot", () => {
    const token = telegramSecretToken("key-1", "123:ABC");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(telegramSecretToken("key-1", "123:ABC")).toBe(token);
    expect(telegramSecretToken("key-2", "123:ABC")).not.toBe(token);
    expect(telegramSecretToken("key-1", "999:XYZ")).not.toBe(token);
  });

  it("builds setWebhook and sendMessage calls", () => {
    const hook = telegramSetWebhook({ botToken: "123:ABC" }, "https://toko.id/hook", "s3cret");
    expect(hook.url).toBe("https://api.telegram.org/bot123:ABC/setWebhook");
    expect(JSON.parse(hook.body!)).toMatchObject({ url: "https://toko.id/hook", secret_token: "s3cret", allowed_updates: ["message"] });
    const send = telegramSendMessage({ botToken: "123:ABC" }, "777", "a".repeat(5000));
    expect(JSON.parse(send.body!).text).toHaveLength(4096);
  });
});

describe("Messenger and Instagram", () => {
  const page = {
    object: "page",
    entry: [
      {
        id: "PAGE1",
        messaging: [
          { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, message: { mid: "m_1", text: "Ada ukuran L?" } },
          { sender: { id: "PAGE1" }, recipient: { id: "PSID1" }, message: { mid: "m_2", text: "echo", is_echo: true } },
          { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, read: { watermark: 1 } },
          {
            sender: { id: "PSID2" },
            recipient: { id: "PAGE1" },
            message: { mid: "m_3", attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/a.jpg" } }] },
          },
        ],
      },
    ],
  };

  it("keeps customer messages and drops echoes and receipts", () => {
    const parsed = parseMetaWebhook(page, "MESSENGER", "PAGE1");
    expect(parsed.map((message) => message.providerMessageId)).toEqual(["m_1", "m_3"]);
    expect(parsed[0]).toMatchObject({ contactId: "PSID1", body: "Ada ukuran L?", kind: "TEXT" });
    expect(parsed[1]).toMatchObject({ contactId: "PSID2", kind: "IMAGE", mediaUrl: "https://scontent.xx.fbcdn.net/a.jpg" });
  });

  it("only accepts the object type of its own channel", () => {
    expect(parseMetaWebhook(page, "INSTAGRAM", "IG1")).toEqual([]);
    const instagram = { ...page, object: "instagram" };
    expect(parseMetaWebhook(instagram, "INSTAGRAM", "IG1")).toHaveLength(2);
    // Instagram also reports our own account's messages as senders.
    expect(parseMetaWebhook(instagram, "INSTAGRAM", "PSID1")).toHaveLength(1);
  });

  it("verifies X-Hub-Signature-256", () => {
    const body = JSON.stringify(page);
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, signature, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body, signature, "other")).toBe(false);
    expect(verifyMetaSignature(`${body} `, signature, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
  });

  it("sends a RESPONSE message with the page token in the header", () => {
    const request = metaSendMessage({ pageAccessToken: "EAAG" }, "PSID1", "Ada kak");
    expect(request.url).toBe("https://graph.facebook.com/v21.0/me/messages");
    expect(request.headers.Authorization).toBe("Bearer EAAG");
    expect(JSON.parse(request.body!)).toEqual({ recipient: { id: "PSID1" }, messaging_type: "RESPONSE", message: { text: "Ada kak" } });
  });
});

describe("Web chat", () => {
  it("stores only a hash of the visitor token", () => {
    const token = "a".repeat(32);
    const id = webchatContactId(token);
    expect(id).toMatch(/^wc_[a-f0-9]{32}$/);
    expect(id).not.toContain(token);
    expect(webchatContactId(token)).toBe(id);
  });

  it("accepts only well-formed tokens", () => {
    expect(validVisitorToken("abcDEF123_-abcDEF123_-abcd")).toBe(true);
    expect(validVisitorToken("short")).toBe(false);
    expect(validVisitorToken("has spaces in it and is long enough")).toBe(false);
    expect(validVisitorToken(null)).toBe(false);
  });
});

describe("serviceWindow per channel", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const stale = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  it("enforces Meta's 24-hour window on Messenger and Instagram", () => {
    expect(serviceWindow({ channel: "MESSENGER", provider: null, lastInboundAt: stale, now })).toMatchObject({ enforced: true, open: false });
    expect(serviceWindow({ channel: "INSTAGRAM", provider: null, lastInboundAt: stale, now })).toMatchObject({ enforced: true, open: false });
  });

  it("leaves Telegram and web chat open, and ignores the WhatsApp provider there", () => {
    expect(serviceWindow({ channel: "TELEGRAM", provider: "WABA", lastInboundAt: stale, now })).toMatchObject({ enforced: false });
    expect(serviceWindow({ channel: "WEBCHAT", provider: "WABA", lastInboundAt: stale, now })).toMatchObject({ enforced: false });
  });
});
