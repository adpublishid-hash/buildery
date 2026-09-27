import { describe, expect, it } from "vitest";

import { integrationSettingSchema } from "@/lib/zod";

describe("integrationSettingSchema", () => {
  it("accepts GA4 measurement IDs", () => {
    const parsed = integrationSettingSchema.safeParse({
      googleAnalyticsId: "G-ABCDE12345",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects legacy Universal Analytics IDs", () => {
    const parsed = integrationSettingSchema.safeParse({
      googleAnalyticsId: "UA-12345678-1",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires sender settings when Mailketing is enabled", () => {
    const parsed = integrationSettingSchema.safeParse({
      mailketingEnabled: true,
      mailketingApiToken: "token",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.mailketingSenderEmail?.[0]).toBe(
        "Required when Mailketing is enabled"
      );
    }
  });

  it("accepts complete Mailketing settings", () => {
    const parsed = integrationSettingSchema.safeParse({
      mailketingEnabled: true,
      mailketingApiToken: "token",
      mailketingSenderName: "Brand",
      mailketingSenderEmail: "sender@example.com",
    });

    expect(parsed.success).toBe(true);
  });

  it("requires OAuth2 credentials when Gmail email is enabled", () => {
    const parsed = integrationSettingSchema.safeParse({
      gmailOAuthEnabled: true,
      gmailSenderEmail: "owner@example.com",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.gmailRefreshToken?.[0]).toBe(
        "Required when Gmail OAuth2 is enabled"
      );
    }
  });

  it("accepts complete Gmail OAuth2 email settings", () => {
    const parsed = integrationSettingSchema.safeParse({
      gmailOAuthEnabled: true,
      gmailSenderEmail: "owner@example.com",
      gmailSenderName: "Owner",
      gmailClientId: "client.apps.googleusercontent.com",
      gmailClientSecret: "secret",
      gmailRefreshToken: "refresh-token",
    });

    expect(parsed.success).toBe(true);
  });

  it("requires Telegram bot settings when Telegram notifications are enabled", () => {
    const parsed = integrationSettingSchema.safeParse({
      telegramEnabled: true,
      telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.telegramChatId?.[0]).toBe(
        "Required when Telegram notifications are enabled"
      );
    }
  });

  it("accepts complete Telegram notification settings", () => {
    const parsed = integrationSettingSchema.safeParse({
      telegramEnabled: true,
      telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
      telegramChatId: "-1001234567890",
      telegramMessageThreadId: "42",
    });

    expect(parsed.success).toBe(true);
  });
});
