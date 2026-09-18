-- /admin/pipeline (Sep 2026): outcome + follow-up tracking, one row per person.
--
-- Applied as raw SQL with `prisma db execute`, NOT `npm run db:push`: two
-- sessions were editing schema.prisma at once, and db push diffs against one
-- schema file, so it would drop the other session's columns.
--
-- Additive only, and safe to re-run: every statement is ADD / CREATE with an
-- existence guard. Nothing is dropped or altered. Existing appointments land as
-- showStatus='pending'; nobody has a PipelinePerson row until the first write,
-- which the app reads as status 'pending'. Nothing on the booking path, the
-- reminder cron or the calendar sync reads or writes any of this.

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "showStatus" TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS "PipelinePerson" (
  "id"              TEXT NOT NULL,
  "businessId"      TEXT NOT NULL,
  "personKey"       TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "lostReason"      TEXT,
  "closedAt"        TIMESTAMP(3),
  "mrr"             DOUBLE PRECISION,
  "setupFee"        DOUBLE PRECISION,
  "lastContactedAt" TIMESTAMP(3),
  "nextFollowUpAt"  TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelinePerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PipelineNote" (
  "id"        TEXT NOT NULL,
  "personId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "kind"      TEXT NOT NULL DEFAULT 'note',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PipelinePerson_businessId_personKey_key"
  ON "PipelinePerson"("businessId", "personKey");

CREATE INDEX IF NOT EXISTS "PipelineNote_personId_createdAt_idx"
  ON "PipelineNote"("personId", "createdAt");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; these guards are the equivalent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelinePerson_businessId_fkey') THEN
    ALTER TABLE "PipelinePerson" ADD CONSTRAINT "PipelinePerson_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelineNote_personId_fkey') THEN
    ALTER TABLE "PipelineNote" ADD CONSTRAINT "PipelineNote_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "PipelinePerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
