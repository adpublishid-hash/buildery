import "server-only";

import { sendGmailOAuthEmail } from "@/lib/gmail-oauth";
import { sendMailketingEmail } from "@/lib/mailketing";
import { prisma } from "@/lib/prisma";

export type EmailMessage = {
  workspaceId?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type EmailResult =
  | { ok: true; provider: "mailketing" | "gmail" | "resend" | "console" }
  | { ok: false; error: string };

/**
 * Sends workspace-owned transactional email to buyers/operators.
 * Workspace providers win in this order: Mailketing API, Gmail OAuth2.
 *
 * Platform/admin-to-user email must use sendAppEmail() instead, so the
 * platform SMTP credential is never used for a seller's buyer emails.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const workspaceEmail = message.workspaceId
    ? await getWorkspaceEmailConfig(message.workspaceId)
    : null;

  if (workspaceEmail?.mailketing) {
    try {
      await sendMailketingEmail(workspaceEmail.mailketing, message);
      return { ok: true, provider: "mailketing" };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Mailketing email send failed",
      };
    }
  }

  if (workspaceEmail?.gmail) {
    try {
      await sendGmailOAuthEmail(workspaceEmail.gmail, message);
      return { ok: true, provider: "gmail" };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Gmail email send failed",
      };
    }
  }

  if (message.workspaceId) {
    console.log(
      "[email] workspace provider missing workspaceId=%s to=%s subject=%s",
      message.workspaceId,
      message.to,
      message.subject
    );
    if (process.env.NODE_ENV !== "production") {
      console.log("[email] body:\n%s", message.text);
      return { ok: true, provider: "console" };
    }
    return {
      ok: false,
      error:
        "Workspace email provider is not configured. Enable Mailketing or Gmail OAuth2 in Integrations.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "notifications@mylanding.local";

  if (!apiKey) {
    console.log(
      "[email] (no provider — logging only) to=%s subject=%s",
      message.to,
      message.subject
    );
    if (process.env.NODE_ENV !== "production") {
      console.log("[email] body:\n%s", message.text);
    }
    return { ok: true, provider: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: message.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.slice(0, 300) || "request failed"}`,
      };
    }
    return { ok: true, provider: "resend" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email send failed",
    };
  }
}

async function getWorkspaceEmailConfig(workspaceId: string) {
  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      mailketingEnabled: true,
      mailketingApiToken: true,
      mailketingSenderName: true,
      mailketingSenderEmail: true,
      gmailOAuthEnabled: true,
      gmailClientId: true,
      gmailClientSecret: true,
      gmailRefreshToken: true,
      gmailSenderEmail: true,
      gmailSenderName: true,
    },
  });

  return {
    mailketing:
      integration?.mailketingEnabled &&
      integration.mailketingApiToken &&
      integration.mailketingSenderName &&
      integration.mailketingSenderEmail
        ? {
            apiToken: integration.mailketingApiToken,
            senderName: integration.mailketingSenderName,
            senderEmail: integration.mailketingSenderEmail,
          }
        : null,
    gmail:
      integration?.gmailOAuthEnabled &&
      integration.gmailClientId &&
      integration.gmailClientSecret &&
      integration.gmailRefreshToken &&
      integration.gmailSenderEmail
        ? {
            clientId: integration.gmailClientId,
            clientSecret: integration.gmailClientSecret,
            refreshToken: integration.gmailRefreshToken,
            senderEmail: integration.gmailSenderEmail,
            senderName: integration.gmailSenderName,
          }
        : null,
  };
}
