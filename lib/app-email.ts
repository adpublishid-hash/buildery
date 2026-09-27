import "server-only";

import { sendSmtpEmail, type SmtpEmailMessage } from "@/lib/smtp-email";

export type AppEmailMessage = SmtpEmailMessage;

export type AppEmailResult =
  | { ok: true; provider: "app-smtp" | "console" }
  | { ok: false; error: string };

/**
 * Sends platform-owned emails: verification codes, workspace invitations,
 * password/account notices, and other My Landing admin-to-user messages.
 *
 * Do not use this for workspace transactional email to buyers. Buyer/order/form
 * email must keep using workspace-owned providers from Integration settings.
 */
export async function sendAppEmail(
  message: AppEmailMessage
): Promise<AppEmailResult> {
  const config = getAppNotificationSmtpConfig();

  if (!config) {
    console.log(
      "[app-email] (no SMTP provider configured) to=%s subject=%s",
      message.to,
      message.subject
    );
    if (process.env.NODE_ENV !== "production") {
      console.log("[app-email] body:\n%s", message.text);
      return { ok: true, provider: "console" };
    }
    return {
      ok: false,
      error: "App notification SMTP is not configured.",
    };
  }

  try {
    await sendSmtpEmail(config, message);
    return { ok: true, provider: "app-smtp" };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "App notification email send failed.",
    };
  }
}

function getAppNotificationSmtpConfig() {
  const host = process.env.APP_NOTIFICATION_SMTP_HOST?.trim();
  const username = process.env.APP_NOTIFICATION_SMTP_USER?.trim();
  const password = process.env.APP_NOTIFICATION_SMTP_PASSWORD;
  const fromEmail = process.env.APP_NOTIFICATION_EMAIL_FROM?.trim();

  if (!host || !username || !password || !fromEmail) return null;

  const port = Number(process.env.APP_NOTIFICATION_SMTP_PORT || 587);
  const secure =
    process.env.APP_NOTIFICATION_SMTP_SECURE === "true" || port === 465;

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    username,
    password,
    fromEmail,
    fromName:
      process.env.APP_NOTIFICATION_EMAIL_NAME?.trim() ||
      process.env.NEXT_PUBLIC_APP_NAME ||
      "My Landing",
  };
}
