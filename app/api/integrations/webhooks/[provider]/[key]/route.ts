import { NextResponse } from "next/server";

import { getConnectionByWebhookKey } from "@/lib/integrations/connections";
import { handlePaymentWebhook } from "@/lib/integrations/payments/gateway";
import { rateLimitByIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { provider: string; key: string } };

/**
 * One inbound endpoint for every catalog integration:
 * /api/integrations/webhooks/{provider}/{webhookKey}.
 *
 * The unguessable key picks the workspace's connection; the provider's own
 * signature or token is then checked by the category handler. Unknown keys
 * get a bare 404 so the endpoint reveals nothing about which keys exist.
 */
export async function POST(req: Request, { params }: Params) {
  const limit = await rateLimitByIp("integration-webhook", 300, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const connection = await getConnectionByWebhookKey(params.provider, params.key);
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Signatures cover the exact bytes sent, so read raw and parse later.
  const rawBody = await req.text().catch(() => "");

  switch (connection.provider.category) {
    case "PAYMENT": {
      const result = await handlePaymentWebhook(connection, rawBody, req.headers);
      return NextResponse.json(result.body, { status: result.status });
    }
    default:
      return NextResponse.json({ error: "This integration does not accept webhooks." }, { status: 404 });
  }
}
