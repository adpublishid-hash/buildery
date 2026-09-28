import "server-only";

import type { Customer, Payment } from "@prisma/client";

import { getActiveConnection } from "../connections";
import { isPaymentGateway, startGatewayCheckout } from "./gateway";

type PaymentWithCustomer = Payment & { customer: Pick<Customer, "name" | "email" | "phone"> | null };

/** Where the buyer returns after the gateway: it re-checks the status first. */
export function gatewayReturnUrls(origin: string, reference: string, accessToken: string) {
  const returnUrl = `${origin}/api/integrations/payments/return?ref=${encodeURIComponent(reference)}&access=${encodeURIComponent(accessToken)}`;
  return { returnUrl, cancelUrl: `${returnUrl}&cancelled=1` };
}

/**
 * Sends a PENDING payment to the workspace's connected payment gateway, when
 * it has one switched on. Returns null to fall through to Midtrans.
 *
 * A payment that already has a gateway checkout reuses it, so a buyer who
 * clicks "pay" twice does not get two invoices.
 */
export async function startWorkspaceGatewayCheckout(
  payment: PaymentWithCustomer,
  input: { origin: string; accessToken: string }
): Promise<{ url: string } | null> {
  if (isPaymentGateway(payment.provider) && payment.snapRedirectUrl) {
    return { url: payment.snapRedirectUrl };
  }
  const connection = await getActiveConnection(payment.workspaceId, "PAYMENT");
  if (!connection) return null;
  return startGatewayCheckout(
    connection,
    payment,
    {
      name: payment.customer?.name?.trim() || "Customer",
      email: payment.customer?.email ?? null,
      phone: payment.customer?.phone ?? null,
    },
    gatewayReturnUrls(input.origin, payment.midtransOrderId, input.accessToken)
  );
}
