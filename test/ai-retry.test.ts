import { afterEach, describe, expect, it, vi } from "vitest";

import { callGeminiJson } from "@/lib/ai/client";

const ORIGINAL_KEY = process.env.KIE_API_KEY;
process.env.KIE_API_KEY = "test-key";

/**
 * A Response body can only be read once, so every call must get a fresh one —
 * reusing a single Response makes the second read look like a malformed reply.
 */
function reply(body: unknown, status = 200) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
}

const completion = (content: string) => ({
  choices: [{ message: { role: "assistant", content } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env.KIE_API_KEY = ORIGINAL_KEY ?? "test-key";
});

const call = () =>
  callGeminiJson<{ a?: number }>({
    system: "s",
    user: "u",
    normalize: (raw) => raw as { a?: number },
  });

describe("callGeminiJson retry", () => {
  it("recovers from the empty body the provider intermittently returns", async () => {
    // Two empty replies then a real one — the exact failure seen in production.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(reply(completion("")))
      .mockImplementationOnce(reply(completion("")))
      .mockImplementationOnce(reply(completion('{"a":1}')));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).resolves.toMatchObject({ data: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 30_000);

  it("retries a 524 error envelope returned with HTTP 200", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(reply({ code: 524, msg: "2 times retry fail" }))
      .mockImplementationOnce(reply(completion('{"a":2}')));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).resolves.toMatchObject({ data: { a: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("retries a truncated reply that is not valid JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(reply(completion('{"a": ')))
      .mockImplementationOnce(reply(completion('{"a":3}')));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).resolves.toMatchObject({ data: { a: 3 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("gives up immediately on a rejected API key", async () => {
    // Retrying bad credentials only wastes the operator's time.
    const fetchMock = vi.fn().mockImplementation(reply({ code: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).rejects.toThrow(/KIE_API_KEY/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("gives up immediately when credit runs out", async () => {
    const fetchMock = vi.fn().mockImplementation(reply({ code: 402 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).rejects.toThrow(/Saldo/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("stops after the attempt budget and reports the provider's reason", async () => {
    const fetchMock = vi.fn().mockImplementation(reply(completion("")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).rejects.toThrow(/kosong/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 60_000);
});
