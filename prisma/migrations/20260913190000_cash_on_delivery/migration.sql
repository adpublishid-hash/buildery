-- Cash on delivery.
--
-- The store could only take Midtrans or a manual transfer, which leaves out the
-- payment method a large share of Indonesian shoppers still use.

ALTER TABLE "EcommerceSetting"
  ADD COLUMN IF NOT EXISTS "codEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "codFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "codMinimum" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "codMaximum" INTEGER;
