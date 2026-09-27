-- CreateTable
CREATE TABLE "StorefrontSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "navBlogLabel" TEXT,
    "navCoursesLabel" TEXT,
    "navProductsLabel" TEXT,
    "navMembershipsLabel" TEXT,
    "navCartLabel" TEXT,
    "navAccountLabel" TEXT,
    "navLoginLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontSetting_workspaceId_key" ON "StorefrontSetting"("workspaceId");

-- AddForeignKey
ALTER TABLE "StorefrontSetting" ADD CONSTRAINT "StorefrontSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
