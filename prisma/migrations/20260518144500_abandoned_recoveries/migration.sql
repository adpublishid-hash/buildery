CREATE TYPE "AbandonedRecoveryStatus" AS ENUM ('OPEN', 'CONTACTED', 'SNOOZED', 'RECOVERED', 'IGNORED');

CREATE TABLE "AbandonedCheckoutRecovery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "AbandonedRecoveryStatus" NOT NULL DEFAULT 'OPEN',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastContactedAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),
  "recoveredAt" TIMESTAMP(3),
  "ignoredAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbandonedCheckoutRecovery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AbandonedCheckoutRecovery"
  ADD CONSTRAINT "AbandonedCheckoutRecovery_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AbandonedCheckoutRecovery"
  ADD CONSTRAINT "AbandonedCheckoutRecovery_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AbandonedCheckoutRecovery_orderId_key" ON "AbandonedCheckoutRecovery"("orderId");
CREATE INDEX "AbandonedCheckoutRecovery_workspaceId_status_idx" ON "AbandonedCheckoutRecovery"("workspaceId", "status");
CREATE INDEX "AbandonedCheckoutRecovery_snoozedUntil_idx" ON "AbandonedCheckoutRecovery"("snoozedUntil");
