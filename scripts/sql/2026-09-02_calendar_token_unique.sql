-- calendarToken is now a short random token verified by lookup, so it must be
-- unique. Postgres allows unlimited NULLs under a unique index, so rows without
-- a token are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "WebsiteLead_calendarToken_key" ON "WebsiteLead"("calendarToken");
