ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLATION';

ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_CANCELLED';

ALTER TABLE "Payment"
  ADD COLUMN "providerCancelStatus" TEXT,
  ADD COLUMN "providerCancelReference" TEXT,
  ADD COLUMN "providerCancelResponse" JSONB,
  ADD COLUMN "providerCancelRequestedAt" TIMESTAMP(3);

CREATE INDEX "Payment_workspaceId_providerCancelStatus_idx"
  ON "Payment"("workspaceId", "providerCancelStatus");
