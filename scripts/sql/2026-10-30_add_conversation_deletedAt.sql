-- Client Leads page (Oct 2026): soft delete for missed-call leads. Adds one
-- nullable column to Conversation: deletedAt, set by
-- DELETE /api/dashboard/conversations/[id]. Only the Leads page
-- (GET /api/dashboard/conversations?view=leads) filters on it; the Conversations
-- tab, /admin and the SMS webhook still read the row unchanged.
-- Website leads need no column: they use WebsiteLead.status = 'deleted'.
--
-- Generated with `prisma migrate diff` (main's schema.prisma -> this branch's),
-- not hand-written. Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-30_add_conversation_deletedAt.sql`,
-- NOT `npm run db:push`: db push diffs against one schema file and would drop
-- columns that exist in the database but not on this branch.
--
-- Additive only: one ADD COLUMN, nullable, no default. Run it BEFORE the code
-- is deployed: Prisma reads every Conversation column by default (the SMS and
-- voice webhooks included), so the code fails against a database without it.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "deletedAt" TIMESTAMP(3);
