-- Build 1, Step 1 — Additive schema change for Contact.isClientContact
-- Project uses `prisma db push` (no prisma/migrations/ dir). This file is the
-- exact equivalent SQL for review. DO NOT run against prod until approved.
--
-- Additive only: new NOT NULL column with a DEFAULT, so existing rows backfill
-- to false automatically and no existing read changes. No data loss.

ALTER TABLE "Contact"
  ADD COLUMN "isClientContact" BOOLEAN NOT NULL DEFAULT false;

-- After this runs, apply the separate, reviewed backfill (Step 2) to flip the
-- client's own contacts (imports / manual / admin-curated null-source) to true.
