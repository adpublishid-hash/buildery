-- A reusable address book per customer.
--
-- Addresses were only snapshotted onto the order, so a repeat buyer retyped
-- province, city, postcode and street at every checkout.

CREATE TABLE IF NOT EXISTS "CustomerAddress" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT,
  "recipientName" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "provinceId" TEXT,
  "provinceName" TEXT,
  "cityId" TEXT,
  "cityName" TEXT,
  "postalCode" TEXT,
  "address" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAddress_customerId_isDefault_idx"
  ON "CustomerAddress" ("customerId", "isDefault");
CREATE INDEX IF NOT EXISTS "CustomerAddress_workspaceId_idx"
  ON "CustomerAddress" ("workspaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CustomerAddress_workspaceId_fkey'
      AND conrelid = '"CustomerAddress"'::regclass
  ) THEN
    ALTER TABLE "CustomerAddress"
      ADD CONSTRAINT "CustomerAddress_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CustomerAddress_customerId_fkey'
      AND conrelid = '"CustomerAddress"'::regclass
  ) THEN
    ALTER TABLE "CustomerAddress"
      ADD CONSTRAINT "CustomerAddress_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
