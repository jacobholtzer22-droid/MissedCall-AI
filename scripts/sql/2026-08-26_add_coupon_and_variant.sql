-- Funnel v2: A/B variant tracking + the $200 setup coupon.
-- Additive only: two nullable columns and one new table. Safe on production,
-- no backfill, existing rows unaffected.
-- Apply with `npm run db:push`, or run this directly against DIRECT_URL.

ALTER TABLE "Appointment"  ADD COLUMN IF NOT EXISTS "variant" TEXT;
ALTER TABLE "WebsiteLead"  ADD COLUMN IF NOT EXISTS "variant" TEXT;
CREATE INDEX IF NOT EXISTS "WebsiteLead_variant_idx" ON "WebsiteLead"("variant");

CREATE TABLE IF NOT EXISTS "CouponClaim" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "leadId" TEXT,
    "variant" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    CONSTRAINT "CouponClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CouponClaim_code_key"      ON "CouponClaim"("code");
CREATE INDEX        IF NOT EXISTS "CouponClaim_visitorId_idx" ON "CouponClaim"("visitorId");
CREATE INDEX        IF NOT EXISTS "CouponClaim_leadId_idx"    ON "CouponClaim"("leadId");
CREATE INDEX        IF NOT EXISTS "CouponClaim_expiresAt_idx" ON "CouponClaim"("expiresAt");
