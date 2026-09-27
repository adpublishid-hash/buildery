ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'LOW_STOCK_ALERT';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'LOW_STOCK_ALERT_SWEEP';

ALTER TABLE "Product"
  ADD COLUMN "lowStockAlertedAt" TIMESTAMP(3),
  ADD COLUMN "lowStockResolvedAt" TIMESTAMP(3);

ALTER TABLE "EcommerceSetting"
  ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;

CREATE INDEX "Product_workspaceId_status_type_stock_idx"
  ON "Product"("workspaceId", "status", "type", "stock");
