-- OTP phone verification for the /book funnel (both arms).
--
-- One row per SEND, not per phone. That is what makes the fraud caps countable
-- with a plain query: in-memory limiting is per-lambda on Vercel and therefore
-- not a real limit. The code is stored only as a hash.
CREATE TABLE IF NOT EXISTS "PhoneVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "visitorId" TEXT,
    "variant" TEXT,
    "funnelVariant" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneVerification_ip_createdAt_idx" ON "PhoneVerification"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneVerification_createdAt_idx" ON "PhoneVerification"("createdAt");
