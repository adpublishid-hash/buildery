CREATE TYPE "StoreNotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "StoreNotificationEvent" AS ENUM ('ORDER_CREATED', 'PAYMENT_PAID');
CREATE TYPE "StoreNotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TABLE "StoreNotification" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "channel" "StoreNotificationChannel" NOT NULL,
  "event" "StoreNotificationEvent" NOT NULL,
  "status" "StoreNotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreNotification_workspaceId_createdAt_idx" ON "StoreNotification"("workspaceId", "createdAt");
CREATE INDEX "StoreNotification_orderId_idx" ON "StoreNotification"("orderId");
CREATE INDEX "StoreNotification_customerId_idx" ON "StoreNotification"("customerId");

ALTER TABLE "StoreNotification" ADD CONSTRAINT "StoreNotification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreNotification" ADD CONSTRAINT "StoreNotification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreNotification" ADD CONSTRAINT "StoreNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
