import { describe, expect, it } from "vitest";

import {
  buildSendRequest,
  normalizeWhatsAppNumber,
  parseSendResponse,
  WhatsAppConfigError,
  type WhatsAppConfig,
} from "@/lib/whatsapp/providers";

const waba: WhatsAppConfig = {
  provider: "WABA",
  apiKey: "EAAtoken",
  phoneNumberId: "1234567890",
  apiBaseUrl: "",
  graphVersion: "v25.0",
};

const onesender: WhatsAppConfig = {
  provider: "ONESENDER",
  apiKey: "gw-key",
  phoneNumberId: "device-1",
  apiBaseUrl: "https://wa.contoh.com",
  graphVersion: "v25.0",
};

const starsender: WhatsAppConfig = {
  provider: "STARSENDER",
  apiKey: "ss-key",
  phoneNumberId: "",
  apiBaseUrl: "",
  graphVersion: "v25.0",
};

describe("normalizeWhatsAppNumber", () => {
  it("strips punctuation and the leading plus", () => {
    expect(normalizeWhatsAppNumber("+62 812-3456-7890")).toBe("6281234567890");
  });

  it("rewrites Indonesian local notation to the country code", () => {
    // The single most common reason a message silently never arrives.
    expect(normalizeWhatsAppNumber("081234567890")).toBe("6281234567890");
  });

  it("honours a different default country code", () => {
    expect(normalizeWhatsAppNumber("0412345678", "61")).toBe("61412345678");
  });

  it("rejects input with no usable digits or too few of them", () => {
    expect(normalizeWhatsAppNumber("halo")).toBeNull();
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
  });
});

describe("buildSendRequest — WABA", () => {
  it("targets the versioned Cloud API messages endpoint", () => {
    const request = buildSendRequest(waba, "6281234567890", "Halo");

    expect(request.url).toBe(
      "https://graph.facebook.com/v25.0/1234567890/messages"
    );
    expect(request.headers.authorization).toBe("Bearer EAAtoken");
    expect(JSON.parse(request.body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6281234567890",
      type: "text",
      text: { preview_url: false, body: "Halo" },
    });
  });

  it("falls back to a known graph version when none is stored", () => {
    const request = buildSendRequest(
      { ...waba, graphVersion: "" },
      "6281234567890",
      "Halo"
    );
    expect(request.url).toContain("/v25.0/");
  });

  it("refuses to build a call without a phone number id", () => {
    expect(() =>
      buildSendRequest({ ...waba, phoneNumberId: "" }, "628123", "Halo")
    ).toThrow(WhatsAppConfigError);
  });
});

describe("buildSendRequest — OneSender", () => {
  it("appends the documented path to the operator's host", () => {
    const request = buildSendRequest(onesender, "6281234567890", "Halo");

    expect(request.url).toBe("https://wa.contoh.com/api/v1/messages");
    expect(request.headers.authorization).toBe("Bearer gw-key");
    // Cloud-API shaped, minus messaging_product.
    expect(JSON.parse(request.body)).toEqual({
      recipient_type: "individual",
      to: "6281234567890",
      type: "text",
      text: { body: "Halo" },
    });
  });

  it("does not double the path when a full endpoint URL was pasted", () => {
    const request = buildSendRequest(
      { ...onesender, apiBaseUrl: "https://wa.contoh.com/api/v1/messages/" },
      "6281234567890",
      "Halo"
    );
    expect(request.url).toBe("https://wa.contoh.com/api/v1/messages");
  });

  it("refuses to build a call without the self-hosted endpoint", () => {
    expect(() =>
      buildSendRequest({ ...onesender, apiBaseUrl: "" }, "628123456", "Halo")
    ).toThrow(WhatsAppConfigError);
  });
});

describe("buildSendRequest — StarSender", () => {
  it("uses the hosted endpoint and a raw Authorization key", () => {
    const request = buildSendRequest(starsender, "6281234567890", "Halo");

    expect(request.url).toBe("https://api.starsender.online/api/send");
    // No Bearer prefix — StarSender takes the key verbatim.
    expect(request.headers.authorization).toBe("ss-key");
    expect(JSON.parse(request.body)).toEqual({
      messageType: "text",
      to: "6281234567890",
      body: "Halo",
    });
  });

  it("needs no endpoint URL from the operator", () => {
    expect(() => buildSendRequest(starsender, "628123456", "Halo")).not.toThrow();
  });
});

describe("buildSendRequest — every provider", () => {
  it("refuses to build any call without an API key", () => {
    for (const config of [waba, onesender, starsender]) {
      expect(() =>
        buildSendRequest({ ...config, apiKey: "" }, "628123456", "Halo")
      ).toThrow(WhatsAppConfigError);
    }
  });
});

describe("parseSendResponse — WABA", () => {
  it("reads the message id out of a successful reply", () => {
    const outcome = parseSendResponse(
      "WABA",
      200,
      JSON.stringify({
        messaging_product: "whatsapp",
        messages: [{ id: "wamid.ABC" }],
      })
    );

    expect(outcome).toEqual({ ok: true, providerMessageId: "wamid.ABC" });
  });

  it("treats a 200 that accepted nothing as a failure", () => {
    const outcome = parseSendResponse("WABA", 200, JSON.stringify({ messages: [] }));
    expect(outcome.ok).toBe(false);
  });

  it("surfaces Meta's own error message", () => {
    const outcome = parseSendResponse(
      "WABA",
      400,
      JSON.stringify({ error: { message: "Invalid parameter", code: 100 } })
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain("Invalid parameter");
    expect(outcome.ok === false && outcome.error).toContain("400");
  });
});

describe("parseSendResponse — OneSender & StarSender", () => {
  it("accepts a 200 and picks up whichever id field is present", () => {
    expect(
      parseSendResponse("ONESENDER", 200, JSON.stringify({ id: "abc" }))
    ).toEqual({ ok: true, providerMessageId: "abc" });

    expect(
      parseSendResponse(
        "STARSENDER",
        200,
        JSON.stringify({ data: { messageId: "xyz" } })
      )
    ).toEqual({ ok: true, providerMessageId: "xyz" });
  });

  it("catches a failure reported inside a 200 response", () => {
    // These gateways routinely answer 200 with an error in the body.
    const outcome = parseSendResponse(
      "ONESENDER",
      200,
      JSON.stringify({ success: false, message: "device offline" })
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain("device offline");
  });

  it("treats a string status of error as a failure", () => {
    const outcome = parseSendResponse(
      "STARSENDER",
      200,
      JSON.stringify({ status: "error", reason: "quota habis" })
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain("quota habis");
  });

  it("succeeds without an id rather than inventing one", () => {
    expect(
      parseSendResponse("ONESENDER", 200, JSON.stringify({ success: true }))
    ).toEqual({ ok: true, providerMessageId: null });
  });

  it("keeps a non-JSON error body so the operator can see it", () => {
    const outcome = parseSendResponse("ONESENDER", 502, "<html>Bad Gateway</html>");

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain("Bad Gateway");
  });
});
