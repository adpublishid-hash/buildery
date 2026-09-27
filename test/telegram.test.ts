import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTelegramMessage } from "@/lib/telegram";

describe("sendTelegramMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends messages through Telegram Bot API sendMessage", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTelegramMessage(
      {
        botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        chatId: "-1001234567890",
        messageThreadId: "42",
      },
      "Order baru\nTotal: Rp100.000"
    );

    expect(result).toEqual({
      ok: true,
      provider: "telegram",
      messageId: 99,
    });
    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe(
      "https://api.telegram.org/bot123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi/sendMessage"
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234567890",
      text: "Order baru\nTotal: Rp100.000",
      disable_notification: false,
      message_thread_id: 42,
    });
  });

  it("returns the Telegram API error without throwing", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ok: false, description: "Bad Request: chat not found" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTelegramMessage(
      {
        botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        chatId: "-1001234567890",
      },
      "Hello"
    );

    expect(result).toEqual({
      ok: false,
      error: "Bad Request: chat not found",
    });
  });
});
