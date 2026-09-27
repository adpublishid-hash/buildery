-- CreateTable
CREATE TABLE IF NOT EXISTS "HtmlTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB NOT NULL,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HtmlTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HtmlTemplate_workspaceId_updatedAt_idx" ON "HtmlTemplate"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "HtmlTemplate" DROP CONSTRAINT IF EXISTS "HtmlTemplate_workspaceId_fkey";
ALTER TABLE "HtmlTemplate" ADD CONSTRAINT "HtmlTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
