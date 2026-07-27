-- No-reply owner alert — additive schema change
-- Project uses `prisma db push` (no prisma/migrations/ dir). This file is the
-- exact equivalent SQL for review.
--
-- Additive only: two Business columns with defaults (feature off for every
-- existing business until toggled on in /admin) and one nullable Conversation
-- timestamp. No existing read changes, no data loss.

ALTER TABLE "Business"
  ADD COLUMN "noReplyAlertEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Business"
  ADD COLUMN "noReplyAlertMinutes" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "Conversation"
  ADD COLUMN "noReplyAlertSentAt" TIMESTAMP(3);
