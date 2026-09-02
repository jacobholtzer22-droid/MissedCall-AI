-- Arm attribution ledger for /book: one row per gate view and one per
-- OTP-verified lead. Separate from FunnelEvent because that table is
-- deliberately PII-free and this one needs trade, business name and phone.
CREATE TABLE IF NOT EXISTS "ArmEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "arm" TEXT NOT NULL,
    "trade" TEXT,
    "businessName" TEXT,
    "phone" TEXT,
    "visitorId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArmEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ArmEvent_arm_type_createdAt_idx" ON "ArmEvent"("arm", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "ArmEvent_createdAt_idx" ON "ArmEvent"("createdAt");
