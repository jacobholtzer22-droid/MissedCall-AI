-- /admin/ops?tab=hq (Oct 2026): Ops HQ. Jacob talks to a chief agent, the chief
-- hands work to specialist agents (ads, web), every step streams into a live
-- feed, and each job ends with approvals Jacob pushes or rejects.
--
-- Four new tables: OpsJob (one request and its final report), OpsMessage (the
-- HQ chat log; jobId optional), AgentEvent (the live feed, one row per content
-- block or status change), OpsApproval (a proposed change waiting for Push).
-- AgentRun gains three nullable columns: jobId, agent (chief | ads | web; null =
-- the pre-HQ web dispatches) and mode (work | apply).
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written, so it matches the schema exactly. Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-26_add_ops_hq.sql --schema prisma/schema.prisma`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only: CREATE TABLE x4, ADD COLUMN x3 on "AgentRun" (nullable, no
-- default, existing rows untouched), indexes and foreign keys. No other table
-- is touched. Nothing is dropped. No IF NOT EXISTS guards, so run it once.
-- Wrapped in one transaction: a failure part way leaves nothing behind.

BEGIN;

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "agent" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "mode" TEXT;

-- CreateTable
CREATE TABLE "OpsJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "summary" TEXT,
    "engagementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "OpsJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsMessage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsApproval" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "expected" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsJob_status_idx" ON "OpsJob"("status");

-- CreateIndex
CREATE INDEX "OpsJob_createdAt_idx" ON "OpsJob"("createdAt");

-- CreateIndex
CREATE INDEX "OpsMessage_createdAt_idx" ON "OpsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "OpsMessage_jobId_idx" ON "OpsMessage"("jobId");

-- CreateIndex
CREATE INDEX "AgentEvent_runId_createdAt_idx" ON "AgentEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_createdAt_idx" ON "AgentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OpsApproval_status_createdAt_idx" ON "OpsApproval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OpsApproval_jobId_idx" ON "OpsApproval"("jobId");

-- CreateIndex
CREATE INDEX "AgentRun_jobId_idx" ON "AgentRun"("jobId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OpsJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsMessage" ADD CONSTRAINT "OpsMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OpsJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsApproval" ADD CONSTRAINT "OpsApproval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OpsJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsApproval" ADD CONSTRAINT "OpsApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
