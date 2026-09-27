import { describe, expect, it } from "vitest";

import { buildGmailRawMessage } from "@/lib/gmail-oauth";

function decodeRaw(raw: string) {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

describe("buildGmailRawMessage", () => {
  it("creates a base64url encoded MIME message for Gmail API", () => {
    const raw = buildGmailRawMessage(
      {
        clientId: "client",
        clientSecret: "secret",
        refreshToken: "refresh",
        senderEmail: "owner@example.com",
        senderName: "Owner",
      },
      {
        to: "customer@example.com",
        subject: "Order paid",
        text: "Thanks",
        html: "<strong>Thanks</strong>",
        replyTo: "support@example.com",
      }
    );
    const mime = decodeRaw(raw);

    expect(raw).not.toMatch(/[+/=]/);
    expect(mime).toContain('From: "Owner" <owner@example.com>');
    expect(mime).toContain("To: customer@example.com");
    expect(mime).toContain("Reply-To: support@example.com");
    expect(mime).toContain("Subject: Order paid");
    expect(mime).toContain("Content-Type: multipart/alternative");
  });

  it("sanitizes header line breaks", () => {
    const mime = decodeRaw(
      buildGmailRawMessage(
        {
          clientId: "client",
          clientSecret: "secret",
          refreshToken: "refresh",
          senderEmail: "owner@example.com",
        },
        {
          to: "customer@example.com\r\nBcc: hidden@example.com",
          subject: "Hello\r\nBcc: hidden@example.com",
          text: "Body",
        }
      )
    );

    expect(mime).not.toContain("\r\nBcc:");
    expect(mime).toContain("Subject: Hello Bcc: hidden@example.com");
  });
});
