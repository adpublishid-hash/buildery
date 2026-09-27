import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMailketingEmail } from "@/lib/mailketing";

describe("sendMailketingEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts Mailketing form parameters", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ status: "success", response: "Mail Sent" }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendMailketingEmail(
      {
        apiToken: "token",
        senderName: "Brand",
        senderEmail: "sender@example.com",
      },
      {
        to: "customer@example.com",
        subject: "Order paid",
        text: "Thanks",
        html: "<strong>Thanks</strong>",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mailketing.co.id/api/v1/send",
      expect.objectContaining({ method: "POST" })
    );
    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    const init = calls[0][1];
    const body = init.body as URLSearchParams;
    expect(body.get("api_token")).toBe("token");
    expect(body.get("from_name")).toBe("Brand");
    expect(body.get("from_email")).toBe("sender@example.com");
    expect(body.get("recipient")).toBe("customer@example.com");
    expect(body.get("subject")).toBe("Order paid");
    expect(body.get("content")).toBe("<strong>Thanks</strong>");
  });

  it("throws failed Mailketing responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: "failed",
            response: "Unknown Sender, Please Add your Sender Email at Add Domain Menu",
          }),
          { status: 200 }
        );
      })
    );

    await expect(
      sendMailketingEmail(
        {
          apiToken: "token",
          senderName: "Brand",
          senderEmail: "sender@example.com",
        },
        {
          to: "customer@example.com",
          subject: "Order paid",
          text: "Thanks",
        }
      )
    ).rejects.toThrow("Unknown Sender");
  });
});
