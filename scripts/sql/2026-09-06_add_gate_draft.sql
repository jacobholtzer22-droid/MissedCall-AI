-- CreateTable
CREATE TABLE "GateDraft" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "trade" TEXT,
    "firstName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "lastStep" TEXT,
    "arm" TEXT,
    "variant" TEXT,
    "landingPath" TEXT,
    "attributionFirst" JSONB,
    "attributionLast" JSONB,
    "promotedLeadId" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateDraft_visitorId_key" ON "GateDraft"("visitorId");

-- CreateIndex
CREATE INDEX "GateDraft_createdAt_idx" ON "GateDraft"("createdAt");

-- CreateIndex
CREATE INDEX "GateDraft_phone_idx" ON "GateDraft"("phone");

