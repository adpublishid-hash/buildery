ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'REFUND_REQUESTED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'REFUND_APPROVED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'REFUND_REFUNDED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'REFUND_REJECTED';
ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'REFUND_CANCELLED';

ALTER TABLE "OrderRefund"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "providerRefundKey" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerResponse" JSONB,
  ADD COLUMN "providerRequestedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrderRefund_providerRefundKey_key"
  ON "OrderRefund"("providerRefundKey");

CREATE INDEX "OrderRefund_workspaceId_provider_idx"
  ON "OrderRefund"("workspaceId", "provider");
