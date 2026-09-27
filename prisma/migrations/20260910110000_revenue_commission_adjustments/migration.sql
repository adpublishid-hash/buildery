ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

CREATE TYPE "CommissionAdjustmentType" AS ENUM ('ORDER_REFUND', 'ORDER_CANCELLATION');

ALTER TABLE "Commission"
  ADD COLUMN "originalAmount" INTEGER,
  ADD COLUMN "adjustedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

UPDATE "Commission"
SET "originalAmount" = "amount"
WHERE "originalAmount" IS NULL;

CREATE TABLE "CommissionAdjustment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "orderId" TEXT,
  "refundId" TEXT,
  "type" "CommissionAdjustmentType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommissionAdjustment"
  ADD CONSTRAINT "CommissionAdjustment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionAdjustment"
  ADD CONSTRAINT "CommissionAdjustment_commissionId_fkey"
  FOREIGN KEY ("commissionId") REFERENCES "Commission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionAdjustment"
  ADD CONSTRAINT "CommissionAdjustment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommissionAdjustment"
  ADD CONSTRAINT "CommissionAdjustment_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CommissionAdjustment_commissionId_refundId_key"
  ON "CommissionAdjustment"("commissionId", "refundId");

CREATE UNIQUE INDEX "CommissionAdjustment_commissionId_type_orderId_key"
  ON "CommissionAdjustment"("commissionId", "type", "orderId");

CREATE INDEX "CommissionAdjustment_workspaceId_createdAt_idx"
  ON "CommissionAdjustment"("workspaceId", "createdAt");

CREATE INDEX "CommissionAdjustment_orderId_idx"
  ON "CommissionAdjustment"("orderId");

CREATE INDEX "CommissionAdjustment_refundId_idx"
  ON "CommissionAdjustment"("refundId");
