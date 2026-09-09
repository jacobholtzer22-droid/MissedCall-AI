-- Gate filters: agency dead-end, "other" free text, junk flag (Sep 2026).
-- Additive; junk defaults false so every existing row keeps today's behaviour.

ALTER TABLE "WebsiteLead"
  ADD COLUMN IF NOT EXISTS "businessName" TEXT,
  ADD COLUMN IF NOT EXISTS "tradeOther"   TEXT,
  ADD COLUMN IF NOT EXISTS "junk"         BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GateDraft"
  ADD COLUMN IF NOT EXISTS "tradeOther"   TEXT,
  ADD COLUMN IF NOT EXISTS "businessName" TEXT;
