-- Abandoned checkout recovery: recurring sweep plus buyer reminder audit trail.
ALTER TYPE "ScheduledJobKind" ADD VALUE 'ABANDONED_CHECKOUT_SWEEP';

ALTER TYPE "StoreNotificationEvent" ADD VALUE 'ABANDONED_CHECKOUT_REMINDER';
