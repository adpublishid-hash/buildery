-- CreateTable
CREATE TABLE "OrderRefundEvidence" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRefundEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRefundEvidence_refundId_idx" ON "OrderRefundEvidence"("refundId");

-- AddForeignKey
ALTER TABLE "OrderRefundEvidence" ADD CONSTRAINT "OrderRefundEvidence_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
