-- Once-per-lead guard on the Meta Lead event (Sep 2026).
-- Additive and nullable. Applied with `npm run db:push`; mirrored here.

ALTER TABLE "WebsiteLead"
  ADD COLUMN IF NOT EXISTS "leadEventSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leadEventId"     TEXT;

-- Backfill: every row that passed OTP before this deploy already had its Lead
-- fired at OTP (qualified) or deliberately did not (unqualified). Either way a
-- later landing booking must not fire one now.
UPDATE "WebsiteLead"
   SET "leadEventSentAt" = "otpVerifiedAt"
 WHERE "otpVerifiedAt" IS NOT NULL
   AND "leadEventSentAt" IS NULL;
