ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'ORDER_RETURN';

CREATE TYPE "RefundStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
  'CANCELLED'
);

CREATE TYPE "RefundType" AS ENUM (
  'REFUND',
  'RETURN'
);

CREATE TABLE "OrderRefund" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT,
  "actorId" TEXT,
  "type" "RefundType" NOT NULL DEFAULT 'REFUND',
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "amount" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "note" TEXT,
  "providerReference" TEXT,
  "returnToStock" BOOLEAN NOT NULL DEFAULT false,
  "restockedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderRefundItem" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "restockQuantity" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "OrderRefundItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderRefund"
  ADD CONSTRAINT "OrderRefund_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderRefund"
  ADD CONSTRAINT "OrderRefund_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderRefund"
  ADD CONSTRAINT "OrderRefund_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderRefundItem"
  ADD CONSTRAINT "OrderRefundItem_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderRefundItem"
  ADD CONSTRAINT "OrderRefundItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderRefundItem"
  ADD CONSTRAINT "OrderRefundItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OrderRefundItem_refundId_orderItemId_key"
  ON "OrderRefundItem"("refundId", "orderItemId");

CREATE INDEX "OrderRefund_workspaceId_createdAt_idx"
  ON "OrderRefund"("workspaceId", "createdAt");

CREATE INDEX "OrderRefund_workspaceId_status_idx"
  ON "OrderRefund"("workspaceId", "status");

CREATE INDEX "OrderRefund_orderId_idx"
  ON "OrderRefund"("orderId");

CREATE INDEX "OrderRefund_customerId_idx"
  ON "OrderRefund"("customerId");

CREATE INDEX "OrderRefundItem_orderItemId_idx"
  ON "OrderRefundItem"("orderItemId");

CREATE INDEX "OrderRefundItem_productId_idx"
  ON "OrderRefundItem"("productId");
