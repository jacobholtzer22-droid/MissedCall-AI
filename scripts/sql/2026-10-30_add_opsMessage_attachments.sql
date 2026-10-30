-- HQ chat photo intake (Oct 2026): photos Jacob drops on the chief's composer.
-- Adds one nullable column to OpsMessage: attachments, a JSON list of
-- { url, filename, width, height, bytes, filedTo? } (files in Blob under
-- ops-inbox/). The chief's file_photos tool sets filedTo once it files one.
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written (IF NOT EXISTS added, so a rerun is harmless). Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-30_add_opsMessage_attachments.sql`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only: one ADD COLUMN, nullable, no default. Run it BEFORE the code
-- is deployed: Prisma reads every OpsMessage column by default (the HQ feed and
-- the chief), so the code fails against a database without it. Code already
-- deployed without the field ignores the column.
--
-- Applied to production 2026-10-30.

-- AlterTable
ALTER TABLE "OpsMessage" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
