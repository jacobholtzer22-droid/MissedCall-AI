-- Marketing funnel (/book) demo-call reminders.
-- Two independent nullable timestamps so each reminder is separately idempotent.
-- Additive and nullable: safe to run against production with no downtime and no
-- backfill. Existing rows get NULL, which means "not yet sent".
--
-- Apply with `npm run db:push`, or run this directly against DIRECT_URL.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminderNightBeforeSentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminderHourBeforeSentAt"  TIMESTAMP(3);
