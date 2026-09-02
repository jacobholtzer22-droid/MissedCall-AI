-- 24h "still no booking" follow-up claim stamp for /book leads.
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "followUpSentAt" TIMESTAMP(3);
