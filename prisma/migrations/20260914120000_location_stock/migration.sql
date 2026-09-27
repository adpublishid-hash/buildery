-- Where stock physically sits.
--
-- A shop with two warehouses had one number per product and no way to say which
-- building the goods were in. This records the split; selling still draws on
-- the product's own total, so there is never a second number to disagree with.

CREATE TABLE IF NOT EXISTS "LocationStock" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationStock_locationId_productId_variantId_key"
  ON "LocationStock" ("locationId", "productId", "variantId");
CREATE INDEX IF NOT EXISTS "LocationStock_workspaceId_productId_idx"
  ON "LocationStock" ("workspaceId", "productId");
CREATE INDEX IF NOT EXISTS "LocationStock_locationId_idx"
  ON "LocationStock" ("locationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationStock_workspaceId_fkey' AND conrelid = '"LocationStock"'::regclass) THEN
    ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationStock_locationId_fkey' AND conrelid = '"LocationStock"'::regclass) THEN
    ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "PickupLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationStock_productId_fkey' AND conrelid = '"LocationStock"'::regclass) THEN
    ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationStock_variantId_fkey' AND conrelid = '"LocationStock"'::regclass) THEN
    ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
