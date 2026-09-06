-- OTP voice fallback + line type (Sep 2026). Additive and nullable.
--
-- 5 of the first 16 codes failed with Telnyx 40001 (not routable). Three of
-- those were one person retrying a landline three times in 90 seconds and
-- getting nothing. lineType records what the pre-send lookup saw; voiceCode
-- holds the plaintext only while a voice delivery is in flight.

ALTER TABLE "PhoneVerification"
  ADD COLUMN IF NOT EXISTS "lineType"      TEXT,
  ADD COLUMN IF NOT EXISTS "voiceCode"     TEXT,
  ADD COLUMN IF NOT EXISTS "voiceCalledAt" TIMESTAMP(3);
