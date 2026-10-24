-- /admin/ops (Oct 2026): waiting-on steps. Adds four nullable columns to
-- Deliverable: step (a key from lib/ops/steps.ts STEP_CATALOG), waitingOn
-- (jacob | client | vendor), waitingNote and stepUpdatedAt.
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written, so it matches the schema exactly. Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-24_add_deliverable_steps.sql`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only: one ALTER TABLE on "Deliverable", ADD COLUMN only, every
-- column nullable with no default, so existing rows are untouched. No other
-- table is touched. Nothing is dropped. No IF NOT EXISTS guards, so run it once.
-- Wrapped in one transaction: a failure part way leaves nothing behind.

BEGIN;

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "step" TEXT,
ADD COLUMN     "stepUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "waitingNote" TEXT,
ADD COLUMN     "waitingOn" TEXT;


COMMIT;
