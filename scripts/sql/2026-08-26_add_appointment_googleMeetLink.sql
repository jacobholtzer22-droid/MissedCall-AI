-- Google Meet link for a booking, captured from conferenceData on event insert.
-- Needed as a real column because the reminder SMS reads it back at send time.
-- Additive and nullable: safe to run against production, no backfill.
-- Apply with `npm run db:push`, or run this directly against DIRECT_URL.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "googleMeetLink" TEXT;
