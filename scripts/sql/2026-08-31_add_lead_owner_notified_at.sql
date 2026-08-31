-- Owner-alert claim stamp for gate leads.
--
-- The wizard used to gate the owner email on "is this row new", so a returning
-- prospect was re-texted but produced no alert. The alert is now claimed
-- against this column with a re-notify window, so re-engagement notifies and
-- refreshes do not.
--
-- Additive and nullable: existing rows read as never-notified, which is correct.
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "ownerNotifiedAt" TIMESTAMP(3);
