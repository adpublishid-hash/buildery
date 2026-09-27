CREATE TYPE "DiscountStackingMode" AS ENUM ('ADDITIVE', 'OVERRIDE');

ALTER TABLE "Coupon"
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "stackingMode" "DiscountStackingMode" NOT NULL DEFAULT 'ADDITIVE',
  ADD COLUMN "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");
