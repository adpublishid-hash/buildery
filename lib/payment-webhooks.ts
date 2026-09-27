import "server-only";

import type { PaymentStatus, PaymentWebhookResult, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

export type PaymentWebhookLogInput = {
  workspaceId?: string | null;
  paymentId?: string | null;
  result: PaymentWebhookResult;
  signatureValid?: boolean | null;
  midtransOrderId?: string | null;
  mappedStatus?: PaymentStatus | null;
  transactionStatus?: string | null;
  fraudStatus?: string | null;
  transactionId?: string | null;
  paymentType?: string | null;
  changedPayment?: boolean | null;
  error?: string | null;
  payload?: Prisma.InputJsonValue | null;
};

export async function recordPaymentWebhookEvent(input: PaymentWebhookLogInput) {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        paymentId: input.paymentId ?? null,
        result: input.result,
        signatureValid: input.signatureValid ?? null,
        midtransOrderId: input.midtransOrderId?.slice(0, 200) ?? null,
        mappedStatus: input.mappedStatus ?? null,
        transactionStatus: input.transactionStatus?.slice(0, 100) ?? null,
        fraudStatus: input.fraudStatus?.slice(0, 100) ?? null,
        transactionId: input.transactionId?.slice(0, 200) ?? null,
        paymentType: input.paymentType?.slice(0, 100) ?? null,
        changedPayment: input.changedPayment ?? null,
        error: input.error?.slice(0, 1000) ?? null,
        payload: input.payload ?? undefined,
      },
    });
  } catch (error) {
    reportError("payment-webhook failed to record event", error);
  }
}
