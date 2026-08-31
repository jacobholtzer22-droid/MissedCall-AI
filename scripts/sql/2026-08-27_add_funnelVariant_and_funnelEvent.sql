-- Funnel video A/B + per-screen gate analytics.
-- Additive only: two nullable columns and one new table. Backward compatible,
-- the currently deployed build references none of it.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "funnelVariant" TEXT;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "funnelVariant" TEXT;

CREATE TABLE IF NOT EXISTS "FunnelEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "step" TEXT,
    "visitorId" TEXT,
    "variant" TEXT,
    "funnelVariant" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FunnelEvent_name_createdAt_idx"  ON "FunnelEvent"("name","createdAt");
CREATE INDEX IF NOT EXISTS "FunnelEvent_visitorId_idx"       ON "FunnelEvent"("visitorId");
CREATE INDEX IF NOT EXISTS "FunnelEvent_funnelVariant_idx"   ON "FunnelEvent"("funnelVariant");
