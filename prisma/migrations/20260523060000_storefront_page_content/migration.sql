-- CreateTable
CREATE TABLE "StorefrontPageContent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontPageContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorefrontPageContent_workspaceId_idx" ON "StorefrontPageContent"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPageContent_workspaceId_pageKey_key" ON "StorefrontPageContent"("workspaceId", "pageKey");

-- AddForeignKey
ALTER TABLE "StorefrontPageContent" ADD CONSTRAINT "StorefrontPageContent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
