import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPaymentByRef } from "@/lib/payments";
import { PaymentStatusView } from "@/components/payment/payment-status-view";
import { verifyPublicAccessToken } from "@/lib/public-access-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Payment failed" },
  robots: { index: false },
};

export default async function PaymentFailedPage({
  searchParams,
}: {
  searchParams: { ref?: string; access?: string };
}) {
  if (!searchParams.ref) notFound();
  const payment = await getPaymentByRef(searchParams.ref);
  if (!payment) notFound();
  if (!verifyPublicAccessToken(searchParams.access, "payment", payment.id)) {
    notFound();
  }
  return <PaymentStatusView payment={payment} />;
}
