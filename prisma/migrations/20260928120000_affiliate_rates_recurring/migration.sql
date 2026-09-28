-- Per-item and per-partner affiliate commission rates, and recurring
-- commissions on membership renewals. All nullable / defaulted, so existing
-- rows keep today's behaviour (program-wide rate, first-click-only renewals).
ALTER TABLE "Product" ADD COLUMN "affiliateCommissionPercent" INTEGER;
ALTER TABLE "Course" ADD COLUMN "affiliateCommissionPercent" INTEGER;
ALTER TABLE "MembershipPlan" ADD COLUMN "affiliateCommissionPercent" INTEGER;
ALTER TABLE "Affiliate" ADD COLUMN "commissionPercent" INTEGER;
ALTER TABLE "AffiliateProgram" ADD COLUMN "recurringCommissions" BOOLEAN NOT NULL DEFAULT false;
