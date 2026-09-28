import { describe, expect, it } from "vitest";

import { decryptSecrets, encryptSecrets, newWebhookKey } from "@/lib/integrations/crypto";
import { getProvider, PROVIDERS, validateProviderInput } from "@/lib/integrations/registry";

describe("integration secret encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = encryptSecrets({ apiKey: "re_super_secret_value", empty: "" })!;
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("re_super_secret_value");
    expect(decryptSecrets(sealed)).toEqual({ apiKey: "re_super_secret_value" });
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecrets({ a: "x" })).not.toBe(encryptSecrets({ a: "x" }));
  });

  it("returns nothing for tampered or foreign values", () => {
    const sealed = encryptSecrets({ a: "x" })!;
    const [v, iv, tag, data] = sealed.split(".");
    const flipped = data.slice(0, -1) + (data.endsWith("A") ? "B" : "A");
    expect(decryptSecrets([v, iv, tag, flipped].join("."))).toEqual({});
    expect(decryptSecrets("plaintext")).toEqual({});
    expect(encryptSecrets({})).toBeNull();
  });

  it("makes unguessable webhook keys", () => {
    const key = newWebhookKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newWebhookKey()).not.toBe(key);
  });
});

describe("provider registry", () => {
  it("has unique ids and at least one field per provider", () => {
    const ids = PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of PROVIDERS) {
      expect(provider.fields.length).toBeGreaterThan(0);
      expect(new Set(provider.fields.map((field) => field.key)).size).toBe(provider.fields.length);
    }
  });

  it("separates secrets from config and applies defaults", () => {
    const ses = getProvider("amazon_ses")!;
    const result = validateProviderInput(ses, {
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      fromEmail: "hi@store.com",
    });
    expect(result).toEqual({
      ok: true,
      config: { accessKeyId: "AKIA", region: "ap-southeast-1", fromEmail: "hi@store.com" },
      secrets: { secretAccessKey: "shh" },
    });
  });

  it("requires secrets only when none is stored", () => {
    const resend = getProvider("resend")!;
    const input = { fromEmail: "hi@store.com" };
    expect(validateProviderInput(resend, input).ok).toBe(false);
    expect(validateProviderInput(resend, input, new Set(["apiKey"])).ok).toBe(true);
  });

  it("rejects malformed urls, emails, numbers, and unknown select values", () => {
    const listmonk = getProvider("listmonk")!;
    const bad = validateProviderInput(listmonk, {
      baseUrl: "javascript:alert(1)",
      apiUser: "u",
      apiToken: "t",
      templateId: "abc",
      fromEmail: "nope",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["baseUrl", "fromEmail", "templateId"]);
    const paypal = getProvider("paypal")!;
    const mode = validateProviderInput(paypal, { mode: "staging", clientId: "c", clientSecret: "s", currency: "USD", exchangeRate: "16000" });
    expect(mode.ok).toBe(false);
  });

  it("strips a trailing slash from URLs", () => {
    const result = validateProviderInput(getProvider("listmonk")!, {
      baseUrl: "https://lm.store.com/",
      apiUser: "u",
      apiToken: "t",
      templateId: "3",
    });
    expect(result.ok && result.config.baseUrl).toBe("https://lm.store.com");
  });
});
