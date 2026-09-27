import "server-only";

const MAILKETING_SEND_ENDPOINT = "https://api.mailketing.co.id/api/v1/send";

export type MailketingConfig = {
  apiToken: string;
  senderName: string;
  senderEmail: string;
};

export type MailketingMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type MailketingResponse = {
  status?: string;
  response?: string;
};

export async function sendMailketingEmail(
  config: MailketingConfig,
  message: MailketingMessage
) {
  const body = new URLSearchParams({
    api_token: config.apiToken,
    from_name: config.senderName,
    from_email: config.senderEmail,
    recipient: message.to,
    subject: message.subject,
    content: message.html || message.text,
  });

  const res = await fetch(MAILKETING_SEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(
      `Mailketing ${res.status}: ${text.slice(0, 300) || "request failed"}`
    );
  }

  let json: MailketingResponse | null = null;
  try {
    json = JSON.parse(text) as MailketingResponse;
  } catch {
    throw new Error(`Mailketing invalid response: ${text.slice(0, 300)}`);
  }

  if (json.status !== "success") {
    throw new Error(
      `Mailketing failed: ${json.response || json.status || "unknown error"}`
    );
  }
}
