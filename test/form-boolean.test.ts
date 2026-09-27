import { describe, expect, it } from "vitest";

import { integrationSettingSchema } from "@/lib/zod";

/**
 * Forms post booleans as strings. `z.coerce.boolean()` is `Boolean(value)`, so
 * "false" arrived as **true**: a toggle could be switched on but never off, and
 * the integrations form rejected every save on a workspace with nothing
 * enabled, because the schema believed Mailketing, Telegram and Gmail were all
 * turned on and demanded their credentials.
 */

const EMPTY_INTEGRATIONS = {
  metaPixelId: "",
  metaCapiEnabled: "false",
  metaCapiAccessToken: "",
  metaCapiTestEventCode: "",
  tiktokPixelId: "",
  tiktokEventsApiEnabled: "false",
  tiktokAccessToken: "",
  tiktokTestEventCode: "",
  googleAnalyticsApiSecret: "",
  googleAdsConversionId: "",
  googleAdsPurchaseLabel: "",
  adConsentRequired: "false",
  googleAnalyticsId: "",
  googleTagManagerId: "",
  googleSearchConsoleVerification: "",
  customHeadScript: "",
  mailketingEnabled: "false",
  mailketingApiToken: "",
  mailketingSenderName: "",
  mailketingSenderEmail: "",
  gmailOAuthEnabled: "false",
  gmailSenderEmail: "",
  gmailSenderName: "",
  gmailClientId: "",
  gmailClientSecret: "",
  gmailRefreshToken: "",
  telegramEnabled: "false",
  telegramBotToken: "",
  telegramChatId: "",
  telegramMessageThreadId: "",
  whatsappProvider: "",
  whatsappApiKey: "",
  whatsappSenderNumber: "",
  whatsappPhoneNumberId: "",
  whatsappWebhookVerifyToken: "",
  whatsappWebhookSecret: "",
  whatsappIsActive: "false",
};

describe("form booleans", () => {
  it('reads "false" as off, so an untouched integrations form saves', () => {
    const parsed = integrationSettingSchema.safeParse(EMPTY_INTEGRATIONS);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.mailketingEnabled).toBe(false);
    expect(parsed.data.telegramEnabled).toBe(false);
    expect(parsed.data.gmailOAuthEnabled).toBe(false);
    expect(parsed.data.metaCapiEnabled).toBe(false);
    expect(parsed.data.whatsappIsActive).toBe(false);
  });

  it('still reads "true" and checkbox "on" as on', () => {
    const parsed = integrationSettingSchema.safeParse({
      ...EMPTY_INTEGRATIONS,
      telegramEnabled: "true",
      telegramBotToken: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      telegramChatId: "-1001234567890",
      adConsentRequired: "on",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.telegramEnabled).toBe(true);
    expect(parsed.data.adConsentRequired).toBe(true);
  });

  it("keeps a required toggle's dependent fields required when it is on", () => {
    const parsed = integrationSettingSchema.safeParse({
      ...EMPTY_INTEGRATIONS,
      mailketingEnabled: "true",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts real booleans and a missing field", () => {
    const { telegramEnabled, whatsappIsActive, ...withoutSomeToggles } =
      EMPTY_INTEGRATIONS;
    void telegramEnabled;
    void whatsappIsActive;

    const parsed = integrationSettingSchema.safeParse({
      ...withoutSomeToggles,
      // The action falls back to a real `false` when the field is absent.
      metaCapiEnabled: false,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.metaCapiEnabled).toBe(false);
    expect(parsed.data.telegramEnabled).toBe(false);
    expect(parsed.data.whatsappIsActive).toBe(false);
  });
});
