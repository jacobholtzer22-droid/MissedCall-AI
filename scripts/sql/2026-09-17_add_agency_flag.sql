-- Landing-calendar agency CHECK (Sep 2026). Flag only, never blocks.
-- Additive and nullable. Applied with `npm run db:push`; mirrored here.

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "agencyFlagTerm"  TEXT,
  ADD COLUMN IF NOT EXISTS "agencyFlagField" TEXT;

ALTER TABLE "WebsiteLead"
  ADD COLUMN IF NOT EXISTS "agencyFlagTerm"  TEXT,
  ADD COLUMN IF NOT EXISTS "agencyFlagField" TEXT;
