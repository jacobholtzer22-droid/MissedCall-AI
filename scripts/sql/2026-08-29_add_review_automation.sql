-- Review request automation — QuickBooks/Intuit OAuth storage + the ReviewRequest queue.
-- See lib/quickbooks.ts and CLAUDE.md.
--
-- Applied with `npm run db:push` (this project has no prisma/migrations/ and
-- `prisma migrate` must not be run). This file mirrors that change for the record,
-- matching the convention of the other files in scripts/sql/.
--
-- Additive only. Every new Business column is nullable or defaulted, so existing
-- rows are untouched and every existing query keeps working. The feature is off
-- for every business (reviewRequestsEnabled defaults false, quickbooksConnected
-- defaults false) until switched on per-tenant in /admin. ReviewRequest is a new
-- table — nothing reads it yet.

-- ── Business: QuickBooks / Intuit OAuth ──────────────────────────────────────
-- qbRealmId is the Intuit company id. It arrives ONLY as a query parameter on the
-- OAuth callback and cannot be recovered from the token response later, which is
-- why the callback route persists it in the same write as the tokens.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "quickbooksConnected"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbRealmId"               TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbAccessToken"           TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbRefreshToken"          TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbAccessTokenExpiresAt"  TIMESTAMP(3);
-- QBO expires an idle refresh token after 100 days. Tracked so the refresh path can
-- fail fast instead of making a network call it knows will be rejected.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbRefreshTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "qbLastRefreshError"      TEXT;

-- ── Business: review request settings ────────────────────────────────────────
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewRequestsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewTrigger"         TEXT    NOT NULL DEFAULT 'payment_received';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewDelayMinutes"    INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewQuietStartHour"  INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewQuietEndHour"    INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewCapDays"         INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "googleReviewLink"      TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "reviewMessageTemplate" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "billingWebhookSecret"  TEXT;

-- NOT unique on purpose: one QBO company can legitimately map to several Business
-- rows (an owner running multiple businesses out of one QuickBooks file).
CREATE INDEX IF NOT EXISTS "Business_qbRealmId_idx" ON "Business"("qbRealmId");

-- ── ReviewRequest ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReviewRequest" (
  "id"                 TEXT         NOT NULL,
  "businessId"         TEXT         NOT NULL,
  "contactId"          TEXT,
  "customerPhone"      TEXT         NOT NULL,
  "customerName"       TEXT,
  "source"             TEXT         NOT NULL,
  "externalInvoiceId"  TEXT         NOT NULL,
  "externalCustomerId" TEXT,
  "status"             TEXT         NOT NULL DEFAULT 'queued',
  "skipReason"         TEXT,
  "scheduledFor"       TIMESTAMP(3),
  "sentAt"             TIMESTAMP(3),
  "telnyxSid"          TEXT,
  "telnyxStatus"       TEXT,
  "messageBody"        TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- Cascade from Business: deleting a tenant removes their queue, same as every
-- other child table in this schema.
ALTER TABLE "ReviewRequest"
  DROP CONSTRAINT IF EXISTS "ReviewRequest_businessId_fkey";
ALTER TABLE "ReviewRequest"
  ADD CONSTRAINT "ReviewRequest_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL from Contact, NOT cascade: deleting a contact must not erase the send
-- history. That row is the audit trail when a customer asks why they were texted.
ALTER TABLE "ReviewRequest"
  DROP CONSTRAINT IF EXISTS "ReviewRequest_contactId_fkey";
ALTER TABLE "ReviewRequest"
  ADD CONSTRAINT "ReviewRequest_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-invoice dedupe: the same billing event can never queue twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewRequest_businessId_source_externalInvoiceId_key"
  ON "ReviewRequest"("businessId", "source", "externalInvoiceId");

-- businessId-leading, so it also serves businessId-only lookups.
CREATE INDEX IF NOT EXISTS "ReviewRequest_businessId_createdAt_idx"
  ON "ReviewRequest"("businessId", "createdAt");

-- Deliberately NOT tenant-prefixed: this is the cron's cross-tenant drain query
-- (status='queued' AND scheduledFor <= now).
CREATE INDEX IF NOT EXISTS "ReviewRequest_status_scheduledFor_idx"
  ON "ReviewRequest"("status", "scheduledFor");

-- Powers the per-customer frequency cap (Business.reviewCapDays).
CREATE INDEX IF NOT EXISTS "ReviewRequest_businessId_customerPhone_sentAt_idx"
  ON "ReviewRequest"("businessId", "customerPhone", "sentAt");

CREATE INDEX IF NOT EXISTS "ReviewRequest_contactId_idx"
  ON "ReviewRequest"("contactId");
