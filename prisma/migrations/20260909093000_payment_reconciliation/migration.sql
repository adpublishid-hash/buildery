-- Midtrans reconciliation: periodically sync pending payments when webhooks are delayed or missed.
ALTER TYPE "ScheduledJobKind" ADD VALUE 'PAYMENT_RECONCILIATION';

CREATE TYPE "PaymentReconciliationResult" AS ENUM (
  'SYNCED',
  'UNCHANGED',
  'NOT_FOUND',
  'FAILED'
);

CREATE TABLE "PaymentReconciliationEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "paymentId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'midtrans',
  "result" "PaymentReconciliationResult" NOT NULL,
  "midtransOrderId" TEXT,
  "previousStatus" "PaymentStatus",
  "mappedStatus" "PaymentStatus",
  "transactionStatus" TEXT,
  "fraudStatus" TEXT,
  "transactionId" TEXT,
  "paymentType" TEXT,
  "changedPayment" BOOLEAN,
  "error" TEXT,
  "payload" JSONB,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentReconciliationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentReconciliationEvent_workspaceId_checkedAt_idx"
  ON "PaymentReconciliationEvent"("workspaceId", "checkedAt");

CREATE INDEX "PaymentReconciliationEvent_paymentId_checkedAt_idx"
  ON "PaymentReconciliationEvent"("paymentId", "checkedAt");

CREATE INDEX "PaymentReconciliationEvent_provider_result_checkedAt_idx"
  ON "PaymentReconciliationEvent"("provider", "result", "checkedAt");

CREATE INDEX "PaymentReconciliationEvent_midtransOrderId_checkedAt_idx"
  ON "PaymentReconciliationEvent"("midtransOrderId", "checkedAt");

ALTER TABLE "PaymentReconciliationEvent"
  ADD CONSTRAINT "PaymentReconciliationEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliationEvent"
  ADD CONSTRAINT "PaymentReconciliationEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
