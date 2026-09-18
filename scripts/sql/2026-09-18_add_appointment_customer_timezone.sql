-- Booker time zone on /book demo appointments (Sep 2026).
-- Every text, email and invite a booker receives renders the call in this zone.
-- Additive and nullable: null means "not captured", which renders ET as before.
--
-- MUST be applied BEFORE the code that writes these columns is deployed. Prisma
-- selects every column on appointment reads, so the new client against a table
-- without them fails every booking and every reminder run.

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "customerTimezone"       TEXT,
  ADD COLUMN IF NOT EXISTS "customerTimezoneSource" TEXT;
