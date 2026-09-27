-- Daily analytics rollup + the jobs that maintain it and send weekly summaries.
-- Idempotent throughout.

ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'ANALYTICS_ROLLUP';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'WEEKLY_REPORT_SWEEP';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'WEEKLY_REPORT';

CREATE TABLE IF NOT EXISTS "AnalyticsDailyStat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "viewContent" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "checkouts" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsDailyStat_workspaceId_day_key" ON "AnalyticsDailyStat"("workspaceId", "day");
CREATE INDEX IF NOT EXISTS "AnalyticsDailyStat_workspaceId_day_idx" ON "AnalyticsDailyStat"("workspaceId", "day");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsDailyStat_workspaceId_fkey'
      AND conrelid = '"AnalyticsDailyStat"'::regclass
  ) THEN
    ALTER TABLE "AnalyticsDailyStat"
      ADD CONSTRAINT "AnalyticsDailyStat_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
