import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createSnapTransaction,
  isMidtransConfigured,
} from "@/lib/midtrans";
import { applyPaymentStatus } from "@/lib/payments";
import {
  issuePublicAccessToken,
  verifyPublicAccessToken,
} from "@/lib/public-access-token";
import { publicSiteHref } from "@/lib/public-url";
import { rateLimitByIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-reporting";

function appOrigin(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const limit = await rateLimitByIp("payment-resume", 30, 60 * 1000);
  if (!limit.ok) {
    const response = NextResponse.redirect(
      new URL("/payment/failed", req.nextUrl.origin)
    );
    response.headers.set("Retry-After", String(limit.retryAfter));
    return response;
  }

  const ref = req.nextUrl.searchParams.get("ref");
  const accessToken = req.nextUrl.searchParams.get("access");
  if (!ref) return NextResponse.redirect(new URL("/payment/failed", req.url));

  const payment = await prisma.payment.findUnique({
    where: { midtransOrderId: ref },
    include: {
      workspace: { select: { slug: true } },
      order: { include: { customer: true } },
      enrollment: { include: { customer: true } },
      customerMembership: { include: { customer: true } },
    },
  });
  if (
    !payment ||
    !verifyPublicAccessToken(accessToken, "payment", payment.id)
  ) {
    return NextResponse.redirect(new URL("/payment/failed", req.url));
  }

  const origin = appOrigin(req);
  const encodedRef = encodeURIComponent(payment.midtransOrderId);
  const encodedAccess = encodeURIComponent(accessToken!);
  const finishUrl = `${origin}/payment/success?ref=${encodedRef}&access=${encodedAccess}`;

  const now = new Date();
  if (
    payment.status === "PENDING" &&
    payment.expiresAt &&
    payment.expiresAt <= now
  ) {
    await applyPaymentStatus(payment.id, "EXPIRED", {
      transactionStatus: "expired_by_resume",
      rawNotification: {
        source: "payment_resume",
        expiredAt: now.toISOString(),
        expiresAt: payment.expiresAt.toISOString(),
        midtransOrderId: payment.midtransOrderId,
      },
    });
    return NextResponse.redirect(finishUrl);
  }

  if (payment.status !== "PENDING") {
    return NextResponse.redirect(finishUrl);
  }

  if (payment.provider.startsWith("manual:") && payment.order) {
    const orderAccess = issuePublicAccessToken("order", payment.order.id);
    return NextResponse.redirect(
      new URL(
        publicSiteHref(
          payment.workspace.slug,
          `checkout/success?order=${encodeURIComponent(
            payment.order.orderNumber
          )}&access=${encodeURIComponent(orderAccess)}`
        ),
        origin
      )
    );
  }

  if (payment.snapRedirectUrl) {
    return NextResponse.redirect(payment.snapRedirectUrl);
  }

  if (!isMidtransConfigured()) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_SIMULATED_PAYMENTS === "true"
    ) {
      await applyPaymentStatus(payment.id, "PAID", {
        transactionStatus: "settlement",
        paymentType: "simulated",
      });
    }
    return NextResponse.redirect(finishUrl);
  }

  const customer =
    payment.order?.customer ??
    payment.enrollment?.customer ??
    payment.customerMembership?.customer ??
    null;

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
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        snapToken: snap.token,
        snapRedirectUrl: snap.redirectUrl,
      },
    });

    return NextResponse.redirect(snap.redirectUrl);
  } catch (error) {
    reportError("midtrans resume transaction failed", error);
    return NextResponse.redirect(finishUrl);
  }
}
