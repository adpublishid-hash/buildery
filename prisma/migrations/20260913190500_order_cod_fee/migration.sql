-- The COD surcharge as its own line, so an invoice's parts still sum to total.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "codFee" INTEGER NOT NULL DEFAULT 0;
