-- Attribution upgrade for the /book funnel (Sep 2026).
--
-- Purely additive and nullable, so it is safe to apply before the code that
-- writes it ships (expand-then-deploy). Existing rows keep NULL, which the
-- admin readout renders as "no signal captured" rather than inventing one.
--
-- Applied with `npm run db:push`; kept here because this repo has no
-- prisma/migrations baseline.

ALTER TABLE "WebsiteLead"
  ADD COLUMN IF NOT EXISTS "attributionFirst" JSONB,
  ADD COLUMN IF NOT EXISTS "attributionLast"  JSONB,
  ADD COLUMN IF NOT EXISTS "fbp"              TEXT,
  ADD COLUMN IF NOT EXISTS "fbc"              TEXT,
  ADD COLUMN IF NOT EXISTS "bookingSurface"   TEXT;

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "attributionFirst" JSONB,
  ADD COLUMN IF NOT EXISTS "attributionLast"  JSONB,
  ADD COLUMN IF NOT EXISTS "bookingSurface"   TEXT;
