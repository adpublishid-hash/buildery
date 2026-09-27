ALTER TABLE "SaaSPlan"
  ADD COLUMN "compareAtMonthlyPrice" INTEGER;

UPDATE "SaaSPlan"
SET
  "monthlyPrice" = 99000,
  "compareAtMonthlyPrice" = 120000
WHERE "tier" = 'STARTER';

UPDATE "SaaSPlan"
SET
  "monthlyPrice" = 299000,
  "compareAtMonthlyPrice" = 350000
WHERE "tier" = 'PRO';

ALTER TABLE "SaaSPlan"
  ADD CONSTRAINT "SaaSPlan_monthlyPrice_nonnegative"
    CHECK ("monthlyPrice" >= 0),
  ADD CONSTRAINT "SaaSPlan_compareAtMonthlyPrice_valid"
    CHECK (
      "compareAtMonthlyPrice" IS NULL OR
      "compareAtMonthlyPrice" > "monthlyPrice"
    );
