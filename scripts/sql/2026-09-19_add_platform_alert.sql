-- PlatformAlert (Sep 2026): health alerts for the platform owner, written by
-- lib/platform-alert.ts. Mirror of the schema.prisma change; applied with
-- `npm run db:push`.
--
-- Additive only, and safe to re-run: every statement is CREATE / ADD with an
-- existence guard. Nothing is dropped or altered on any existing table.
-- businessId is ON DELETE SET NULL on purpose: deleting a client must not erase
-- the record of what went wrong for them.

CREATE TABLE IF NOT EXISTS "PlatformAlert" (
  "id"         TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "severity"   TEXT NOT NULL DEFAULT 'warning',
  "businessId" TEXT,
  "title"      TEXT NOT NULL,
  "detail"     TEXT NOT NULL,
  "metadata"   JSONB,
  "dedupeKey"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emailedAt"  TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformAlert_type_businessId_createdAt_idx"
  ON "PlatformAlert"("type", "businessId", "createdAt");

CREATE INDEX IF NOT EXISTS "PlatformAlert_dedupeKey_createdAt_idx"
  ON "PlatformAlert"("dedupeKey", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAlert_businessId_fkey'
  ) THEN
    ALTER TABLE "PlatformAlert"
      ADD CONSTRAINT "PlatformAlert_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
