CREATE TYPE "FulfillmentStatus" AS ENUM (
  'NOT_REQUIRED',
  'UNFULFILLED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "Order"
  ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "fulfillmentTrackingCarrier" TEXT,
  ADD COLUMN "fulfillmentTrackingNumber" TEXT,
  ADD COLUMN "fulfillmentTrackingUrl" TEXT,
  ADD COLUMN "fulfillmentNote" TEXT,
  ADD COLUMN "packedAt" TIMESTAMP(3),
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);

CREATE TABLE "FulfillmentEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorId" TEXT,
  "status" "FulfillmentStatus" NOT NULL,
  "trackingCarrier" TEXT,
  "trackingNumber" TEXT,
  "trackingUrl" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FulfillmentEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FulfillmentEvent"
  ADD CONSTRAINT "FulfillmentEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FulfillmentEvent"
  ADD CONSTRAINT "FulfillmentEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Order_workspaceId_fulfillmentStatus_idx"
  ON "Order"("workspaceId", "fulfillmentStatus");

CREATE INDEX "FulfillmentEvent_workspaceId_createdAt_idx"
  ON "FulfillmentEvent"("workspaceId", "createdAt");

CREATE INDEX "FulfillmentEvent_orderId_createdAt_idx"
  ON "FulfillmentEvent"("orderId", "createdAt");

CREATE INDEX "FulfillmentEvent_status_createdAt_idx"
  ON "FulfillmentEvent"("status", "createdAt");

CREATE INDEX "FulfillmentEvent_actorId_idx"
  ON "FulfillmentEvent"("actorId");

UPDATE "Order" o
SET "fulfillmentStatus" = 'UNFULFILLED'
WHERE o."shippingAddress" IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM "OrderItem" oi
    LEFT JOIN "Product" p ON p."id" = oi."productId"
    WHERE oi."orderId" = o."id"
      AND p."type" = 'PHYSICAL'::"ProductType"
  );

UPDATE "Order"
SET "fulfillmentStatus" = 'DELIVERED',
    "deliveredAt" = COALESCE("updatedAt", NOW())
WHERE "fulfillmentStatus" = 'UNFULFILLED'
  AND "status" = 'COMPLETED';

UPDATE "Order"
SET "fulfillmentStatus" = 'CANCELLED'
WHERE "fulfillmentStatus" = 'UNFULFILLED'
  AND "status" IN ('CANCELLED', 'FAILED', 'EXPIRED');
