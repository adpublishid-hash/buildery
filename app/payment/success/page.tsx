import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { getPaymentByRef } from "@/lib/payments";
import { publicSiteHref } from "@/lib/public-url";
import { PaymentStatusView } from "@/components/payment/payment-status-view";
import {
  issuePublicAccessToken,
  verifyPublicAccessToken,
} from "@/lib/public-access-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Payment" },
  robots: { index: false },
};

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: { ref?: string; access?: string };
}) {
  const ref = searchParams.ref;
  if (!ref) notFound();

  const payment = await getPaymentByRef(ref);
  if (!payment) notFound();
  if (!verifyPublicAccessToken(searchParams.access, "payment", payment.id)) {
    notFound();
  }
  const access = encodeURIComponent(searchParams.access!);

  // The Snap "finish" URL always lands here — route to the right page
  // based on the payment's actual status.
  if (payment.status === "PENDING")
    redirect(`/payment/pending?ref=${encodeURIComponent(ref)}&access=${access}`);
  if (payment.status !== "PAID")
    redirect(`/payment/failed?ref=${encodeURIComponent(ref)}&access=${access}`);
  if (payment.order?.orderNumber) {
    redirect(
      `${publicSiteHref(payment.workspace.slug, "checkout/success")}?order=${encodeURIComponent(
        payment.order.orderNumber
      )}&access=${encodeURIComponent(
        issuePublicAccessToken("order", payment.order.id)
      )}`
    );
  }

  return <PaymentStatusView payment={payment} />;
}
