import { NextResponse } from "next/server";
import type { WhatsAppProvider } from "@prisma/client";

import { receiveInboxMessage } from "@/lib/actions/inbox";
import { parseInboxWebhook } from "@/lib/whatsapp/inbox-parse";
import { prisma } from "@/lib/prisma";
import { safeEqual, verifyInboxWebhook } from "@/lib/whatsapp/webhook-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || "";
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: { whatsappWebhookVerifyToken: true },
  });

  if (
    mode === "subscribe" &&
    challenge &&
    token &&
    setting?.whatsappWebhookVerifyToken &&
    safeEqual(token, setting.whatsappWebhookVerifyToken)
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || "";
  const provider = (url.searchParams.get("provider") || "").toUpperCase();
  // The signature covers the exact bytes Meta sent, so read the body raw and
  // parse it only after it has been verified.
  const rawBody = await req.text().catch(() => "");

  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      whatsappIsActive: true,
      whatsappProvider: true,
      whatsappWebhookSecret: true,
    },
  });
  if (!workspaceId || !setting?.whatsappIsActive) {
    return NextResponse.json({ ok: false, error: "Inactive inbox" }, { status: 403 });
  }

  const auth = verifyInboxWebhook({
    provider: setting.whatsappProvider,
    secret: setting.whatsappWebhookSecret,
    rawBody,
    headers: req.headers,
    url,
  });
  if (!auth.ok) {
    console.warn(`[whatsapp-inbox] rejected webhook for ${workspaceId}: ${auth.reason}`);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const parsed = parseInboxWebhook(payload);
  if (!parsed) {
    // Delivery and read receipts carry no message, and a provider that gets a
    // non-2xx keeps redelivering. Acknowledge and ignore, rather than inviting
    // a retry loop for a payload that will never contain anything to store.
    return NextResponse.json({ ok: true, ignored: "no message in payload" });
  }

  try {
    const result = await receiveInboxMessage({
      workspaceId,
      phone: parsed.phone,
      name: parsed.name,
      body: parsed.body,
      kind: parsed.kind,
      mediaUrl: parsed.mediaUrl,
      mediaMimeType: parsed.mediaMimeType,
      mediaFilename: parsed.mediaFilename,
      provider:
        provider === "ONESENDER" || provider === "WABA" || provider === "STARSENDER"
          ? (provider as WhatsAppProvider)
          : setting.whatsappProvider,
      providerMessageId: parsed.providerMessageId || null,
    });

    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    // A real failure (database down, say) must return non-2xx so the provider
    // redelivers instead of dropping the customer's message.
    console.error(`[whatsapp-inbox] failed to store message for ${workspaceId}:`, error);
    return NextResponse.json({ ok: false, error: "Storage failed" }, { status: 500 });
  }
}
