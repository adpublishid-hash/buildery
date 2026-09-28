import { NextResponse } from "next/server";

import { reportError } from "@/lib/error-reporting";
import { listVisitorMessages, loadWebchat, postVisitorMessage } from "@/lib/integrations/inbox/webchat";
import { validVisitorToken } from "@/lib/integrations/inbox/requests";
import { rateLimitByIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { key: string } };

// The widget runs on the store's own pages and on any custom domain, and it
// carries no cookies, so any origin may call these two endpoints.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...extra } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request, { params }: Params) {
  const limit = await rateLimitByIp("webchat-poll", 90, 60 * 1000);
  if (!limit.ok) return json({ error: "Too many requests" }, 429, { "Retry-After": String(limit.retryAfter) });

  const connection = await loadWebchat(params.key);
  if (!connection) return json({ error: "Chat is offline" }, 404);

  const url = new URL(req.url);
  const token = url.searchParams.get("v");
  if (!validVisitorToken(token)) return json({ messages: [] });
  const afterRaw = url.searchParams.get("after");
  const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : null;
  return json({ messages: await listVisitorMessages(connection.workspaceId, token, after) });
}

export async function POST(req: Request, { params }: Params) {
  const limit = await rateLimitByIp("webchat-send", 20, 60 * 1000);
  if (!limit.ok) return json({ error: "Too many messages. Please wait a moment." }, 429, { "Retry-After": String(limit.retryAfter) });

  const connection = await loadWebchat(params.key);
  if (!connection) return json({ error: "Chat is offline" }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  try {
    const result = await postVisitorMessage(connection, {
      token: body.v,
      text: body.text,
      name: body.name,
      email: body.email,
      clientId: body.id,
    });
    return result.ok ? json({ ok: true }) : json({ error: result.error }, result.status);
  } catch (error) {
    reportError("webchat message failed", error);
    return json({ error: "Could not send. Please try again." }, 500);
  }
}
