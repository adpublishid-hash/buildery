import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createSnapTransaction,
  isMidtransConfigured,
} from "@/lib/midtrans";
import { applyPaymentStatus } from "@/lib/payments";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getWorkspaceMidtransConfig } from "@/lib/ecommerce-settings";
import { reportError } from "@/lib/error-reporting";
import { startWorkspaceGatewayCheckout } from "@/lib/integrations/payments/checkout";

function appOrigin(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  return req.nextUrl.origin;
}

/**
 * Starts a payment. Given a PENDING payment id, creates a checkout at the
 * workspace's connected payment gateway (Xendit, Stripe, PayPal, Duitku) or,
 * failing that, a Midtrans Snap transaction, and returns the redirect URL. When Midtrans isn't configured
 * the payment is settled instantly (sandbox-free local testing).
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp("payment-create", 20, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const paymentId = (body as { paymentId?: unknown })?.paymentId;
  const accessToken = (body as { accessToken?: unknown })?.accessToken;
  if (typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }
  if (
    typeof accessToken !== "string" ||
    !verifyPublicAccessToken(accessToken, "payment", paymentId)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: { include: { customer: true } },
      enrollment: { include: { customer: true } },
      customerMembership: { include: { customer: true } },
    },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const origin = appOrigin(req);
  const finishUrl = `${origin}/payment/success?ref=${encodeURIComponent(
    payment.midtransOrderId
  )}&access=${encodeURIComponent(accessToken)}`;

  // Already handled — just point the client at the status page.
  if (payment.status !== "PENDING") {
    return NextResponse.json({ url: finishUrl });
  }

  const customer =
    payment.order?.customer ??
    payment.enrollment?.customer ??
    payment.customerMembership?.customer ??
    null;

  // --- A payment gateway connected in the integration catalog wins ---
  try {
    const gateway = await startWorkspaceGatewayCheckout(
      { ...payment, customer },
      { origin, accessToken }
    );
    if (gateway) return NextResponse.json({ url: gateway.url });
  } catch (error) {
    reportError("payment gateway checkout failed", error, {
      context: { paymentId: payment.id },
    });
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 502 }
    );
  }

  // --- Sandbox-free mode: settle instantly ---
  // This store's own credentials; falls back to the deployment's env vars.
  const midtransConfig = await getWorkspaceMidtransConfig(payment.workspaceId);
  if (!isMidtransConfigured(midtransConfig)) {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.ALLOW_SIMULATED_PAYMENTS !== "true"
    ) {
      return NextResponse.json(
        { error: "Payment provider is not configured." },
        { status: 503 }
      );
    }
    await applyPaymentStatus(payment.id, "PAID", {
      transactionStatus: "settlement",
      paymentType: "simulated",
    });
    return NextResponse.json({ url: finishUrl, simulated: true });
  }

  // --- Real Midtrans Snap transaction ---
  try {
    const snap = await createSnapTransaction({
      orderId: payment.midtransOrderId,
      grossAmount: payment.amount,
      itemName: payment.description ?? "My Landing payment",
      customer: {
        firstName: customer?.name ?? "Customer",
        email: customer?.email ?? "customer@example.com",
        phone: customer?.phone ?? null,
      },
      finishUrl,
    }, midtransConfig);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        snapToken: snap.token,
        snapRedirectUrl: snap.redirectUrl,
      },
    });

    return NextResponse.json({ url: snap.redirectUrl });
  } catch (error) {
    reportError("midtrans create transaction failed", error);
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 502 }
    );
  }
}
