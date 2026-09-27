/**
 * Kredensial yang disimpan di IntegrationSetting.
 *
 * Ada dua daftar di sini karena ada dua pertanyaan berbeda:
 *
 * 1. Field mana yang boleh ditulis lewat form integrasi — itu
 *    INTEGRATION_SECRET_FIELDS, dan form meng-iterasinya.
 * 2. Kolom mana yang isinya kredensial dan karena itu tidak boleh sampai ke
 *    browser — itu INTEGRATION_CREDENTIAL_COLUMNS, yang lebih luas karena
 *    mencakup kolom warisan yang tidak lagi punya field di form.
 *
 * Menyatukan keduanya pernah membuat kolom warisan luput dari daftar rahasia:
 * aman selama tidak ada yang membacanya, tapi menunggu untuk bocor begitu ada
 * yang menampilkannya lagi.
 *
 * Client-safe: tidak ada import server.
 */

/** Kredensial yang punya field di form integrasi dan bisa ditulis dari sana. */
export const INTEGRATION_SECRET_FIELDS = [
  "metaCapiAccessToken",
  "tiktokAccessToken",
  "googleAnalyticsApiSecret",
  "mailketingApiToken",
  "gmailClientSecret",
  "gmailRefreshToken",
  "telegramBotToken",
  "whatsappApiKey",
  "whatsappWebhookVerifyToken",
  "whatsappWebhookSecret",
] as const;

export type IntegrationSecretField = (typeof INTEGRATION_SECRET_FIELDS)[number];

/**
 * Kolom warisan integrasi WhatsApp Cloud / OneSender. Tidak ada yang menulis
 * atau membacanya lagi, tapi isinya tetap kredensial.
 */
export const LEGACY_INTEGRATION_CREDENTIAL_COLUMNS = [
  "whatsappAccessToken",
  "whatsappAppSecret",
  "oneSenderApiKey",
] as const;

/**
 * Setiap kolom IntegrationSetting yang isinya kredensial. Pakai daftar ini
 * saat memutuskan apa yang boleh dikirim ke browser.
 */
export const INTEGRATION_CREDENTIAL_COLUMNS = [
  ...INTEGRATION_SECRET_FIELDS,
  ...LEGACY_INTEGRATION_CREDENTIAL_COLUMNS,
] as const;

export type IntegrationCredentialColumn =
  (typeof INTEGRATION_CREDENTIAL_COLUMNS)[number];

/** Apakah satu nama kolom menyimpan kredensial. */
export function isIntegrationCredentialColumn(
  name: string
): name is IntegrationCredentialColumn {
  return (INTEGRATION_CREDENTIAL_COLUMNS as readonly string[]).includes(name);
}
