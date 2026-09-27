CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'SNOOZED', 'DONE');
CREATE TYPE "FollowUpPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "FollowUpChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PHONE', 'MANUAL');

CREATE TABLE "FollowUpTask" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "channel" "FollowUpChannel" NOT NULL DEFAULT 'EMAIL',
  "priority" "FollowUpPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FollowUpTask"
  ADD CONSTRAINT "FollowUpTask_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpTask"
  ADD CONSTRAINT "FollowUpTask_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FollowUpTask"
  ADD CONSTRAINT "FollowUpTask_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FollowUpTask_workspaceId_status_dueAt_idx" ON "FollowUpTask"("workspaceId", "status", "dueAt");
CREATE INDEX "FollowUpTask_customerId_idx" ON "FollowUpTask"("customerId");
CREATE INDEX "FollowUpTask_orderId_idx" ON "FollowUpTask"("orderId");
