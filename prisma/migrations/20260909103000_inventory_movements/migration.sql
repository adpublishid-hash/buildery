CREATE TYPE "InventoryMovementType" AS ENUM (
  'ORDER_RESERVATION',
  'ORDER_RELEASE',
  'ORDER_FULFILLMENT',
  'MANUAL_ADJUSTMENT'
);

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderId" TEXT,
  "actorId" TEXT,
  "type" "InventoryMovementType" NOT NULL,
  "quantityChange" INTEGER NOT NULL,
  "stockBefore" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryMovement_workspaceId_createdAt_idx"
  ON "InventoryMovement"("workspaceId", "createdAt");

CREATE INDEX "InventoryMovement_productId_createdAt_idx"
  ON "InventoryMovement"("productId", "createdAt");

CREATE INDEX "InventoryMovement_orderId_idx"
  ON "InventoryMovement"("orderId");

CREATE INDEX "InventoryMovement_actorId_idx"
  ON "InventoryMovement"("actorId");

CREATE INDEX "InventoryMovement_type_createdAt_idx"
  ON "InventoryMovement"("type", "createdAt");
