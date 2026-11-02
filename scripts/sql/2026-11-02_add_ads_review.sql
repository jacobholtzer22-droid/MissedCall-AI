-- Ops HQ weekly ads review (Nov 2026). One new table, nothing else:
--   AdsReview  one row per weekly review run (agent ads, kind ads_review): the
--              numbers the code read (7d and 30d), the changes the run made, its
--              proposals (with the approval id once created), alert flags and a
--              short summary, on the client (Engagement, cascade).
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written (IF NOT EXISTS added, and the foreign key guarded, so a rerun
-- is harmless). Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-11-02_add_ads_review.sql`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only. Run it BEFORE the code is deployed: the board reads the latest
-- AdsReview (caught when the table is missing), the review job writes it.
--
-- Not applied yet (waiting on Jacob).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdsReview" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "runId" TEXT,
    "customerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "trackingState" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "proposals" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdsReview_engagementId_createdAt_idx" ON "AdsReview"("engagementId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AdsReview" ADD CONSTRAINT "AdsReview_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
