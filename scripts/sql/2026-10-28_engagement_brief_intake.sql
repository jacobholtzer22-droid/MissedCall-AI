-- Ops onboarding (Oct 2026): the site brief lives on the client. Engagement
-- gains brief (markdown in the shape of AA-Template's BRIEF.template.md) and
-- intake (the structured answers behind it, from the chief or the intake link).
--
-- Generated with `prisma migrate diff` (main's schema at f8aec58 -> with this
-- change). Apply it BY HAND with
-- `npx prisma db execute --file scripts/sql/2026-10-28_engagement_brief_intake.sql --schema prisma/schema.prisma`.
-- NOT `npm run db:push`.
--
-- Two nullable columns added; no data changes, nothing dropped. Run it once:
-- a second run stops at "column already exists" and changes nothing.

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "brief" TEXT,
ADD COLUMN     "intake" JSONB;
