import { describe, expect, it } from "vitest";

import {
  CLEAR_SECRET_SUFFIX,
  ECOMMERCE_SECRET_FIELDS,
  resolveSecretUpdate,
  secretHint,
  withoutEcommerceSecrets,
} from "@/lib/secret-fields";
import { INTEGRATION_SECRET_FIELDS } from "@/lib/integration-secrets";

describe("secretHint", () => {
  it("returns null when nothing is stored", () => {
    expect(secretHint(null)).toBeNull();
    expect(secretHint("")).toBeNull();
    expect(secretHint("   ")).toBeNull();
  });

  it("shows only the last four characters of a long secret", () => {
    expect(secretHint("SB-Mid-server-abcdefgh1234")).toBe("••••1234");
  });

  it("reveals nothing of a short secret", () => {
    // A four-character tail of an eight-character token is half the token.
    expect(secretHint("abcd1234")).toBe("••••");
  });

  it("never contains the secret itself", () => {
    const secret = "EAABsbCS1iHgBAKZC0ZBsecretvalue9876";
    expect(secretHint(secret)).not.toContain("secretvalue");
  });
});

describe("resolveSecretUpdate", () => {
  it("keeps the stored value when the field comes back blank", () => {
    expect(resolveSecretUpdate("", null)).toBeUndefined();
    expect(resolveSecretUpdate("   ", null)).toBeUndefined();
    expect(resolveSecretUpdate(null, null)).toBeUndefined();
  });

  it("replaces the stored value with a newly typed one", () => {
    expect(resolveSecretUpdate("  new-key  ", null)).toBe("new-key");
  });

  it("clears only on the explicit flag", () => {
    expect(resolveSecretUpdate("", "true")).toBeNull();
  });

  it("lets the clear flag win over a typed value", () => {
    // Ticking "delete" and typing in the same save is ambiguous; deleting is
    // the safer reading of an explicit request.
    expect(resolveSecretUpdate("typed", "true")).toBeNull();
  });

  it("ignores any clear flag value other than true", () => {
    expect(resolveSecretUpdate("", "false")).toBeUndefined();
    expect(resolveSecretUpdate("", "on")).toBeUndefined();
  });

  it("uses a stable form-field suffix for the clear flag", () => {
    expect(`midtransServerKey${CLEAR_SECRET_SUFFIX}`).toBe("midtransServerKey__clear");
  });
});

describe("withoutEcommerceSecrets", () => {
  const row = {
    id: "set_1",
    workspaceId: "ws_1",
    currencyCode: "IDR",
    midtransServerKey: "SB-Mid-server-abcdefgh1234",
    midtransClientKey: "SB-Mid-client-zyxwvuts5678",
    rajaOngkirApiKey: null,
    shippingAggregatorApiKey: "komerce-key-000011112222",
  };

  it("removes every credential column from what reaches the browser", () => {
    const { publicSetting } = withoutEcommerceSecrets(row);
    for (const field of ECOMMERCE_SECRET_FIELDS) {
      expect(publicSetting).not.toHaveProperty(field);
    }
    expect(JSON.stringify(publicSetting)).not.toContain("SB-Mid");
    expect(JSON.stringify(publicSetting)).not.toContain("komerce-key");
  });

  it("keeps the non-secret settings intact", () => {
    const { publicSetting } = withoutEcommerceSecrets(row);
    expect(publicSetting).toMatchObject({
      id: "set_1",
      workspaceId: "ws_1",
      currencyCode: "IDR",
    });
  });

  it("reports which credentials are stored", () => {
    const { hints } = withoutEcommerceSecrets(row);
    expect(hints).toEqual({
      midtransServerKey: "••••1234",
      midtransClientKey: "••••5678",
      rajaOngkirApiKey: null,
      shippingAggregatorApiKey: "••••2222",
    });
  });

  it("does not mutate the row it was given", () => {
    withoutEcommerceSecrets(row);
    expect(row.midtransServerKey).toBe("SB-Mid-server-abcdefgh1234");
  });
});

describe("integration secret list", () => {
  it("covers every credential the integrations form handles", () => {
    expect([...INTEGRATION_SECRET_FIELDS].sort()).toEqual(
      [
        "gmailClientSecret",
        "gmailRefreshToken",
        "mailketingApiToken",
        "metaCapiAccessToken",
        "telegramBotToken",
        "tiktokAccessToken",
        "googleAnalyticsApiSecret",
        "whatsappApiKey",
        "whatsappWebhookSecret",
        "whatsappWebhookVerifyToken",
      ].sort()
    );
  });
});
