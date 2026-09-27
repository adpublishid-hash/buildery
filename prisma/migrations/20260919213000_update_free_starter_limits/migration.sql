UPDATE "SaaSPlan"
SET
  "courseLimit" = 0,
  "formLimit" = 0,
  "monthlyOrderLimit" = 100,
  "orderRetentionMonths" = 2,
  "features" = '["1 workspace", "5 pages", "5 products", "100 orders per month", "2 months order history", "Blog included"]'::jsonb
WHERE "tier" = 'FREE';

UPDATE "SaaSPlan"
SET
  "workspaceLimit" = 3,
  "features" = '["3 workspaces", "20 pages", "50 products", "5 courses", "Blog & forms included"]'::jsonb
WHERE "tier" = 'STARTER';
