ALTER TABLE "MembershipPlan"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "accessDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MembershipPlan"
  ADD CONSTRAINT "MembershipPlan_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MembershipPlan_productId_idx" ON "MembershipPlan"("productId");
