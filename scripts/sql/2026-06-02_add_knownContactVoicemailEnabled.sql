-- Build 2, Step 1 — Additive schema change for Business.knownContactVoicemailEnabled
-- Project uses `prisma db push` (no prisma/migrations/ dir). This is the exact
-- equivalent SQL for review. DO NOT run against prod until approved.
--
-- Additive only: new NOT NULL column with DEFAULT false, so every existing business
-- gets false and behavior is unchanged until the toggle is flipped on per business.

ALTER TABLE "Business"
  ADD COLUMN "knownContactVoicemailEnabled" BOOLEAN NOT NULL DEFAULT false;
