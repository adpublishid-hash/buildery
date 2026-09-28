import { describe, expect, it } from "vitest";

import {
  brevoSend,
  brevoUpsertContact,
  kirimEmailSend,
  listmonkCreateSubscriber,
  listmonkSend,
  resendSend,
  sesSend,
  signAwsRequest,
  sigV4SigningKey,
  textToHtml,
} from "@/lib/integrations/email/requests";

const email = { to: "buyer@example.com", subject: "Order paid", text: "Thanks <3", replyTo: "help@store.com" };
const from = { fromEmail: "hello@store.com", fromName: "My Store" };

describe("AWS SigV4", () => {
  it("derives the signing key from AWS's published example", () => {
    // docs.aws.amazon.com/IAM/latest/UserGuide/signing-elements.html example values.
    const key = sigV4SigningKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam");
    expect(key.toString("hex")).toBe("f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
  });

  it("signs a request with a credential scope for the region and service", () => {
    const headers = signAwsRequest({
      method: "POST",
      host: "email.ap-southeast-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      body: "{}",
      region: "ap-southeast-1",
      service: "ses",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-09-28T10:20:30.000Z"),
    });
    expect(headers["x-amz-date"]).toBe("20260928T102030Z");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260928\/ap-southeast-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );
  });

  it("builds an SES v2 SendEmail call with text and reply-to", () => {
    const request = sesSend({ ...from, region: "ap-southeast-1", accessKeyId: "AKID" }, { secretAccessKey: "s" }, email);
    expect(request.url).toBe("https://email.ap-southeast-1.amazonaws.com/v2/email/outbound-emails");
    const body = JSON.parse(request.body!);
    expect(body.FromEmailAddress).toBe("My Store <hello@store.com>");
    expect(body.Destination.ToAddresses).toEqual(["buyer@example.com"]);
    expect(body.ReplyToAddresses).toEqual(["help@store.com"]);
    expect(body.Content.Simple.Body.Text.Data).toBe("Thanks <3");
    expect(request.headers.host).toBeUndefined();
  });
});

describe("transactional providers", () => {
  it("Resend uses a bearer key and reply_to", () => {
    const request = resendSend(from, { apiKey: "re_123" }, email);
    expect(request.headers.Authorization).toBe("Bearer re_123");
    expect(JSON.parse(request.body!)).toMatchObject({ from: "My Store <hello@store.com>", to: ["buyer@example.com"], reply_to: "help@store.com" });
  });

  it("Brevo always sends HTML, escaping plain text", () => {
    const body = JSON.parse(brevoSend(from, { apiKey: "xkeysib" }, email).body!);
    expect(body.sender).toEqual({ email: "hello@store.com", name: "My Store" });
    expect(body.htmlContent).toContain("Thanks &lt;3");
    expect(body.replyTo).toEqual({ email: "help@store.com" });
  });

  it("Kirim.Email uses Basic auth and the domain message endpoint", () => {
    const request = kirimEmailSend({ ...from, apiKey: "user", domain: "store.com" }, { apiSecret: "token" }, email);
    expect(request.url).toBe("https://smtp-app.kirim.email/api/domains/store.com/message");
    expect(request.headers.Authorization).toBe(`Basic ${Buffer.from("user:token").toString("base64")}`);
    expect(JSON.parse(request.body!)).toMatchObject({ from: "hello@store.com", from_name: "My Store", to: "buyer@example.com" });
  });

  it("Listmonk sends in external mode through the configured template", () => {
    const request = listmonkSend({ baseUrl: "https://lm.store.com", apiUser: "api", templateId: "7" }, { apiToken: "tok" }, email);
    expect(request.url).toBe("https://lm.store.com/api/tx");
    expect(request.headers.Authorization).toBe("token api:tok");
    expect(JSON.parse(request.body!)).toMatchObject({ subscriber_mode: "external", subscriber_emails: ["buyer@example.com"], template_id: 7, subject: "Order paid" });
  });
});

describe("newsletter contacts", () => {
  it("skips providers without a list configured", () => {
    expect(brevoUpsertContact({}, { apiKey: "k" }, { email: "a@b.co" })).toBeNull();
    expect(listmonkCreateSubscriber({ baseUrl: "https://x", apiUser: "u" }, { apiToken: "t" }, { email: "a@b.co" })).toBeNull();
  });

  it("upserts into the configured list", () => {
    expect(JSON.parse(brevoUpsertContact({ listId: "4" }, { apiKey: "k" }, { email: "a@b.co", name: "Ana" })!.body!)).toEqual({
      email: "a@b.co",
      attributes: { FIRSTNAME: "Ana" },
      listIds: [4],
      updateEnabled: true,
    });
    expect(JSON.parse(listmonkCreateSubscriber({ baseUrl: "https://x", apiUser: "u", listId: "2" }, { apiToken: "t" }, { email: "a@b.co" })!.body!)).toMatchObject({
      name: "a",
      lists: [2],
      preconfirm_subscriptions: true,
    });
  });

  it("escapes HTML when wrapping text", () => {
    expect(textToHtml("<b>&")).toContain("&lt;b&gt;&amp;");
  });
});
