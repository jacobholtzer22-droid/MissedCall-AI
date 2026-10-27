-- Ops HQ (Oct 2026): a chief run spans the whole board and has no single
-- client, so AgentRun.engagementId becomes nullable. Every existing row keeps
-- its engagementId; the foreign key and its ON DELETE CASCADE are unchanged.
-- Only the chief sets it to null; web and ads runs always carry a client.
--
-- Generated with `prisma migrate diff` (ops-hq's schema after
-- 2026-10-26_add_ops_hq.sql -> with this change). Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-26_ops_hq_chief_runs.sql --schema prisma/schema.prisma`,
-- after 2026-10-26_add_ops_hq.sql. NOT `npm run db:push`.
--
-- One ALTER COLUMN, DROP NOT NULL only. No data changes, nothing dropped.
-- Safe to re-run (dropping NOT NULL twice is a no-op).

BEGIN;

-- AlterTable
ALTER TABLE "AgentRun" ALTER COLUMN "engagementId" DROP NOT NULL;


COMMIT;
