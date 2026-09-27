CREATE TYPE "PageRevisionSource" AS ENUM ('AUTOSAVE', 'MANUAL', 'PUBLISH', 'RESTORE');

ALTER TABLE "Website"
  ADD COLUMN "designTokens" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Page"
  ADD COLUMN "editVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PageRevision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source" "PageRevisionSource" NOT NULL DEFAULT 'MANUAL',
  "blocks" JSONB NOT NULL,
  "blockCount" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedSection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  "blockCount" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedSection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSection" ADD CONSTRAINT "SavedSection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSection" ADD CONSTRAINT "SavedSection_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PageRevision_pageId_version_key" ON "PageRevision"("pageId", "version");
CREATE INDEX "PageRevision_pageId_createdAt_idx" ON "PageRevision"("pageId", "createdAt");
CREATE INDEX "PageRevision_createdById_idx" ON "PageRevision"("createdById");
CREATE UNIQUE INDEX "SavedSection_workspaceId_name_key" ON "SavedSection"("workspaceId", "name");
CREATE INDEX "SavedSection_workspaceId_updatedAt_idx" ON "SavedSection"("workspaceId", "updatedAt");
CREATE INDEX "SavedSection_createdById_idx" ON "SavedSection"("createdById");
