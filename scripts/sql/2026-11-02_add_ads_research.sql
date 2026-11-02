-- Ops HQ Research desk and per-trade learnings (Nov 2026).
-- Two new tables, nothing else:
--   AdsBrief          one campaign brief per research run (agent research,
--                     kind ads_research): markdown body plus the same brief as
--                     JSON, on the client (Engagement, cascade).
--   AdsTradeLearning  one row per trade per month from lib/ops/hq/learnings.ts,
--                     unique on (tradeKey, periodStart).
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written (IF NOT EXISTS added, and the foreign key guarded, so a rerun
-- is harmless). Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-11-02_add_ads_research.sql`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only. Run it BEFORE the code is deployed: the HQ feed and the board
-- read AdsBrief. Code already deployed without the models ignores the tables.
--
-- Applied to production 2026-11-02.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdsBrief" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "runId" TEXT,
    "tradeKey" TEXT,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdsTradeLearning" (
    "id" TEXT NOT NULL,
    "tradeKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "accounts" JSONB NOT NULL,
    "convertingTerms" JSONB NOT NULL,
    "wastedTerms" JSONB NOT NULL,
    "negativesInUse" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsTradeLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdsBrief_engagementId_createdAt_idx" ON "AdsBrief"("engagementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdsTradeLearning_tradeKey_periodStart_key" ON "AdsTradeLearning"("tradeKey", "periodStart");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AdsBrief" ADD CONSTRAINT "AdsBrief_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
