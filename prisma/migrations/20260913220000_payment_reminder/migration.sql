-- A nudge before an unpaid order expires.
--
-- A pending order simply lapsed after the payment timeout — 24 hours by
-- default — without the buyer ever being told the window was closing.

ALTER TYPE "StoreNotificationEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER_SWEEP';

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "remindedAt" TIMESTAMP(3);

-- The sweep looks for pending payments whose window is nearly up.
CREATE INDEX IF NOT EXISTS "Payment_status_expiresAt_remindedAt_idx"
  ON "Payment" ("status", "expiresAt", "remindedAt");
