import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  INTEGRATION_CREDENTIAL_COLUMNS,
  INTEGRATION_SECRET_FIELDS,
  isIntegrationCredentialColumn,
} from "@/lib/integration-secrets";
import { ECOMMERCE_SECRET_FIELDS, secretHint } from "@/lib/secret-fields";
import {
  changedSettingFields,
  describeSettingsChange,
  SENSITIVE_SETTING_FIELDS,
} from "@/lib/settings-audit";
import {
  isStaleSettingsWrite,
  SETTINGS_VERSION_FIELD,
} from "@/lib/settings-version";
import {
  currencySymbolPositionSchema,
  ecommerceSectionSchema,
  manualPaymentMethodTypeSchema,
  paymentTimeoutUnitSchema,
  stockDecrementTimingSchema,
} from "@/lib/zod";

function modelBlock(model: string): string {
  const schema = readFileSync(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  const start = schema.indexOf(`model ${model} {`);
  expect(start).toBeGreaterThan(-1);
  return schema.slice(start, schema.indexOf("\n}", start));
}

/** Nama kolom yang terbaca seperti kredensial. */
function credentialLookingColumns(block: string): string[] {
  const names: string[] = [];
  for (const line of block.split("\n").slice(1)) {
    const match = /^\s{2}(\w+)\s+\S/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (/(token|secret|apikey|password)$/i.test(name)) names.push(name);
  }
  return names;
}

describe("credential columns are registered", () => {
  it("covers every credential-looking column on IntegrationSetting", () => {
    // Penjaga regresi: kolom kredensial baru yang lupa didaftarkan akan
    // menggagalkan tes ini, bukan diam-diam ikut terkirim ke browser.
    const columns = credentialLookingColumns(modelBlock("IntegrationSetting"));
    expect(columns.length).toBeGreaterThan(5);

    const missing = columns.filter((name) => !isIntegrationCredentialColumn(name));
    expect(missing).toEqual([]);
  });

  it("keeps the legacy WhatsApp and OneSender credentials registered", () => {
    for (const column of [
      "whatsappAccessToken",
      "whatsappAppSecret",
      "oneSenderApiKey",
    ]) {
      expect(isIntegrationCredentialColumn(column)).toBe(true);
    }
  });

  it("does not offer legacy columns as writable form fields", () => {
    // Kolomnya rahasia, tapi tidak ada field-nya di form — keduanya benar.
    expect(INTEGRATION_SECRET_FIELDS).not.toContain("whatsappAppSecret");
    expect(INTEGRATION_CREDENTIAL_COLUMNS.length).toBeGreaterThan(
      INTEGRATION_SECRET_FIELDS.length
    );
  });

  it("treats every stored credential as sensitive for audit", () => {
    for (const field of [...INTEGRATION_SECRET_FIELDS, ...ECOMMERCE_SECRET_FIELDS]) {
      expect(SENSITIVE_SETTING_FIELDS.has(field)).toBe(true);
    }
  });
});

describe("secretHint", () => {
  it("reveals only the tail of a long secret", () => {
    expect(secretHint("SB-Mid-server-ABCDEFGH1234")).toBe("••••1234");
  });

  it("reveals nothing of a short secret", () => {
    expect(secretHint("short")).toBe("••••");
  });

  it("returns null when nothing is stored", () => {
    expect(secretHint(null)).toBeNull();
    expect(secretHint("   ")).toBeNull();
  });
});

describe("changedSettingFields", () => {
  it("lists only the fields that actually changed", () => {
    expect(
      changedSettingFields(
        { currencyCode: "IDR", decimalPlaces: 0 },
        { currencyCode: "USD", decimalPlaces: 0 }
      )
    ).toEqual(["currencyCode"]);
  });

  it("treats null and empty string as the same emptiness", () => {
    expect(
      changedSettingFields({ orderNumberPrefix: null }, { orderNumberPrefix: null })
    ).toEqual([]);
  });

  it("compares arrays by content", () => {
    expect(
      changedSettingFields(
        { shippingCouriers: ["jne"] },
        { shippingCouriers: ["jne", "sicepat"] }
      )
    ).toEqual(["shippingCouriers"]);
  });

  it("handles a row that does not exist yet", () => {
    expect(changedSettingFields(null, { telegramChatId: "123" })).toEqual([
      "telegramChatId",
    ]);
  });
});

describe("describeSettingsChange", () => {
  it("flags when a credential was among the changes", () => {
    expect(
      describeSettingsChange("Integrasi", ["telegramChatId", "telegramBotToken"])
    ).toContain("termasuk kredensial");
  });

  it("stays quiet about credentials when none changed", () => {
    expect(describeSettingsChange("Integrasi", ["telegramChatId"])).not.toContain(
      "kredensial"
    );
  });

  it("never puts a secret value in the summary", () => {
    const summary = describeSettingsChange("Integrasi", ["telegramBotToken"]);
    expect(summary).toContain("telegramBotToken");
    expect(summary).not.toMatch(/\d{6,}/);
  });
});

describe("isStaleSettingsWrite", () => {
  const loaded = new Date("2026-09-19T10:00:00Z");

  it("rejects a save that started before someone else's change", () => {
    expect(
      isStaleSettingsWrite(loaded.toISOString(), new Date("2026-09-19T10:05:00Z"))
    ).toBe(true);
  });

  it("accepts a save from the current version", () => {
    expect(isStaleSettingsWrite(loaded.toISOString(), loaded)).toBe(false);
  });

  it("tolerates sub-second timestamp drift", () => {
    expect(
      isStaleSettingsWrite(
        loaded.toISOString(),
        new Date(loaded.getTime() + 400)
      )
    ).toBe(false);
  });

  it("lets older forms through rather than blocking a valid save", () => {
    expect(isStaleSettingsWrite(null, new Date())).toBe(false);
    expect(isStaleSettingsWrite("not-a-date", new Date())).toBe(false);
  });

  it("uses a stable field name the forms can rely on", () => {
    expect(SETTINGS_VERSION_FIELD).toBe("__loadedAt");
  });
});

describe("ecommerce settings enums", () => {
  it("accepts every section the form submits", () => {
    for (const section of [
      "general",
      "checkout",
      "payments",
      "shipping",
      "tax",
      "stock",
      "sound",
    ]) {
      expect(ecommerceSectionSchema.safeParse(section).success).toBe(true);
    }
  });

  it("rejects an unknown section instead of saving nothing", () => {
    expect(ecommerceSectionSchema.safeParse("payments2").success).toBe(false);
    expect(ecommerceSectionSchema.safeParse("").success).toBe(false);
  });

  it("rejects values that used to be cast straight into Prisma enums", () => {
    expect(manualPaymentMethodTypeSchema.safeParse("BANK").success).toBe(false);
    expect(currencySymbolPositionSchema.safeParse("MIDDLE").success).toBe(false);
    expect(paymentTimeoutUnitSchema.safeParse("WEEKS").success).toBe(false);
    expect(stockDecrementTimingSchema.safeParse("LATER").success).toBe(false);
  });

  it("accepts the real values", () => {
    expect(manualPaymentMethodTypeSchema.safeParse("QRIS").success).toBe(true);
    expect(stockDecrementTimingSchema.safeParse("PAID").success).toBe(true);
  });
});
