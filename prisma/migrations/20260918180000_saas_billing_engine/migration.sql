-- Mesin billing SaaS: invoice QRIS tercatat, masa aktif yang benar-benar
-- ditagih, dan konfigurasi pembayaran yang bisa dirotasi tanpa deploy.
--
-- Ditulis idempoten supaya aman dijalankan ulang di database yang sebagian
-- objeknya sudah ada.

-- ============================================================
-- Enum
-- ============================================================

DO $$
BEGIN
  CREATE TYPE "SaaSInvoiceKind" AS ENUM ('NEW', 'RENEWAL', 'UPGRADE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SaaSInvoiceStatus" AS ENUM (
    'AWAITING_PAYMENT',
    'AWAITING_VERIFICATION',
    'PAID',
    'REJECTED',
    'EXPIRED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'SAAS_BILLING_SWEEP';

-- ============================================================
-- SaaSSubscription — siklus hidup masa aktif
-- ============================================================

ALTER TABLE "SaaSSubscription"
  ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "graceUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastReminderStage" INTEGER NOT NULL DEFAULT 0;

-- Langganan yang sudah dibatalkan sebelum migrasi ini memang berhenti seketika;
-- tandai supaya sweep tidak mencoba menutupnya lagi di akhir periode.
UPDATE "SaaSSubscription"
SET "cancelAtPeriodEnd" = false
WHERE "status" = 'CANCELLED' AND "cancelAtPeriodEnd" IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS "SaaSSubscription_status_currentPeriodEnd_idx"
  ON "SaaSSubscription" ("status", "currentPeriodEnd");

-- ============================================================
-- SaaSInvoice
-- ============================================================

CREATE TABLE IF NOT EXISTS "SaaSInvoice" (
  "id"               TEXT NOT NULL,
  "number"           TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "planId"           TEXT NOT NULL,
  "tier"             "SaaSPlanTier" NOT NULL,
  "kind"             "SaaSInvoiceKind" NOT NULL DEFAULT 'NEW',
  "status"           "SaaSInvoiceStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "listPrice"        INTEGER NOT NULL,
  "promoPrice"       INTEGER NOT NULL,
  "proratedCredit"   INTEGER NOT NULL DEFAULT 0,
  "uniqueCode"       INTEGER NOT NULL,
  "totalAmount"      INTEGER NOT NULL,
  "periodMonths"     INTEGER NOT NULL DEFAULT 1,
  "openAmountKey"    TEXT,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "paidAt"           TIMESTAMP(3),
  "periodStart"      TIMESTAMP(3),
  "periodEnd"        TIMESTAMP(3),
  "proofUrl"         TEXT,
  "proofNote"        TEXT,
  "proofStatus"      "ManualPaymentProofStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  "proofSubmittedAt" TIMESTAMP(3),
  "reviewedAt"       TIMESTAMP(3),
  "reviewedById"     TEXT,
  "reviewNote"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SaaSInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SaaSInvoice_number_key"
  ON "SaaSInvoice" ("number");

-- Inti jaminan kode unik: satu nominal transfer hanya boleh dimiliki satu
-- invoice yang masih terbuka. Kolomnya dikosongkan saat invoice selesai, dan
-- Postgres menganggap NULL berbeda satu sama lain, jadi riwayat lama dengan
-- nominal sama tetap boleh tersimpan.
CREATE UNIQUE INDEX IF NOT EXISTS "SaaSInvoice_openAmountKey_key"
  ON "SaaSInvoice" ("openAmountKey");

CREATE INDEX IF NOT EXISTS "SaaSInvoice_userId_createdAt_idx"
  ON "SaaSInvoice" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_status_expiresAt_idx"
  ON "SaaSInvoice" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_status_proofSubmittedAt_idx"
  ON "SaaSInvoice" ("status", "proofSubmittedAt");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_planId_idx"
  ON "SaaSInvoice" ("planId");
CREATE INDEX IF NOT EXISTS "SaaSInvoice_reviewedById_idx"
  ON "SaaSInvoice" ("reviewedById");

DO $$
BEGIN
  ALTER TABLE "SaaSInvoice"
    ADD CONSTRAINT "SaaSInvoice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "SaaSInvoice"
    ADD CONSTRAINT "SaaSInvoice_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "SaaSPlan" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "SaaSInvoice"
    ADD CONSTRAINT "SaaSInvoice_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "SaaSInvoice"
    ADD CONSTRAINT "SaaSInvoice_amounts_valid"
      CHECK (
        "listPrice" >= 0 AND
        "promoPrice" >= 0 AND
        "proratedCredit" >= 0 AND
        "totalAmount" >= 0 AND
        "periodMonths" >= 1
      );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ============================================================
-- SaaSBillingSetting — satu baris, id "default"
-- ============================================================

CREATE TABLE IF NOT EXISTS "SaaSBillingSetting" (
  "id"                 TEXT NOT NULL DEFAULT 'default',
  "qrisImageUrl"       TEXT,
  "qrisMerchantName"   TEXT,
  "whatsappNumber"     TEXT,
  "paymentInstruction" TEXT,
  "invoiceWindowHours" INTEGER NOT NULL DEFAULT 24,
  "graceDays"          INTEGER NOT NULL DEFAULT 3,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SaaSBillingSetting_pkey" PRIMARY KEY ("id")
);

-- Nilai yang sebelumnya di-hardcode di komponen pricing, dipindah ke sini
-- supaya QR dan nomor konfirmasi bisa diganti dari admin.
INSERT INTO "SaaSBillingSetting" (
  "id", "qrisImageUrl", "qrisMerchantName", "whatsappNumber",
  "paymentInstruction", "invoiceWindowHours", "graceDays", "updatedAt"
)
VALUES (
  'default',
  'https://adpublish.id/wp-content/uploads/2026/03/QRStatis-indigit.jpg',
  'My Landing',
  '6289685350650',
  'Transfer sesuai total pembayaran sampai 3 digit terakhir, lalu unggah bukti transfer. Verifikasi admin maksimal 1x24 jam.',
  24,
  3,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- Plan BUSINESS tidak pernah ditampilkan di pricing; jangan biarkan bocor
-- lewat query lain yang hanya memfilter isPublic.
-- ============================================================

UPDATE "SaaSPlan" SET "isPublic" = false WHERE "tier" = 'BUSINESS';
