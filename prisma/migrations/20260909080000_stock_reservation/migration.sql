-- Stock reservation: reduce available stock when checkout is created, then
-- release it automatically if the payment fails, expires, or is cancelled.
ALTER TYPE "StockDecrementTiming" ADD VALUE 'CHECKOUT';

ALTER TABLE "Order"
  ADD COLUMN "stockReservedAt" TIMESTAMP(3),
  ADD COLUMN "stockReleasedAt" TIMESTAMP(3);

CREATE INDEX "Order_workspaceId_stockReservedAt_idx"
  ON "Order"("workspaceId", "stockReservedAt");
