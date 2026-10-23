-- /admin/ops (Oct 2026): delivery tracking for paid clients. Adds five tables:
-- Engagement (one row per client, bridging a won PipelinePerson and the
-- Business row they become), Deliverable (one per thing sold), OpsCheck
-- (automated check results per deliverable), OpsActivity (post-sale contact
-- log) and AgentRun (agent dispatch log).
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written, so it matches the schema exactly. Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-24_add_ops.sql`, NOT
-- `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only. Every CREATE and ALTER targets one of the five new tables;
-- Business and PipelinePerson appear only as foreign-key targets, and no
-- existing table gains, loses or changes a column. Nothing is dropped.
-- Unlike the pipeline SQL there are no IF NOT EXISTS guards, so run it once.

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "pipelinePersonId" TEXT,
    "displayName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "trade" TEXT,
    "location" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "services" JSONB NOT NULL DEFAULT '[]',
    "stage" TEXT NOT NULL DEFAULT 'prospect',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeSubscriptionStatus" TEXT,
    "upfrontPaidAt" TIMESTAMP(3),
    "upfrontAmount" DOUBLE PRECISION,
    "monthlyAmount" DOUBLE PRECISION,
    "monthlyStartedAt" TIMESTAMP(3),
    "stripeSyncedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "computedStatus" TEXT NOT NULL DEFAULT 'unknown',
    "manualStatus" TEXT,
    "manualStatusNote" TEXT,
    "manualStatusAt" TIMESTAMP(3),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsCheck" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "passed" BOOLEAN,
    "detail" TEXT,
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsActivity" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "externalId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_businessId_key" ON "Engagement"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_pipelinePersonId_key" ON "Engagement"("pipelinePersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_stripeCustomerId_key" ON "Engagement"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Engagement_stage_idx" ON "Engagement"("stage");

-- CreateIndex
CREATE INDEX "Engagement_nextFollowUpAt_idx" ON "Engagement"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Engagement_email_idx" ON "Engagement"("email");

-- CreateIndex
CREATE INDEX "Engagement_phone_idx" ON "Engagement"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_engagementId_type_key" ON "Deliverable"("engagementId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "OpsCheck_deliverableId_key_key" ON "OpsCheck"("deliverableId", "key");

-- CreateIndex
CREATE INDEX "OpsActivity_engagementId_createdAt_idx" ON "OpsActivity"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_engagementId_createdAt_idx" ON "AgentRun"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_pipelinePersonId_fkey" FOREIGN KEY ("pipelinePersonId") REFERENCES "PipelinePerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsCheck" ADD CONSTRAINT "OpsCheck_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsActivity" ADD CONSTRAINT "OpsActivity_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

