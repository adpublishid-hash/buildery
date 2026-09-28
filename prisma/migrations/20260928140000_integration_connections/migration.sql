-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('EMAIL', 'PAYMENT', 'INBOX', 'SHIPPING');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('UNTESTED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "webhookKey" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_webhookKey_key" ON "IntegrationConnection"("webhookKey");

-- CreateIndex
CREATE INDEX "IntegrationConnection_workspaceId_category_idx" ON "IntegrationConnection"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_workspaceId_provider_key" ON "IntegrationConnection"("workspaceId", "provider");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

