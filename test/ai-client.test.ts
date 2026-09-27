import { describe, expect, it } from "vitest";

import { extractJsonObject, readErrorEnvelope } from "@/lib/ai/client";

describe("extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonObject('{"ok":true}')).toEqual({ ok: true });
  });

  it("unwraps a markdown fence, which models emit even in JSON mode", () => {
    expect(extractJsonObject('```json\n{"city":"Jakarta"}\n```')).toEqual({
      city: "Jakarta",
    });
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("digs the object out of surrounding prose", () => {
    expect(
      extractJsonObject('Here you go:\n{"a":1}\nHope that helps.')
    ).toEqual({ a: 1 });
  });

  it("returns null when there is no object to find", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("readErrorEnvelope", () => {
  // kie.ai answers HTTP 200 and puts the failure in the body, so a 2xx alone
  // never means the call succeeded.
  it("detects the error envelope returned alongside HTTP 200", () => {
    const message = readErrorEnvelope({
      code: 422,
      msg: "response_format.json_schema is required",
      data: null,
    });
    expect(message).toContain("422");
    expect(message).toContain("json_schema");
  });

  it("maps auth, billing, and rate-limit codes to actionable copy", () => {
    expect(readErrorEnvelope({ code: 401 })).toContain("KIE_API_KEY");
    expect(readErrorEnvelope({ code: 402 })).toContain("Saldo");
    expect(readErrorEnvelope({ code: 429 })).toContain("rate limit");
  });

  it("passes a real completion through untouched", () => {
    expect(
      readErrorEnvelope({
        id: "chatcmpl-1",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "{}" } }],
      })
    ).toBeNull();
    expect(readErrorEnvelope({ code: 200 })).toBeNull();
  });
});
