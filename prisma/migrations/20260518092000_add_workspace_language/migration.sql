CREATE TYPE "WorkspaceLanguage" AS ENUM ('ID', 'EN');

ALTER TABLE "Workspace" ADD COLUMN "language" "WorkspaceLanguage" NOT NULL DEFAULT 'ID';
