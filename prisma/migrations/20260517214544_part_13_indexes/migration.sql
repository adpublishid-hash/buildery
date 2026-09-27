-- CreateIndex
CREATE INDEX "Course_workspaceId_status_idx" ON "Course"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_idx" ON "Order"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Product_workspaceId_status_idx" ON "Product"("workspaceId", "status");

