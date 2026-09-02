-- The follow-up cron keys on proof of OTP, never on row creation.
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "otpVerifiedAt" TIMESTAMP(3);
