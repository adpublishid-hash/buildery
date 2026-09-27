-- Payment reliability: recurring expiry sweeps and Midtrans webhook audit trail.
ALTER TYPE "ScheduledJobKind" ADD VALUE 'PAYMENT_EXPIRY_SWEEP';

CREATE TYPE "PaymentWebhookResult" AS ENUM (
  'INVALID_BODY',
  'BAD_SIGNATURE',
  'UNKNOWN_PAYMENT',
  'PROCESSED',
  'PROCESSING_FAILED'
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "paymentId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'midtrans',
  "result" "PaymentWebhookResult" NOT NULL,
  "signatureValid" BOOLEAN,
  "midtransOrderId" TEXT,
  "mappedStatus" "PaymentStatus",
  "transactionStatus" TEXT,
  "fraudStatus" TEXT,
  "transactionId" TEXT,
  "paymentType" TEXT,
  "changedPayment" BOOLEAN,
  "error" TEXT,
  "payload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_status_expiresAt_idx"
  ON "Payment"("status", "expiresAt");

CREATE INDEX "PaymentWebhookEvent_workspaceId_receivedAt_idx"
  ON "PaymentWebhookEvent"("workspaceId", "receivedAt");

CREATE INDEX "PaymentWebhookEvent_paymentId_receivedAt_idx"
  ON "PaymentWebhookEvent"("paymentId", "receivedAt");

CREATE INDEX "PaymentWebhookEvent_provider_result_receivedAt_idx"
  ON "PaymentWebhookEvent"("provider", "result", "receivedAt");

CREATE INDEX "PaymentWebhookEvent_midtransOrderId_receivedAt_idx"
  ON "PaymentWebhookEvent"("midtransOrderId", "receivedAt");

ALTER TABLE "PaymentWebhookEvent"
  ADD CONSTRAINT "PaymentWebhookEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent"
  ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
