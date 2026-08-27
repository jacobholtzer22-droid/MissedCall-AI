-- Adds spam-scoring columns to WebsiteLead. See lib/spam-score.ts.
--
-- Applied with `npm run db:push` (this project has no prisma/migrations/ and
-- `prisma migrate` must not be run). This file mirrors that change for the record,
-- matching the convention of the other files in scripts/sql/.
--
-- All four columns are nullable with no default: existing rows stay untouched and
-- every existing query keeps working. A null spamScore is meaningful — it marks a
-- row written before scoring existed, which is different from a row that scored 0.

ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "spamScore"   INTEGER;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "spamReasons" JSONB;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "sourceIp"    TEXT;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "userAgent"   TEXT;
