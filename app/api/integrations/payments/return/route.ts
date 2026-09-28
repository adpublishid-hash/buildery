import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { reportError } from "@/lib/error-reporting";
import { getConnection } from "@/lib/integrations/connections";
import { findGatewayPayment, isPaymentGateway, syncGatewayPayment } from "@/lib/integrations/payments/gateway";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Where Xendit, Stripe, PayPal and Duitku send the buyer back. The status is
 * checked with the provider right away (and a PayPal approval is captured),
 * so the buyer sees "paid" without waiting for a webhook, which may be slow
 * or, on a local install, never arrive. Then the usual status page takes over.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const access = req.nextUrl.searchParams.get("access") ?? "";
  const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  const statusPage = new URL(`/payment/success?ref=${encodeURIComponent(ref)}&access=${encodeURIComponent(access)}`, origin);

  const limit = await rateLimitByIp("payment-return", 30, 60 * 1000);
  if (!limit.ok) return NextResponse.redirect(statusPage);

  const payment = ref ? await findGatewayPayment({ midtransOrderId: ref }) : null;
  if (!payment || !verifyPublicAccessToken(access, "payment", payment.id)) {
    return NextResponse.redirect(new URL("/payment/failed", origin));
  }

  if (payment.status === "PENDING" && isPaymentGateway(payment.provider)) {
    const connection = await getConnection(payment.workspaceId, payment.provider);
    if (connection) {
      try {
        await syncGatewayPayment(connection, payment, "return");
      } catch (error) {
        // The webhook and the reconciliation sweep will catch up.
        reportError("payment gateway return sync failed", error, { context: { paymentId: payment.id } });
      }
    }
  }
  return NextResponse.redirect(statusPage);
}
