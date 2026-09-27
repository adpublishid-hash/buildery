import { describe, expect, it } from "vitest";

import { attachmentLabel, parseInboxWebhook } from "@/lib/whatsapp/inbox-parse";

/**
 * Attachments used to be dropped: only `text.body` was read, so a photo of a
 * damaged parcel produced no row at all. Status callbacks were worse — they
 * parsed to an empty message and the route answered 400, which made Meta
 * redeliver them forever.
 */

const waba = (message: Record<string, unknown>, contactName = "Budi") => ({
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ profile: { name: contactName } }],
            messages: [{ from: "6281234567890", id: "wamid.ABC", ...message }],
          },
        },
      ],
    },
  ],
});

describe("parseInboxWebhook — WhatsApp Cloud API", () => {
  it("reads a plain text message", () => {
    const parsed = parseInboxWebhook(
      waba({ type: "text", text: { body: "Halo, pesanan saya bagaimana?" } })
    );
    expect(parsed).toMatchObject({
      phone: "6281234567890",
      name: "Budi",
      body: "Halo, pesanan saya bagaimana?",
      kind: "TEXT",
      providerMessageId: "wamid.ABC",
      mediaUrl: null,
    });
  });

  it("keeps an image and its caption", () => {
    const parsed = parseInboxWebhook(
      waba({
        type: "image",
        image: { id: "media-123", mime_type: "image/jpeg", caption: "Paketnya penyok" },
      })
    );
    expect(parsed).toMatchObject({
      kind: "IMAGE",
      body: "Paketnya penyok",
      mediaMimeType: "image/jpeg",
    });
    // The Cloud API gives an id, not a link; the fetchable endpoint is stored.
    expect(parsed!.mediaUrl).toContain("media-123");
  });

  it("keeps a document's filename", () => {
    const parsed = parseInboxWebhook(
      waba({
        type: "document",
        document: {
          id: "doc-9",
          mime_type: "application/pdf",
          filename: "invoice.pdf",
        },
      })
    );
    expect(parsed).toMatchObject({
      kind: "DOCUMENT",
      body: "",
      mediaFilename: "invoice.pdf",
    });
  });

  it("turns a location into something readable", () => {
    const parsed = parseInboxWebhook(
      waba({
        type: "location",
        location: { latitude: -6.2, longitude: 106.8, name: "Toko Pusat" },
      })
    );
    expect(parsed?.kind).toBe("LOCATION");
    expect(parsed?.body).toContain("Toko Pusat");
    expect(parsed?.body).toContain("-6.2");
  });

  it("reads the text out of a button and a list reply", () => {
    expect(
      parseInboxWebhook(waba({ type: "button", button: { text: "Ya, lanjut" } }))?.body
    ).toBe("Ya, lanjut");
    expect(
      parseInboxWebhook(
        waba({
          type: "interactive",
          interactive: { button_reply: { title: "Cek resi" } },
        })
      )?.body
    ).toBe("Cek resi");
  });

  it("returns nothing for a delivery receipt", () => {
    const statusCallback = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.ABC", status: "delivered", recipient_id: "628123" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboxWebhook(statusCallback)).toBeNull();
  });

  it("returns nothing for an empty or malformed body", () => {
    expect(parseInboxWebhook({})).toBeNull();
    expect(parseInboxWebhook(null)).toBeNull();
    expect(parseInboxWebhook({ entry: [] })).toBeNull();
  });
});

describe("parseInboxWebhook — flat gateways", () => {
  it("reads the shape Fonnte and friends post", () => {
    const parsed = parseInboxWebhook({
      sender: "62811-1111-2222",
      pushName: "Citra",
      message: "Stok masih ada kak?",
      id: "gw-1",
    });
    expect(parsed).toMatchObject({
      phone: "62811-1111-2222",
      name: "Citra",
      body: "Stok masih ada kak?",
      kind: "TEXT",
      providerMessageId: "gw-1",
    });
  });

  it("classifies an attachment from its url when there is no mime type", () => {
    const parsed = parseInboxWebhook({
      from: "628123",
      url: "https://cdn.example.com/chat/bukti-transfer.jpg",
      caption: "Sudah transfer",
    });
    expect(parsed).toMatchObject({
      kind: "IMAGE",
      body: "Sudah transfer",
      mediaUrl: "https://cdn.example.com/chat/bukti-transfer.jpg",
    });
  });

  it("ignores a media url that is not fetchable", () => {
    const parsed = parseInboxWebhook({
      from: "628123",
      message: "halo",
      mediaUrl: "not-a-url",
    });
    expect(parsed?.mediaUrl).toBeNull();
  });

  it("needs a sender and something to say", () => {
    expect(parseInboxWebhook({ message: "halo" })).toBeNull();
    expect(parseInboxWebhook({ from: "628123" })).toBeNull();
  });
});

describe("attachmentLabel", () => {
  it("names an attachment that arrived without a caption", () => {
    expect(attachmentLabel("IMAGE")).toBe("[Gambar]");
    expect(attachmentLabel("DOCUMENT")).toBe("[Dokumen]");
    // Text needs no label: its body is the message.
    expect(attachmentLabel("TEXT")).toBe("");
  });
});
