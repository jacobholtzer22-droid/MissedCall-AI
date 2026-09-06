-- OTP delivery tracking (Sep 2026). Additive and nullable.
--
-- The send route logged the Telnyx message id to the console and threw it away,
-- so "did the code actually arrive" could only be answered by matching phone
-- and timestamp against the messaging detail records. Five of the first sixteen
-- sends turned out to be error 40001 (landline / not routable), which is
-- invisible in the funnel without this.

ALTER TABLE "PhoneVerification"
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatus"    TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryError"     TEXT;
