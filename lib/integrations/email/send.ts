import "server-only";

import { reportError } from "@/lib/error-reporting";

import { getEnabledConnections, recordInboundEvent, type LoadedConnection } from "../connections";
import { asTestResult, providerFetch, type TestResult } from "../http";
import {
  brevoSend,
  brevoUpsertContact,
  kirimEmailSend,
  listmonkCreateSubscriber,
  listmonkHealth,
  listmonkSend,
  resendSend,
  sesAccount,
  sesSend,
  type HttpRequest,
  type OutgoingEmail,
} from "./requests";

export const EMAIL_PROVIDER_IDS = ["resend", "brevo", "amazon_ses", "kirim_email", "listmonk"] as const;

function buildSend(connection: LoadedConnection, email: OutgoingEmail): HttpRequest {
  const { config, secrets } = connection;
  switch (connection.provider.id) {
    case "resend":
      return resendSend(config, secrets, email);
    case "brevo":
      return brevoSend(config, secrets, email);
    case "amazon_ses":
      return sesSend(config, secrets, email);
    case "kirim_email":
      return kirimEmailSend(config, secrets, email);
    case "listmonk":
      return listmonkSend(config, secrets, email);
    default:
      throw new Error(`${connection.provider.name} cannot send email.`);
  }
}

async function run(connection: LoadedConnection, request: HttpRequest) {
  return providerFetch(connection.provider.name, request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

/** Sends one message through a connected email provider. Throws ProviderError on failure. */
export async function sendEmailWithConnection(connection: LoadedConnection, email: OutgoingEmail) {
  const result = await run(connection, buildSend(connection, email));
  // Listmonk answers 200 {"data": false} when it could not queue the message.
  if (connection.provider.id === "listmonk" && result && typeof result === "object" && (result as { data?: unknown }).data === false) {
    throw new Error("Listmonk did not accept the message. Check the transactional template ID.");
  }
}

/**
 * Proves the credentials by sending a real test email to the operator. Cheap
 * read-only checks run first where the provider has one, so a bad key fails
 * with a clear message before anything is sent.
 */
export async function testEmailConnection(connection: LoadedConnection, operatorEmail: string): Promise<TestResult> {
  return asTestResult(async () => {
    if (connection.provider.id === "amazon_ses") {
      const account = await run(connection, sesAccount(connection.config, connection.secrets));
      const sending = (account as { SendingEnabled?: boolean; ProductionAccessEnabled?: boolean }) ?? {};
      if (sending.SendingEnabled === false) throw new Error("Amazon SES reports that sending is disabled for this account.");
      if (sending.ProductionAccessEnabled === false) {
        // Sandbox accounts can only send to verified addresses; say so up front.
        await sendEmailWithConnection(connection, testEmail(connection, operatorEmail));
        return `Test email sent to ${operatorEmail}. Note: this SES account is in the sandbox, so it can only email verified addresses.`;
      }
    }
    if (connection.provider.id === "listmonk") await run(connection, listmonkHealth(connection.config, connection.secrets));
    await sendEmailWithConnection(connection, testEmail(connection, operatorEmail));
    return `Test email sent to ${operatorEmail}.`;
  });
}

function testEmail(connection: LoadedConnection, to: string): OutgoingEmail {
  return {
    to,
    subject: `Test email via ${connection.provider.name}`,
    text: `This test confirms ${connection.provider.name} is connected and can deliver your store's emails.`,
  };
}

/**
 * Adds a person to the newsletter list of every connected provider that has
 * one configured. Never throws: a failed sync must not break checkout or a
 * form submission; the error is shown on the integration instead.
 */
export async function syncNewsletterContact(workspaceId: string, contact: { email: string; name?: string | null }) {
  const email = contact.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  let connections: LoadedConnection[];
  try {
    connections = await getEnabledConnections(workspaceId, "EMAIL");
  } catch (error) {
    reportError("newsletter sync lookup failed", error);
    return;
  }
  await Promise.all(
    connections.map(async (connection) => {
      const input = { email, name: contact.name?.trim() || undefined };
      const request =
        connection.provider.id === "brevo"
          ? brevoUpsertContact(connection.config, connection.secrets, input)
          : connection.provider.id === "listmonk"
            ? listmonkCreateSubscriber(connection.config, connection.secrets, input)
            : null;
      if (!request) return;
      try {
        await run(connection, request);
      } catch (error) {
        // Listmonk answers 409 when the email is already subscribed: that's success.
        if (connection.provider.id === "listmonk" && error instanceof Error && /\b409\b/.test(error.message)) return;
        await recordInboundEvent(connection.id, `Newsletter sync failed: ${error instanceof Error ? error.message : String(error)}`).catch(() => {});
      }
    })
  );
}
