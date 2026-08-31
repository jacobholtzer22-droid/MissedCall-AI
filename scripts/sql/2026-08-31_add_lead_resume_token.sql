-- Lead-facing demo SMS: resume link token + one-shot send marker.
-- Additive only, both nullable. Safe on production, no backfill.

ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "resumeToken"   TEXT;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "demoSmsSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "WebsiteLead_resumeToken_key" ON "WebsiteLead"("resumeToken");
