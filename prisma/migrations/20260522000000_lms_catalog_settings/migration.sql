-- CreateTable
CREATE TABLE "LmsSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "catalogEyebrow" TEXT,
    "catalogHeading" TEXT,
    "catalogSubheading" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LmsSetting_workspaceId_key" ON "LmsSetting"("workspaceId");

-- AddForeignKey
ALTER TABLE "LmsSetting" ADD CONSTRAINT "LmsSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
