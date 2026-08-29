# CLAUDE-NEXT.md — MissedCall AI: Regenerated Master Reference (from live code)

Generated 2026-07-09 by reading the live working tree on branch `feature/owner-group-aggregation`.
The working tree includes **uncommitted changes** that are part of live code for this document — the
owner-group feature is being actively developed in this working tree while this doc was generated:
modified `prisma/schema.prisma` (adds `Business.ownerGroupId`), `app/api/dashboard/website-leads/route.ts`,
`app/api/dashboard/google-ads/route.ts`, `app/api/dashboard/google-ads/sync/route.ts`,
`app/(dashboard)/dashboard/ads/AdsClient.tsx`, `app/(dashboard)/dashboard/leads/CombinedLeadsList.tsx`,
`app/(dashboard)/dashboard/website-leads/WebsiteLeadsClient.tsx`, plus new untracked `lib/owner-group.ts`.

Every claim below was derived from source files, not from the older `CLAUDE.md` (which Section 14 diffs against).

Inventory baseline (Phase 0): **56** `route.ts` files, **38** `page.tsx` files, **23** `lib/` modules, **20** Prisma models.

---

## Section 1 — Stack & Dependencies

**Framework/runtime:** Next.js `14.2.21` (App Router), React `18.3.1`, TypeScript `^5.7.2` with `"strict": true` (tsconfig.json). Path alias `@/*` → repo root (tsconfig.json `paths`). `next.config.js` sets global `X-Frame-Options: ALLOWALL` + `Content-Security-Policy: frame-ancestors *` on every route, `experimental.serverActions.bodySizeLimit: '2mb'`, and allows remote images from `img.clerk.com` only.

**npm scripts** (package.json):

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local dev server |
| `build` | `prisma generate && next build` | Generates Prisma client before building |
| `start` | `next start` | Production server |
| `lint` | `next lint` | ESLint via Next — **note: no `.eslintrc*` file exists in the repo root**, so this prompts for setup on first run |
| `db:push` | `prisma db push` | The schema sync mechanism — there is **no `prisma/migrations/` directory**; do not run `prisma migrate` |
| `db:studio` | `prisma studio` | DB browser |
| `db:generate` | `prisma generate` | Regenerate client |
| `db:cleanup-test-appointments` | `npx tsx scripts/cleanup-test-appointments.ts` | Deletes test appointments (requires `tsx`, which is **not** in devDependencies — fetched by npx) |

**Dependencies** (all verified against actual import sites):

| Package | Version | Used for | Example usage site |
|---|---|---|---|
| `@anthropic-ai/sdk` | ^0.52.0 | Claude API for SMS AI | `app/api/webhooks/sms/route.ts` |
| `@clerk/nextjs` | ^6.12.0 | Auth (middleware, `auth()`, ClerkProvider, sign-in/up UI) | `middleware.ts`, `app/layout.tsx` |
| `@date-fns/tz` | ^1.4.1 | `TZDate` business-timezone math | `app/api/bookings/available-slots/route.ts`, `lib/google-calendar.ts` |
| `@prisma/client` | ^6.2.1 | ORM client (Neon Postgres) | `lib/db.ts` |
| `@radix-ui/react-avatar` | ^1.1.2 | **UNUSED — zero imports** | — |
| `@radix-ui/react-dialog` | ^1.1.4 | **UNUSED — zero imports** | — |
| `@radix-ui/react-dropdown-menu` | ^2.1.4 | **UNUSED — zero imports** | — |
| `@radix-ui/react-label` | ^2.1.1 | **UNUSED — zero imports** | — |
| `@radix-ui/react-select` | ^2.1.4 | **UNUSED — zero imports** | — |
| `@radix-ui/react-separator` | ^1.1.1 | **UNUSED — zero imports** | — |
| `@radix-ui/react-slot` | ^1.1.1 | **UNUSED — zero imports** | — |
| `@radix-ui/react-tabs` | ^1.1.2 | **UNUSED — zero imports** | — |
| `@radix-ui/react-toast` | ^1.2.4 | **UNUSED — zero imports** | — |
| `@vercel/blob` | ^2.3.1 | Voicemail mp3 + campaign image uploads | `app/api/webhooks/voice/route.ts`, `app/api/campaigns/upload-image/route.ts` |
| `class-variance-authority` | ^0.7.1 | **UNUSED — zero imports** | — |
| `clsx` | ^2.1.1 | `cn()` class merge | `lib/utils.ts` |
| `date-fns` | ^4.1.0 | Date formatting/parsing | `app/components/BookingCalendar.tsx`, booking pages |
| `google-ads-api` | ^23.0.0 | Google Ads GAQL sync | `lib/google-ads.ts` |
| `googleapis` | ^171.4.0 | Google Calendar OAuth/events + Sheets sync | `lib/google-calendar.ts`, `lib/google-sheets-sync.ts` |
| `lucide-react` | ^0.469.0 | Icons throughout UI | `app/page.tsx` and most components |
| `next` | 14.2.21 | Framework | everywhere |
| `nodemailer` | ^8.0.1 | Imported only in `lib/notify-owner.ts` for `getTransporter()`, which is **dead code — never called** (all email is Resend). Package is effectively unused at runtime | `lib/notify-owner.ts` (dead path) |
| `papaparse` | ^5.5.3 | CSV parsing on the contacts-import client | `app/(dashboard)/dashboard/contacts/import/ImportContactsClient.tsx` |
| `react` / `react-dom` | ^18.3.1 | UI runtime | everywhere |
| `recharts` | ^3.8.1 | Google Ads daily trend chart | `app/(dashboard)/dashboard/ads/AdsClient.tsx` |
| `resend` | ^6.9.3 | ALL transactional + campaign email | `lib/notify-owner.ts`, `app/api/dashboard/emails/route.ts`, `app/api/webhooks/voice/route.ts` |
| `server-only` | ^0.0.1 | Guard against client-bundling of Google libs | `lib/google-calendar.ts`, `lib/google-sheets-sync.ts` |
| `tailwind-merge` | ^2.6.0 | `cn()` | `lib/utils.ts` |
| `tailwindcss-animate` | ^1.0.7 | Tailwind plugin (config-driven) | `tailwind.config.js` `plugins: [require("tailwindcss-animate")]` |
| `telnyx` | ^5.37.1 | Voice Call Control + SMS | webhooks, `app/api/dashboard/messages/send/route.ts`, `lib/notify-owner.ts` |
| `xlsx` | ^0.18.5 | Excel parse/export | `lib/import-contacts.ts`, `app/api/admin/usage/export/route.ts`, `ImportContactsClient.tsx` |

**devDependencies:** `@types/node`, `@types/nodemailer`, `@types/papaparse`, `@types/react`, `@types/react-dom` (type packages); `autoprefixer` + `postcss` + `tailwindcss` (config-driven via `postcss.config.js` / `tailwind.config.js`); `eslint` + `eslint-config-next` (**no eslint config file present — effectively unused**); `prisma` (CLI for db:push/generate); `sharp` (no direct import; used implicitly by Next image optimization and by `scripts/optimize-logo.mjs` / `scripts/generate-favicons.mjs`); `typescript`.

**Flagged as installed-but-unused:** all 9 `@radix-ui/*` packages, `class-variance-authority`, and (at runtime) `nodemailer` + `@types/nodemailer`. ESLint is configless.

---
## Section 2 — Directory Structure

One line per file, derived from opening each file. **[DEAD]** = zero importers found anywhere in `app/`, `lib/`, `middleware.ts` and not auto-routed by a Next.js file convention.

### app/ (excluding app/api/)

```
app/
├── layout.tsx                    Root layout: ClerkProvider, ConditionalNavBar, MetaPixel, sitewide metadata + ProfessionalService JSON-LD
├── page.tsx                      Marketing homepage (server component; renders SmsThread demo, ContactForm, BrandFooter)
├── not-found.tsx                 Branded 404 page
├── globals.css                   Tailwind layers + shadcn-style CSS variables + brand keyframes
├── sitemap.ts                    Static public marketing routes only (BASE_URL = https://www.alignandacquire.com)
├── robots.ts                     Allow /, disallow /dashboard /admin /api /onboarding /sign-in /sign-up; /demo-requested deliberately NOT disallowed (meta-noindexed instead)
├── opengraph-image.tsx           Generated 1200×630 sitewide og:image (text-only Satori)
├── demo-requested/page.tsx       Post-demo-form thank-you page (noindex)
├── privacy/page.tsx              Privacy policy (server, BrandFooter)
├── terms/page.tsx                Terms & conditions (server, BrandFooter)
├── services/page.tsx             All-services overview page
├── websites/page.tsx             Website design portfolio/service page (WebsiteQuoteForm, Service JSON-LD)
├── ads-management/page.tsx       Google Ads management service page (Service JSON-LD, shared DESCRIPTION const)
├── spam-screening/page.tsx       Spam screening feature page (Service JSON-LD, shared DESCRIPTION const)
├── about/{layout,page}.tsx       About page ('use client'; metadata-only layout)
├── pricing/{layout,page}.tsx     Pricing page ('use client'; metadata-only layout)
├── campaigns/{layout,page}.tsx   Email/SMS campaigns feature page ('use client'; metadata-only layout)
├── missedcall-ai/{layout,page}.tsx  MissedCall AI landing ('use client'; layout holds metadata + Service + FAQPage JSON-LD)
├── config/
│   └── nav-services.ts           [DEAD] Shared nav services config — zero importers (its header mentions a ServicesDropdown component that no longer exists)
├── (auth)/
│   ├── sign-in/[[...sign-in]]/page.tsx   Clerk <SignIn/> (noindex)
│   └── sign-up/[[...sign-up]]/page.tsx   Clerk <SignUp/> (noindex)
├── onboarding/
│   ├── page.tsx                  Post-signup business setup (server actions; uses lib/industry-defaults)
│   └── OnboardingForm.tsx        Client form (industry defaults pre-fill via getIndustryDefaults)
├── book/
│   ├── layout.tsx                Metadata for /book wizard
│   ├── page.tsx                  Marketing qualification + discovery-call wizard ('use client')
│   └── [businessSlug]/
│       ├── layout.tsx            generateMetadata per tenant (DB lookup by slug)
│       ├── page.tsx              Tenant booking page ('use client'; BookingPageHeader + slot picker)
│       └── embed/
│           ├── layout.tsx        noindex + light-mode wrapper + inline error-surface script
│           ├── page.tsx          Iframe-embeddable booking page ('use client')
│           └── error.tsx         Embed error boundary (renders errors visibly for mobile debugging)
├── (dashboard)/
│   ├── layout.tsx                Dashboard shell (noindex): auth, getBusinessForDashboard, getBusinessFeatures → nav items → DashboardShellClient
│   ├── error.tsx                 Dashboard error boundary
│   ├── DashboardShellClient.tsx  Client shell: sidebar (mobile hamburger), UserButton, nav rendering
│   └── dashboard/
│       ├── page.tsx              Overview (server): features + server-fetched initial data → OverviewClient
│       ├── OverviewClient.tsx    Feature-aware overview (uses app/components/ui kit — its only consumer)
│       ├── SpamOnlyDashboard.tsx [DEAD] Screening-only overview variant — zero importers
│       ├── ads/{page,AdsClient}.tsx           Google Ads dashboard (FeatureGate locked on googleAdsEnabled; recharts chart)
│       ├── analytics/{page,AnalyticsClient}.tsx  Analytics (page is a bare wrapper; client fetches /api/dashboard/analytics)
│       ├── appointments/{page,AppointmentsClient,CancelBookingButton}.tsx  Scheduled quotes (dual FeatureGate); cancel button POSTs /api/bookings/[id]/cancel
│       ├── blocked-calls/{page,BlockedCallsClient}.tsx  Screened-call list (gated by features)
│       ├── contacts/{page,ContactsClient}.tsx           CRM list (search/status/tags, import + create)
│       ├── contacts/[id]/{page,ContactDetailClient}.tsx Contact detail: info, activities, jobs
│       ├── contacts/import/{page,ImportContactsClient}.tsx  Client-side Excel/CSV parse (papaparse + xlsx) → bulk import
│       ├── conversations/{page,ConversationsClient}.tsx AI SMS viewer: bucket tabs, mobile list/thread toggle
│       ├── emails/page.tsx        redirect('/dashboard/outreach') (legacy URL)
│       ├── emails/EmailsClient.tsx  Sent-campaign list (embeddable, hideHeader prop; "Reuse as Template")
│       ├── emails/new/{page,EmailComposeClient}.tsx  Campaign compose (images, preview, templateId pre-fill)
│       ├── jobs/{page,JobsClient}.tsx  Jobs list/create per contact
│       ├── leads/{page,LeadsClient,CombinedLeadsList}.tsx  Unified leads: merges /api/dashboard/conversations + /api/dashboard/website-leads client-side
│       ├── messages/page.tsx      redirect('/dashboard/outreach') (legacy URL)
│       ├── messages/MessagesClient.tsx  SMS threads client (embeddable, hideHeader; manual send, manualMode toggle)
│       ├── outreach/{page,OutreachClient}.tsx  Email/SMS channel switcher embedding EmailsClient + MessagesClient (FeatureGate locked on massMessagingEnabled)
│       ├── settings/{page,SettingsFormWithIndustry}.tsx  Business settings (server actions) + industry-defaults helper
│       ├── voicemails/{page,VoicemailsClient}.tsx  Voicemail list with audio player + delete
│       ├── website-leads/page.tsx  redirect('/dashboard/leads?tab=website') (legacy URL)
│       └── website-leads/WebsiteLeadsClient.tsx  [DEAD] zero importers — note: still modified on this branch (owner-group businessName column) but nothing renders it
├── admin/
│   ├── layout.tsx                noindex wrapper
│   ├── page.tsx                  Server shell: ADMIN_USER_ID check, fetch businesses → AdminClient
│   ├── AdminClient.tsx           Admin UI root: HeaderKPIs + AdminTools + ClientTable + ClientDetailPanel
│   ├── ClientTable.tsx           Mobile card list + desktop table of clients w/ stats
│   ├── ClientDetailPanel.tsx     Slide-out panel: Toggles / Settings / Tools tabs
│   ├── ClientDetailPanel/TogglesTab.tsx   Feature-flag toggles per business
│   ├── ClientDetailPanel/SettingsTab.tsx  Editable business settings (uses DEFAULT_BUSINESS_HOURS, BUSINESS_TYPE_OPTIONS)
│   ├── ClientDetailPanel/ToolsTab.tsx     Per-business tools (bulk import, blocked numbers, voicemails…)
│   ├── HeaderKPIs.tsx            KPI strip (MRR from active/trialing businesses, totals)
│   ├── AdminTools.tsx            Admin-level tools (usage sync, export, sheets sync)
│   ├── types.ts                  AdminBusiness interface (flags + _count + computed stats)
│   ├── components/CallScreenerCard.tsx  [DEAD] "drop this into your admin dashboard" scaffold — zero importers
│   └── [businessId]/conversations/page.tsx  'use client' admin conversation viewer for any business (buckets)
└── components/
    ├── NavBar.tsx                Fixed top marketing nav (Logo + NavMenu)
    ├── ConditionalNavBar.tsx     Hides NavBar on /dashboard, /admin, /embed paths
    ├── BrandFooter.tsx           Marketing footer w/ NAP line (client component)
    ├── JsonLd.tsx                Safe <script type="application/ld+json"> renderer (escapes '<')
    ├── FeatureGate.tsx           Server component; discriminated union: mode 'locked' (mailto CTA) | 'needs-setup' (setupHref CTA)
    ├── Logo.tsx                  aa-logo.png lockup (native <img>)
    ├── DemoForm.tsx              Demo request form → POST /api/book-demo
    ├── ContactForm.tsx           Homepage contact form → POST /api/contact
    ├── BookingCalendar.tsx       Month-grid calendar for slot picking (date-fns)
    ├── BookingPageHeader.tsx     Header for tenant booking + embed pages
    ├── EmbedCodeSection.tsx      [DEAD] iframe embed-code copy box — zero importers
    ├── Marquee.tsx               Scrolling text strip
    ├── ScrollReveal.tsx          IntersectionObserver reveal animation
    ├── CountUp.tsx               Animated number counter
    ├── roi-calculator.tsx        ROI calculator (client; used on / and /missedcall-ai)
    ├── WebsiteQuoteForm.tsx      Quote form on /websites
    ├── NavMenu.tsx               Mobile/desktop nav links (own NAV_LINKS const — does NOT read app/config/nav-services.ts)
    ├── ScrollToBookDemoLink.tsx  [DEAD] scroll-to-form button — zero importers
    ├── SmsThread.tsx             Animated fake SMS conversation demo (used on /, /missedcall-ai, /services)
    ├── MetaPixel.tsx             Facebook Pixel loader (reads NEXT_PUBLIC_FACEBOOK_PIXEL_ID; mounted in root layout)
    └── ui/                       Dashboard UI kit (Badge, Button, Card, MetricCard, PageHeader, PeriodSelector, states, index) — currently consumed ONLY by OverviewClient
```

### app/api/ (56 route.ts files)

```
app/api/
├── webhooks/
│   ├── voice/route.ts            [POST] Main Telnyx Call Control webhook (see §5)
│   ├── voice-gather/route.ts     [POST] Standalone gather-outcome handler (legacy split-out; not referenced by any code — external-config dependent)
│   ├── voice-after-dial/route.ts [POST] XML <Response> after dial (TwiML-style; no DB writes)
│   ├── voice-dial-status/route.ts[POST] Dial-outcome callback → missed-call SMS trigger
│   └── sms/route.ts              [POST] Telnyx SMS webhook: inbound AI pipeline + delivery status (see §6)
├── bookings/
│   ├── available-slots/route.ts  [GET] Public: available calendar slots by businessId/slug
│   ├── create/route.ts           [POST] Public: create appointment (web booking form)
│   ├── [id]/route.ts             [DELETE] Permanently delete an appointment (dashboard-authed)
│   ├── [id]/cancel/route.ts      [POST] Cancel appointment + delete calendar event (dashboard-authed)
│   └── delete-past/route.ts      [POST] Bulk-delete past/completed/cancelled appointments (dashboard-authed)
├── appointments/route.ts         [GET] List appointments for current business (dashboard-authed)
├── contact/route.ts              [POST] Public (middleware-exempt) website contact form; CORS open; tenant-routing (see §7)
├── marketing-bookings/route.ts   [GET,POST] /book wizard slots + discovery-call booking
├── book-demo/route.ts            [POST] Demo request form
├── campaigns/upload-image/route.ts [POST] Campaign image → Vercel Blob (dashboard-authed)
├── auth/google/route.ts          [GET] Start Google Calendar OAuth (Clerk-authed, ownership check)
├── auth/google/callback/route.ts [GET] Exchange code, save tokens, redirect to settings
├── dashboard/  (all via requireDashboardBusiness())
│   ├── analytics/route.ts        [GET] Feature-aware analytics (period param)
│   ├── contacts/route.ts         [GET,POST] List/create contacts
│   ├── contacts/[id]/route.ts    [GET,PATCH,DELETE] Contact detail/update/delete
│   ├── contacts/[id]/activities/route.ts [GET,POST] Timeline + add note
│   ├── contacts/import/route.ts  [POST] Bulk import (JSON rows from client-side parse)
│   ├── conversations/route.ts    [GET] AI conversation list w/ messages (403 if !missedCallAiEnabled)
│   ├── emails/route.ts           [GET,POST] Campaign list / create+send (403 if !massMessagingEnabled)
│   ├── emails/[id]/route.ts      [GET] Single campaign (reuse-as-template)
│   ├── google-ads/route.ts       [GET] Ads dashboard data (403 if !googleAdsEnabled) — owner-group aggregated via getOwnerGroupBusinesses()
│   ├── google-ads/sync/route.ts  [POST] Ads sync trigger — syncs every configured owner-group member (skips members without a customer ID)
│   ├── jobs/route.ts             [GET,POST] Jobs list/create
│   ├── jobs/[id]/route.ts        [PATCH] Job update (no DELETE)
│   ├── messages/route.ts         [GET] Conversation list (search/filter)
│   ├── messages/[conversationId]/route.ts [GET] Thread detail
│   ├── messages/send/route.ts    [POST] Manual outbound SMS
│   ├── messages/contacts/route.ts[GET] Contacts for compose UI
│   ├── messages/campaign/route.ts[POST] SMS campaign send (403 if !massMessagingEnabled)
│   ├── messages/campaign/preview/route.ts [POST] SMS campaign recipient preview
│   ├── screened-calls/route.ts   [GET] ScreenedCall list
│   ├── tags/route.ts             [GET,POST] Tag list/create
│   ├── voicemails/route.ts       [GET] Voicemail list
│   ├── voicemails/[id]/route.ts  [DELETE] Soft-delete voicemail (clears recordingUrl/transcription)
│   └── website-leads/route.ts    [GET,PATCH] Website leads — owner-group aggregated via getOwnerGroupBusinesses() + lead status update
└── admin/  (all check userId === process.env.ADMIN_USER_ID)
    ├── businesses/route.ts       [GET] All businesses enriched with stats
    ├── businesses/[id]/route.ts  [PATCH] Update business (allowedFields whitelist — §12)
    ├── businesses/[id]/blocked-numbers/route.ts [GET,POST,DELETE] Manage blocked numbers
    ├── businesses/[id]/contacts/route.ts [GET,POST,DELETE] Contacts for a business
    ├── businesses/[id]/contacts/bulk/route.ts [POST] Bulk contact import
    ├── businesses/[id]/conversations/route.ts [GET] Conversations for a business
    ├── businesses/[id]/screened-calls/route.ts [GET] Screened-call stats
    ├── businesses/[id]/usage/route.ts [GET] Per-business SMS/call usage + skip stats
    ├── businesses/[id]/voicemails/route.ts [GET] Voicemails for a business
    ├── google-ads/sync/route.ts  [POST] Sync one/all businesses' ads data
    ├── google-calendar-backfill/route.ts [POST] Backfill DB appointments into Google Calendar (new route)
    ├── telnyx-test/route.ts      [GET] Debug Telnyx detail-records fetch
    ├── usage/sync/route.ts       [POST,GET] Telnyx MDR/CDR sync (GET added for Vercel cron — vercel.json hits it daily at 06:00 UTC)
    ├── usage/export/route.ts     [GET] Excel usage export
    ├── usage/sheets-sync/route.ts[POST] Push usage to Google Sheets
    └── view-as/route.ts          [GET] Set/clear adminViewAs cookie (GET, not POST)
```

### lib/ and prisma/

| File | Purpose | Main consumers (importers) |
|---|---|---|
| `lib/auth.ts` | Clerk helpers `getCurrentBusiness()` / `getCurrentUser()` via `auth()` + DB lookup. | **[DEAD] zero importers** — dashboard pages use `lib/get-business-for-dashboard.ts`, API routes use `lib/dashboard-auth.ts` |
| `lib/business-features.ts` | Single source of truth deriving `BusinessFeatures` flags (`hasSpamFilter`, `hasMissedCallAi`, `hasCalendar`, `totalCallsMode`, …) from a Business row. | `app/(dashboard)/layout.tsx`, `dashboard/page.tsx`, `blocked-calls/page.tsx`, `voicemails/page.tsx`, `app/api/dashboard/analytics/route.ts` |
| `lib/business-hours.ts` | Client-safe `DEFAULT_BUSINESS_HOURS` constant (Mon–Fri 09:00–17:00). | `lib/google-calendar.ts`, `app/admin/ClientDetailPanel/SettingsTab.tsx` |
| `lib/contacts-check.ts` | SMS contact gates: `isExistingContact()` (source IS NULL), `isClientVoicemailContact()` (isClientContact=true), `logContactSkip()`. | `app/api/webhooks/voice/route.ts`, `voice-gather/route.ts`, `voice-dial-status/route.ts` |
| `lib/conversation-buckets.ts` | `getConversationBucket()` cold/active/stalled/closed + `BUCKET_LABELS`/`BUCKET_COLORS`. | `ConversationsClient.tsx`, `CombinedLeadsList.tsx`, `app/admin/[businessId]/conversations/page.tsx` |
| `lib/create-booking.ts` | Shared `createBooking()` pipeline (validate → dedupe → verify slot → calendar event → DB → SMS → notify) + `cleanServiceForOwner()`. | `app/api/bookings/create/route.ts`, `app/api/webhooks/sms/route.ts` |
| `lib/crm-utils.ts` | `findExistingContact()`, `findOrCreateContact()` (incl. `__email_only__` placeholder-phone handling, Activity logging). | `app/api/contact`, `dashboard/contacts/import`, `dashboard/messages/{campaign,send}`, `webhooks/{sms,voice}` |
| `lib/dashboard-auth.ts` | `requireDashboardBusiness()` — Clerk auth + business resolution (incl. admin view-as) for API routes; `{ business }` or 401/404. | 22 routes under `app/api/dashboard/**` + `app/api/campaigns/upload-image/route.ts` |
| `lib/db.ts` | Prisma singleton on `globalThis` (non-production HMR survival). | ~65 app routes/pages + 13 lib files — the most-imported module |
| `lib/email-format.ts` | `bodyContainsHtml()`, `plainTextToEmailHtml()` (escape + pre-wrap wrapper) shared by preview and send. | `EmailComposeClient.tsx`, `app/api/dashboard/emails/route.ts`, `lib/notify-owner.ts` |
| `lib/get-business-for-dashboard.ts` | Effective business for dashboard, honoring `adminViewAs` cookie for `ADMIN_USER_ID`; returns `{ business, isAdminViewAs }`. | 15 dashboard pages/layout, 6 API routes (`appointments`, `bookings/[id]`, `bookings/[id]/cancel`, `bookings/delete-past`, `dashboard/screened-calls`, `dashboard/voicemails`), `lib/dashboard-auth.ts` |
| `lib/google-ads.ts` | `getGoogleAdsClient()`, `syncGoogleAdsData()` (GAQL → GoogleAdsSnapshot upserts), `syncAllBusinessAds()`. | `app/api/admin/google-ads/sync`, `app/api/dashboard/google-ads/sync` |
| `lib/google-calendar.ts` | Full Calendar layer (`import 'server-only'`): OAuth, token refresh, slot computation, event CRUD, busy times. | 9 API routes (auth/google + callback, bookings/*, appointments, marketing-bookings, webhooks/sms, admin/google-calendar-backfill) + `lib/create-booking.ts` |
| `lib/google-sheets-sync.ts` | `syncUsageToGoogleSheets()` — pushes Telnyx usage to a Google Sheet via service-account auth. | `app/api/admin/usage/sheets-sync/route.ts` (only importer) |
| `lib/import-contacts.ts` | `parseContactFile()` — Excel/CSV parse via `xlsx`, auto-detect phone/name columns. | `app/admin/ClientDetailPanel/ToolsTab.tsx` via dynamic import — its ONLY importer (`app/api/dashboard/contacts/import` does NOT use it) |
| `lib/industry-defaults.ts` | Per-industry presets (`BUSINESS_TYPE_OPTIONS`, `getIndustryDefaults()`): default services, AI greeting, booking copy. | onboarding page + form, `SettingsFormWithIndustry.tsx`, admin `SettingsTab.tsx` |
| `lib/notify-owner.ts` | Owner notifications (SMS via Telnyx + email via Resend): booking created / no-calendar booking request / lead captured / human needed / AI failed; dead nodemailer `getTransporter()`. | `app/api/contact/route.ts`, `app/api/webhooks/sms/route.ts`, `lib/create-booking.ts` |
| `lib/owner-group.ts` | **New, untracked** — `getOwnerGroupBusinesses(business)`: all Business rows sharing a non-null `ownerGroupId` (else `[business]`). | 3 importers: `app/api/dashboard/website-leads/route.ts:8`, `app/api/dashboard/google-ads/route.ts:11`, `app/api/dashboard/google-ads/sync/route.ts:10` |
| `lib/phone-utils.ts` | `normalizePhoneNumber()`, `normalizeToE164()`, `phonesMatch()`. | 10 app routes/pages + 6 lib files (`contacts-check`, `crm-utils`, `import-contacts`, `notify-owner`, `sms-cooldown`, `telnyx-usage-sync`) |
| `lib/sms-cooldown.ts` | `getCooldownDays()` (business → env → 7), `checkCooldown()`, `recordMessageSent()`, `isCooldownBypassNumber()`, `logCooldownSkip()`. | all 4 telephony webhooks + `lib/create-booking.ts` |
| `lib/telnyx-usage-sync.ts` | `syncTelnyxUsage()` — Telnyx MDR/CDR fetch → `TelnyxUsageRecord` upserts + `Message.cost` backfill. | `app/api/admin/usage/sync/route.ts` (only importer) |
| `lib/usage-export.ts` | `parseExportDateRange()`, `getUsageForExport()` — daily rows/subtotals/grand total for Excel export. | `app/api/admin/usage/export/route.ts` (only importer) |
| `lib/utils.ts` | `cn()`, `formatPhoneNumber()`, `formatRelativeTime()` + misc formatting. | ~19 files: most dashboard clients, `app/components/ui/*`, sms + voice webhooks |
| `prisma/schema.prisma` | Full DB schema, 20 models; synced via `prisma db push` (no migrations dir). Uncommitted: `Business.ownerGroupId` + `@@index([ownerGroupId])` | — |

### Root files & other top-level directories

| Path | Purpose |
|---|---|
| `middleware.ts` | clerkMiddleware: protects `/dashboard`, `/onboarding`, `/settings`; public: `/book/(.*)`; public APIs: `/api/webhooks/(.*)` **and `/api/contact`** |
| `next.config.js` | Global `X-Frame-Options: ALLOWALL` + `frame-ancestors *`; serverActions 2MB; images allow `img.clerk.com` |
| `package.json` / `tsconfig.json` | See §1 |
| `tailwind.config.js` / `postcss.config.js` | Tailwind (darkMode class, brand palette, tailwindcss-animate plugin) / PostCSS |
| `vercel.json` | **Cron: `0 6 * * *` → `/api/admin/usage/sync`** (daily Telnyx usage sync) |
| `prisma/` | schema.prisma only (no migrations/) |
| `docs/` | `CODEBASE-AUDIT.md`, `TESTING-VOICE.md`, `system-layout.md` (+ this file) |
| `scripts/` | `backfill-isClientContact.ts`, `cleanup-test-appointments.ts`, `export-conversations.ts`, `generate-favicons.mjs`, `optimize-logo.mjs` (sharp), `sql/` (2 additive-column SQL files from 2026-06-02) |
| `public/` | `aa-logo.png`, `embed-test.html`, `embed.js`, `images/` |
| `CLAUDE.md` | STALE previous reference doc (diffed in §14) |
| `conversations-export-2026-05-16.jsonl` | One-off data export sitting in repo root |

---
## Section 3 — Environment Variables

Derived entirely from `process.env` usage sites (plus `env()` in `prisma/schema.prisma` and SDK-internal reads). 32 distinct vars are read via `process.env` in app code.

| Var | Read in | Required? | Missing → | Fallback / notes |
|---|---|---|---|---|
| **Database** |
| `DATABASE_URL` | `prisma/schema.prisma` `env("DATABASE_URL")` | Yes | Loud — Prisma client fails to connect | Neon pooled URL |
| `DIRECT_URL` | `prisma/schema.prisma` `directUrl` | Yes (for `db:push`) | Loud at `prisma db push` | Neon direct URL |
| **Auth (Clerk)** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | read internally by `@clerk/nextjs` (no direct `process.env` read in repo code) | Yes | Loud — Clerk throws at startup | — |
| `CLERK_SECRET_KEY` | read internally by `@clerk/nextjs` | Yes | Loud | — |
| **AI** |
| `ANTHROPIC_API_KEY` | `app/api/webhooks/sms/route.ts:22` (`new Anthropic({ apiKey: … ?? '' })`), also :2287, :2440 guards | Yes (AI) | Silent-ish — client is constructed with `''`; API calls fail at request time and the route's AI-failure fallback message + `notifyOwnerOnAIFailed` path fires | `?? ''` at init |
| **Telephony (Telnyx)** |
| `TELNYX_API_KEY` | 21 read sites: all 4 telephony webhooks, `lib/notify-owner.ts` (6×), `lib/create-booking.ts:266`, `lib/telnyx-usage-sync.ts:72,193`, `dashboard/messages/{send,campaign}`, `bookings/[id]/cancel:64`, `marketing-bookings:470-472`, `admin/usage/sync:28` | Yes | Mostly silent (SDK constructed per call site with `!`; calls fail at runtime). Exception: `admin/usage/sync` returns an explicit 500 `TELNYX_API_KEY is not configured` | — |
| `TELNYX_CONNECTION_ID` | `app/api/webhooks/voice/route.ts:357,478` | Yes for forwarding dial-out | Silent — falls back to `state.connectionId` from the call payload; if both missing, logs `❌ No connection_id available` and routes to voicemail/SMS fallback instead of dialing | `state.connectionId \|\| env` |
| `TELNYX_PUBLIC_KEY` | **read nowhere** | — | — | Documented in old doc; no signature verification exists (§14f) |
| `TELNYX_PHONE_NUMBER` | **read nowhere** | — | — | Old doc claimed it was a fallback send number; that code no longer exists |
| **Google Calendar** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `lib/google-calendar.ts:19-20` (`getOAuth2Client()`) | Yes (calendar) | Silent until OAuth/token calls fail | — |
| `GOOGLE_REDIRECT_URI` | `lib/google-calendar.ts:15` (`REDIRECT_URI = …!`) | Yes (calendar) | Silent (`!` assertion) — OAuth flow breaks with undefined redirect | Must exactly match Google Console |
| **Google Sheets (usage sync)** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `lib/google-sheets-sync.ts:22-23` (+ presence pre-check in `admin/usage/sheets-sync:36-37`) | Yes (sheets sync) | **Loud — `getSheetsClient()` throws** with explicit message | Private key newline handling in lib |
| `GOOGLE_SHEET_ID` | `lib/google-sheets-sync.ts:24`, `admin/usage/sheets-sync:38` | Yes (sheets sync) | Loud — throws `GOOGLE_SHEET_ID must be set` | — |
| **Google Ads** |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN` | `lib/google-ads.ts:16-18` (`!` assertions) | Yes (ads) | Silent until API call fails | Singleton client |
| `GOOGLE_ADS_REFRESH_TOKEN` | `lib/google-ads.ts:64` (`!`) | Yes (ads) | Silent until API call fails | Per-customer `client.Customer()` |
| `GOOGLE_ADS_MCC_ID` | `lib/google-ads.ts:65` (`login_customer_id`) | Yes (ads) | Silent — requests fail for child accounts | — |
| **Email** |
| `RESEND_API_KEY` | `lib/notify-owner.ts:699`, `app/api/webhooks/voice/route.ts:750`, `app/api/dashboard/emails/route.ts:174`, `app/api/contact/route.ts:47,51`, `app/api/book-demo/route.ts:11,15`, `app/api/marketing-bookings/route.ts:438-490` | Yes (all email) | Silent — every caller guards with `if (RESEND_API_KEY)` or try/catch; email simply doesn't send | — |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `lib/notify-owner.ts:666-669` **inside dead `getTransporter()` only** | No — dead | — | Never called; safe to delete from envs |
| **Storage** |
| `BLOB_READ_WRITE_TOKEN` | `app/api/webhooks/voice/route.ts:665` (voicemail upload). Note: `campaigns/upload-image` calls `put()` without passing a token — `@vercel/blob` reads this var internally | Yes (voicemail + campaign images) | Silent-ish — upload throws, caught per call site | — |
| **App / Admin** |
| `ADMIN_USER_ID` | 21 sites: every `app/api/admin/**` route, `app/admin/page.tsx:10`, `lib/get-business-for-dashboard.ts:9`, plus admin bypass in `app/api/auth/google:13`, `bookings/[id]:10`, `bookings/[id]/cancel:14`, `admin/usage/*` | Yes (admin) | Silent — comparisons against `undefined` never match, so `/admin` and admin APIs 403/redirect for everyone | Clerk user ID of Jacob |
| `CRON_SECRET` | `app/api/admin/usage/sync/route.ts:12` — **enforced**: `authHeader === 'Bearer ' + CRON_SECRET` marks the request as cron (defaults `dateRange=yesterday`) and skips Clerk admin auth | Yes for the Vercel cron (`vercel.json` hits this route daily) | Silent — cron requests fall through to Clerk auth and get 403; daily sync silently stops | — |
| `SMS_COOLDOWN_DAYS` | `lib/sms-cooldown.ts:12-13` (parsed once at module load) | No | — | Business `smsCooldownDays` → this env → 7 days |
| `NEXT_PUBLIC_APP_URL` | `lib/notify-owner.ts:33` | No | — | Chain: `NEXT_PUBLIC_APP_URL ?? https://${VERCEL_URL} ?? 'https://www.alignandacquire.com'` — hard-coded fallback is **www** |
| `VERCEL_URL` | `lib/notify-owner.ts:34` (2 reads, same expression) | No (Vercel-provided) | — | Middle of the baseUrl chain above |
| `NODE_ENV` | `lib/db.ts:7` | Auto | — | Non-production keeps Prisma client on `globalThis` |
| **Marketing page** |
| `MARKETING_BUSINESS_ID` / `MARKETING_BUSINESS_SLUG` | `app/api/marketing-bookings/route.ts:110,115` (`getMarketingBusiness()`) | Yes for /book wizard | Loud-ish — route returns error "Booking is temporarily unavailable…" when no business resolves | ID takes priority over slug |
| `YOUR_EMAIL` | `app/api/contact/route.ts:47,56`, `app/api/book-demo/route.ts:11,20`, `app/api/marketing-bookings/route.ts:420` | Yes (marketing notifications) | Silent — guarded; email skipped. marketing-bookings falls back `YOUR_EMAIL \|\| business.ownerEmail \|\| 'jacob@alignandacquire.com'` | — |
| `OWNER_PHONE` | `app/api/marketing-bookings/route.ts:421` | No | Silent — SMS to owner skipped | — |
| `MARKETING_TELNYX_NUMBER` | `app/api/marketing-bookings/route.ts:422` | No | Silent — SMS skipped | — |
| **Analytics/Pixels** |
| `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` | `app/components/MetaPixel.tsx:6` | No | Silent — component renders `null` | Client-side (inlined at build) |

**Dead env vars still likely present in Vercel:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (not even read anymore), `TELNYX_PUBLIC_KEY`, `TELNYX_PHONE_NUMBER`.

---
## Section 4 — Prisma Schema (20 models)

Source: `prisma/schema.prisma` (working tree — includes the uncommitted `ownerGroupId` addition). Datasource: PostgreSQL, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`. Every relation to `Business` uses `onDelete: Cascade` unless noted.

### Business

| Field | Type | Default / attrs |
|---|---|---|
| id | String | @id @default(cuid()) |
| name | String | — |
| slug | String | @unique |
| businessType | String? | — |
| ownerGroupId | String? | **new (uncommitted)** — businesses sharing a non-null value form an owner group (aggregated Website Leads + Google Ads per schema comment) |
| telnyxPhoneNumber | String? | @unique |
| forwardingNumber | String? | — |
| timezone | String | @default("America/New_York") |
| businessHours | Json? | — |
| servicesOffered | Json? | — |
| aiGreeting | String? | — |
| aiInstructions | String? | @db.Text |
| aiContext | String? | @db.Text |
| calendarEnabled | Boolean | @default(false) |
| googleAccessToken | String? | @db.Text |
| googleRefreshToken | String? | @db.Text |
| googleCalendarConnected | Boolean | @default(false) |
| slotDurationMinutes | Int | @default(30) |
| bufferMinutes | Int | @default(0) |
| smsBookingEnabled | Boolean | @default(true) — when false, SMS AI does lead capture even with calendar connected |
| stripeCustomerId | String? | @unique |
| stripeSubscriptionId | String? | — |
| subscriptionStatus | String | @default("trialing") |
| googleAdsCustomerId | String? | — |
| googleAdsEnabled | Boolean | @default(false) |
| googleAdsTabLabel | String? | @default("Google Ads") |
| adminNotes | String? | @db.Text |
| setupFee | Float? | — |
| monthlyFee | Float? | — |
| spamFilterEnabled | Boolean | @default(false) |
| callScreenerEnabled | Boolean | @default(false) |
| callScreenerMessage | String? | — |
| missedCallVoiceMessage | String? | @default("We're sorry we can't get to the phone right now. You should receive a text message shortly.") |
| missedCallAiEnabled | Boolean | @default(true) |
| knownContactVoicemailEnabled | Boolean | @default(false) |
| smsCooldownDays | Int? | null → env → 7 |
| cooldownBypassNumbers | Json? | @default("[]") |
| bookingPageTitle | String? | — |
| bookingPageServiceLabel | String? | — |
| bookingPageConfirmation | String? | @db.Text |
| bookingRequiresAddress | Boolean | @default(true) |
| maxMessagesPerConversation | Int | @default(23) |
| ownerEmail | String? | — |
| ownerPhone | String? | — |
| notifyBySms | Boolean | @default(true) |
| notifyByEmail | Boolean | @default(true) |
| massMessagingEnabled | Boolean | @default(false) |
| createdAt / updatedAt | DateTime | @default(now()) / @updatedAt |

Relations: `users User[]`, `conversations`, `appointments`, `screenedCalls`, `blockedNumbers`, `contacts`, `contactCooldowns`, `cooldownSkipLogs`, `telnyxUsageRecords`, `tags`, `jobs`, `emailCampaigns`, `activities`, `websiteLeads`, `googleAdsSnapshots`. Block attrs: `@@index([stripeCustomerId])`, `@@index([ownerGroupId])`.

### TelnyxUsageRecord
`id` cuid PK · `businessId` FK (Cascade) · `recordType String` ("sms" | "call" per comment) · `telnyxRecordId String @unique` (idempotency key) · `cost Float @default(0)` · `occurredAt DateTime` · `metadata Json?` · `createdAt`. Indexes: `[businessId]`, `[businessId, recordType]`, `[occurredAt]`.

### Contact
`id` cuid PK · `businessId` FK (Cascade) · `phoneNumber String` (normalized) · `name String?` · `createdAt` · `email String?` · `address/city/state/zip String?` · `source String?` (missed_call, website_form, manual, referral, google_ad; **NULL = pre-existing customer, skips automated SMS**) · `isClientContact Boolean @default(false)` (client's own saved contact — schema comment says "Written & displayed only; NOT read during call routing" but that comment is **stale**: `isClientVoicemailContact()` reads it in the voice webhook when `knownContactVoicemailEnabled` is on) · `status String? @default("new")` · `notes String? @db.Text` · `lastContactedAt DateTime?` · `updatedAt @default(now()) @updatedAt` · `totalRevenue Float? @default(0)`. Relations: `contactTags`, `jobs`, `emailRecipients`, `activities`. `@@unique([businessId, phoneNumber])`, `@@index([businessId])`.

### BlockedNumber
`id` cuid PK · `businessId` FK (Cascade) · `phoneNumber String` · `label String?` · `createdAt`. `@@unique([businessId, phoneNumber])`, `@@index([businessId])`.

### User
`id` cuid PK · `clerkId String @unique` · `email String` · `firstName/lastName/imageUrl String?` · `role String @default("owner")` · `businessId` FK (Cascade) · timestamps. `@@index([clerkId])`, `@@index([businessId])`. Created only via `tx.user.upsert` in `app/onboarding/page.tsx:80`.

### Conversation
`id` cuid PK · `businessId` FK (Cascade) · `callerPhone String` · `callerName String?` · `callSid String? @unique` · `aLegCallControlId String?` · `callConnected Boolean @default(false)` · `dialCallStatus String?` · `answeredBy String?` · `durationSeconds Int?` · `callEndedAt DateTime?` · `recordingUrl String?` · `voicemailTranscription String? @db.Text` · `status String @default("active")` · `manualMode Boolean @default(false)` · `summary String? @db.Text` · `bookingFlowState Json?` · `intent String?` · `serviceRequested String?` · `customerEmail String?` · `customerAddress String? @db.Text` · `customerTimeframe String?` · `createdAt/updatedAt` · `lastMessageAt DateTime @default(now())`. Relations: `messages Message[]`, `appointment Appointment?`. Indexes: `[businessId]`, `[callerPhone]`, `[status]`, `[createdAt]`.

### Message
`id` cuid PK · `conversationId` FK (**Cascade**) · `direction String` ("inbound"/"outbound") · `content String @db.Text` · `telnyxSid String?` · `telnyxStatus String?` · `cost Float?` (backfilled from MDR) · `createdAt`. Indexes: `[conversationId]`, `[createdAt]`.

### Appointment
`id` cuid PK · `businessId` FK (Cascade) · `conversationId String? @unique` FK (**onDelete: SetNull**) · `customerName String` · `customerPhone String` · `customerEmail String?` · `serviceType String` · `scheduledAt DateTime` · `duration Int @default(60)` · `notes String? @db.Text` · `customerAddress String? @db.Text` · `source String @default("website")` ("website"|"sms") · `googleCalendarEventId String?` · `calendarSyncFailed Boolean @default(false)` · `status String @default("confirmed")` · `reminderSentAt DateTime?` · timestamps. Indexes: `[businessId]`, `[scheduledAt]`, `[status]`.

### PhoneNumber
`id` cuid PK · `phoneNumber String @unique` · `telnyxSid String @unique` · `assignedToBusinessId String?` · `status String @default("available")` · timestamps. `@@index([status])`. **No relation to Business** (plain string column).

### ContactCooldown
`id` cuid PK · `businessId` FK (Cascade) · `phoneNumber String` · `lastMessageSent DateTime` · timestamps. `@@unique([businessId, phoneNumber])`, `@@index([businessId])`, `@@index([phoneNumber])`.

### CooldownSkipLog
`id` cuid PK · `businessId` FK (Cascade) · `phoneNumber String` · `reason String @default("cooldown")` · `attemptedAt DateTime @default(now())` · `lastMessageSent DateTime` · `messageType String?`. Indexes: `[businessId]`, `[attemptedAt]`.

### ScreenedCall
`id` cuid PK · `businessId` FK (Cascade) · `callerPhone String` · `callSid String?` · `result String @default("blocked")` · `createdAt`. Indexes: `[businessId]`, `[businessId, result]`, `[createdAt]`.

### Tag
`id` cuid PK · `businessId` FK (Cascade) · `name String` · `color String? @default("#6B7280")` · relation `contacts ContactTag[]`. `@@unique([businessId, name])`, `@@index([businessId])`.

### ContactTag
`contactId` + `tagId` composite `@@id`; both FKs Cascade. Indexes on each column.

### Job
`id` cuid PK · `businessId` FK (Cascade) · `contactId` FK (Cascade) · `serviceName String` · `description String? @db.Text` · `scheduledDate/completedDate DateTime?` · `amount Float?` · `status String @default("scheduled")` · `notes String? @db.Text` · timestamps. Indexes: `[businessId]`, `[contactId]`, `[status]`.

### EmailCampaign
`id` cuid PK · `businessId` FK (Cascade) · `senderName String @default("Align and Acquire")` · `subject String` · `body String @db.Text` · `images Json?` · `status String @default("draft")` · `recipientCount Int @default(0)` · `sentAt DateTime?` · `createdAt` · relation `recipients EmailRecipient[]`. Indexes: `[businessId]`, `[status]`.

### EmailRecipient
`id` cuid PK · `campaignId` FK (Cascade) · `contactId` FK (Cascade) · `email String` · `status String @default("pending")` · `sentAt DateTime?`. Indexes: `[campaignId]`, `[contactId]`.

### Activity
`id` cuid PK · `businessId` FK (Cascade) · `contactId` FK (Cascade) · `type String` · `description String` · `metadata Json?` · `createdAt`. Indexes: `[businessId]`, `[contactId]`, `[createdAt]`.

### WebsiteLead
`id` cuid PK · `businessId` FK (Cascade) · `name String` · `phone/email String?` · `message String? @db.Text` · `status String @default("new")` · timestamps. Indexes: `[businessId]`, `[status]`, `[createdAt]`.

### GoogleAdsSnapshot
`id` cuid PK · `businessId` FK (Cascade) · `date DateTime` · `campaignId String` · `campaignName String` · `impressions Int @default(0)` · `clicks Int @default(0)` · `cost Float @default(0)` (USD from cost_micros/1e6) · `conversions Float @default(0)` · `ctr Float @default(0)` · `costPerConversion Float?` · `createdAt`. `@@unique([businessId, campaignId, date])` (upsert key), `@@index([businessId, date])`.

### Business-field consumer cross-check

| Field | Primary consumers (grep-verified) |
|---|---|
| slug | booking pages/layout, `bookings/available-slots`, `bookings/create`, `marketing-bookings`, `/api/contact` |
| businessType | onboarding, settings form, admin SettingsTab |
| **ownerGroupId** | read only by `lib/owner-group.ts` (`getOwnerGroupBusinesses`), called by `app/api/dashboard/website-leads/route.ts:19,63`, `app/api/dashboard/google-ads/route.ts:37`, `app/api/dashboard/google-ads/sync/route.ts:21` |
| telnyxPhoneNumber | webhooks (tenant lookup), notify-owner (SMS from), campaign/send routes, admin UI |
| forwardingNumber | voice webhook (B-leg dial), notify-owner fallback, admin SettingsTab/TogglesTab |
| timezone | booking slots, SMS prompts, create-booking, admin SettingsTab |
| businessHours | `lib/google-calendar.ts` slot computation, settings/onboarding forms |
| servicesOffered | booking pages, SMS prompts, settings |
| aiGreeting / aiInstructions / aiContext | `webhooks/sms` prompt construction; settings + admin forms |
| calendarEnabled + googleCalendarConnected | `lib/business-features.ts` (hasCalendar), appointments page gates, sms routing, google-calendar lib |
| googleAccessToken / googleRefreshToken | only `lib/google-calendar.ts` (token store/refresh) |
| slotDurationMinutes / bufferMinutes | google-calendar slot math, available-slots response, settings |
| **smsBookingEnabled** | `app/api/webhooks/sms/route.ts` (booking-flow gate), `TogglesTab.tsx`, admin PATCH allowedFields, `app/admin/types.ts` |
| stripeCustomerId / stripeSubscriptionId | **zero reads anywhere — schema-only** |
| subscriptionStatus | admin UI only (HeaderKPIs MRR calc, ClientTable badge, AdminClient) — no billing enforcement anywhere |
| googleAdsCustomerId / googleAdsEnabled / googleAdsTabLabel | `lib/google-ads.ts`, ads dashboard routes/pages, dashboard layout nav label, admin UI |
| adminNotes / setupFee / monthlyFee | admin UI only (SettingsTab; monthlyFee also HeaderKPIs/ClientTable) |
| spamFilterEnabled / callScreenerEnabled / callScreenerMessage | voice webhook, `lib/business-features.ts`, admin toggles |
| missedCallVoiceMessage | voice webhooks (TTS payload), settings |
| missedCallAiEnabled | voice webhook flow selection, `business-features.ts`, feature gates (conversations/leads/website-leads routes + pages), admin |
| knownContactVoicemailEnabled | voice webhook (known-contact voicemail routing), dashboard layout + overview + voicemails page (nav/section visibility), admin toggle |
| smsCooldownDays / cooldownBypassNumbers | `lib/sms-cooldown.ts`, webhooks, admin SettingsTab |
| bookingPage* / bookingRequiresAddress | booking pages + available-slots response + settings |
| maxMessagesPerConversation | `webhooks/sms` message-limit guard, settings |
| ownerEmail / ownerPhone / notifyBySms / notifyByEmail | `lib/notify-owner.ts` (all notification paths), voice webhook voicemail alert, settings |
| massMessagingEnabled | outreach page gate + emails/messages-campaign routes (403 gates), admin toggle |

### Schema fields never read in app code

- `Business.stripeCustomerId`, `Business.stripeSubscriptionId` — written nowhere, read nowhere (no Stripe SDK installed; see §14i).
- `Appointment.reminderSentAt` — zero references; no reminder system exists.
- `User.role` — never read; only exists via default("owner").
- **`PhoneNumber` (entire model)** — zero references to `db.phoneNumber` anywhere in app/, lib/, or scripts/. The number pool is schema-only.
- `Conversation.answeredBy` — written by the voice webhook (bridge success) but only two files reference it; no UI reads it.

### Code references to fields that do not exist in the schema

None found — TypeScript strict mode + generated Prisma types make this class of drift compile-time-impossible, and no `@ts-ignore`/`as any` around Prisma calls was found. The reverse direction (schema fields dead in code) is listed above. One **stale schema comment**: `Contact.isClientContact` says "NOT read during call routing" but `lib/contacts-check.ts:isClientVoicemailContact()` reads it from the voice webhook.

---
## Section 5 — Voice / Call Flow

Main webhook: `app/api/webhooks/voice/route.ts` (1,132 lines, POST only). Telnyx Call Control: JSON events in, respond 200, control the call via separate API calls; state passes between events as base64-JSON `client_state` (`toB64()` at :824).

### Constants (voice/route.ts:49-60)

```ts
const VOICE = 'AWS.Polly.Joanna'
const DEFAULT_VOICE_MESSAGE = "We're sorry we can't get to the phone right now. You should receive a text message shortly."
const NO_SMS_VOICE_MESSAGE  = "We're sorry, no one is available. Please try again later. Goodbye."
const VOICEMAIL_GREETING    = 'Sorry, no one is available to take your call right now. Please leave a message after the tone.'
const FORWARDING_TIMEOUT_SECS = 25            // missedCallAiEnabled: ring out quickly → SMS flow
const FORWARDING_TIMEOUT_VOICEMAIL_SECS = 20  // AI disabled: longer ring so owner voicemail can pick up
const HOLD_MESSAGE_PAYLOAD = 'We are connecting you. . . . [long dot string] . . . Please stay on the line. . . .'
```

### ClientState (verbatim, :62-73)

```ts
interface ClientState {
  businessId?: string
  callerPhone?: string
  connectionId?: string
  forwardingPending?: boolean
  dialAlreadyStarted?: boolean
  isForwardingLeg?: boolean
  aLegCallControlId?: string
  voicemailPending?: boolean
  announceCallerPending?: boolean
  voicemailReason?: string   // 'client_contact' when voicemail was chosen via known-contact routing
}
```
(`voicemailReason` is new relative to the old doc.)

### Events handled, in code order

**1. `call.initiated` (direction inbound/incoming), :104-181**
1. `findBusiness(to)` (:828): exact `telnyxPhoneNumber` match, else digit-normalized scan of all businesses with a number. No business → `reject(CALL_REJECTED)`.
2. Forwarding-loop prevention (:115): if `phonesMatch(from, business.telnyxPhoneNumber)` → answer, speak `missedCallVoiceMessage || NO_SMS_VOICE_MESSAGE`, return (no conversation, no SMS).
3. Spam filter (:124): `spamFilterEnabled && isSpamCall(from)` → create `ScreenedCall(result:'blocked')`, `reject(CALL_REJECTED)`.
4. `answer()` with client_state `{businessId, callerPhone, connectionId}`.
5. If `callScreenerEnabled`: upsert Conversation `{status:'screening', callSid}`; `gatherUsingSpeak` with `callScreenerMessage || "Thank you for calling {name}. To be connected, please press 1."`, `minimum_digits:1, maximum_digits:1, timeout_millis:8000, valid_digits:'0123456789', maximum_tries:1`.
6. Else (no screener): **known-contact voicemail check first** — `knownContactVoicemailEnabled && isClientVoicemailContact()` → `startClientContactVoicemail()`; otherwise `sendMissedCallSMS()` if `missedCallAiEnabled`, then speak `missedCallVoiceMessage || DEFAULT_VOICE_MESSAGE` (AI on) or `|| NO_SMS_VOICE_MESSAGE` (AI off).

**2. `call.answered` with `state.isForwardingLeg` (B-leg only), :186-260**
Caller announcement: loads ALL business contacts and `phonesMatch`-scans for a name; whisper `"Connecting to {name}"` or the number read as `"{area} {prefix} {line}"`, else digit-by-digit, else "unknown caller". Speaks with `announceCallerPending: true`. If speak throws → bridge immediately; bridge success sets Conversation `{callConnected: true, status:'completed', answeredBy:'human'}` via `updateMany(status:'forwarding')`; bridge failure → `handleForwardingFallback(state, 'failed')`. (A-leg `call.answered` is not handled — commands are queued right after `answer()` in call.initiated.)

**3. `call.speak.ended`, :265-435** — four branches in order:
   a. `announceCallerPending && isForwardingLeg && aLegCallControlId` → bridge B→A, mark conversation connected; on error → fallback.
   b. `voicemailPending` → `startRecording({format:'mp3', channels:'single', max_length:120, timeout_secs:5, play_beep:true})`; when `state.voicemailReason` is set, re-passes client_state (with voicemailReason) so `call.recording.saved` can notify the owner; on error → hangup.
   c. `forwardingPending`: if `dialAlreadyStarted` → no-op (parallel dial already running). Else sequential-dial fallback: re-load business; missing `forwardingNumber` or missing `connectionId` (`state.connectionId || TELNYX_CONNECTION_ID`) → known-contact-voicemail / SMS+speak fallback; otherwise `telnyx.calls.dial({connection_id, to: forwardingNumber, from: telnyxPhoneNumber, timeout_secs: 25|20, client_state: bLegState, ringback_tone: true})` where bLegState = `{businessId, callerPhone, isForwardingLeg:true, aLegCallControlId, announceCallerPending:true}`; dial rejection → same fallback trio.
   d. default → `hangup()` (ends the call after any ordinary spoken message).

**4. `call.gather.ended`, :440-593**
- Missing businessId/business → hangup.
- `digits === '1'`: create `ScreenedCall(result:'passed')`. Then:
  - `callScreenerEnabled && forwardingNumber` → upsert Conversation `{status:'forwarding', aLegCallControlId}`; if connectionId available run **speak(HOLD_MESSAGE) ∥ dial(B-leg) in parallel** via `Promise.allSettled` (fwdState has `dialAlreadyStarted: !!connectionId`); dial rejection → known-contact-voicemail / SMS+speak fallback. No connectionId → speak HOLD_MESSAGE with `dialAlreadyStarted:false` (dial happens on speak.ended 3c).
  - No forwarding → known-contact voicemail check, else `sendMissedCallSMS()` + speak missed-call message.
- Wrong digit or timeout: update Conversation → `status:'screening_blocked'`, create `ScreenedCall(result:'blocked')`. Timeout/no-DTMF (`digits` null or '') → **hangup immediately** (robocall, no message). Wrong key → speak "Thanks for calling. Goodbye." (then speak.ended → hangup).

**5. `call.hangup` with `state.isForwardingLeg`, :598-633** — if conversation `callConnected` → record `{dialCallStatus:'completed', callEndedAt, durationSeconds}`; if status already ≠ 'forwarding' → skip (idempotent); else `handleForwardingFallback(state, 'no-answer')`.

**6. `call.bridging.failed` with `state.isForwardingLeg`, :638-652** — hangup B-leg (best-effort), `handleForwardingFallback(state, 'failed')`.

**7. `call.recording.saved`, :657-788** — fetch mp3 from `recording_urls.mp3 ?? public_recording_urls.mp3`, upload to Blob `voicemails/{callControlId}.mp3` (`access:'public'`); **on Blob failure falls back to saving the raw Telnyx URL** (:679-683). Saves `recordingUrl` on the conversation (found by callSid). Owner voicemail notification fires when `!missedCallAiEnabled || state.voicemailReason === 'client_contact'`: waits **8 s** for transcription (:707), resolves caller name via `findExistingContact`, then SMS (from telnyxPhoneNumber to ownerPhone, gated by notifyBySms) and Resend email (from `notifications@alignandacquire.com`, gated by notifyByEmail); both link hard-coded `https://www.alignandacquire.com/dashboard/voicemails`. Finally hangs up.

**8. `call.transcription` / `call.recording.transcription.saved`, :794-810** — saves `transcription_text ?? text ?? content` to `Conversation.voicemailTranscription` by callSid.

All other events → 200 ack. The whole handler is wrapped in try/catch that **always returns 200** (:814-817).

### `handleForwardingFallback()` (:848-930)
Requires `businessId + callerPhone + aLegCallControlId` in state. Loads conversation by `callSid = aLegCallControlId`. Idempotency guard: skip if `(callConnected && durationSeconds > 5)` **or** `status !== 'forwarding'`. Updates conversation `{status:'active', dialCallStatus, callEndedAt}`. Then: known-contact voicemail → `startClientContactVoicemail()`; else AI on → `sendMissedCallSMS()` + speak missed-call message on A-leg; else AI off → speak `VOICEMAIL_GREETING` with `voicemailPending:true` (recording starts on speak.ended).

### `startClientContactVoicemail()` (:949-980)
Upserts a Conversation on callSid first (create `{status:'active'}` / update `{}`) because `call.recording.saved` only updates by callSid; then speaks `VOICEMAIL_GREETING` with `{voicemailPending:true, voicemailReason:'client_contact'}`. Errors logged, never thrown (caller may have hung up).

### `sendMissedCallSMS()` (:982-1120) — guards in exact code order
0. `BlockedNumber` lookup → log `CooldownSkipLog(reason:'blocked', messageType:'missed_call')`, return.
1. `isExistingContact()` (Contact with `source IS NULL`) → `logContactSkip()`, return.
2. `isCooldownBypassNumber()` → skips step 3 when matched.
3. `checkCooldown()` → log skip + return when inside window.
4. Find conversation: `callSid == callControlId` OR same business+caller created within **24 h**.
5. If found: skip when `callConnected && durationSeconds > 5`; skip when an outbound Message already exists (idempotency); reset `screening`/`screening_blocked` status → `active`.
6. Else create Conversation (race-safe: create in try/catch, re-find by callSid on unique-violation).
7. Send SMS: `business.aiGreeting || "Sorry we missed your call at {name}. How can we help?"`.
8. **Deferred DB writes** (`void …then().catch()`): `Message.create` then `recordMessageSent()` — intentional; do not await (keeps webhook fast; DB failure after send only loses the dashboard record).

### `isSpamCall()` (:1122-1132)
Blocks: prefixes `+1833/+1844/+1855/+1866/+1877/+1888/+1800`; `<10` digits; `+1` numbers whose area code starts with 0 or 1.

### Secondary routes

**`voice-dial-status` (309 lines, POST)** — legacy status-callback style; query params `callSid`, `businessId`, `callerPhone`. Guards in order: missing params → 200; business missing → 200; `missedCallAiEnabled === false` → skip; BlockedNumber → log+skip; `isExistingContact` → log+skip. Updates/creates the Conversation by parent callSid with `{dialCallStatus, answeredBy, durationSeconds, callEndedAt}`. SMS trigger matrix: `no-answer|busy|failed` → always SMS; `completed` + answeredBy contains "machine"/"unknown" → SMS only if `duration >= 2s`; `completed` human → conversation `status:'completed'`, no SMS. Dedupe: any *other* conversation for the same caller within 24 h → skip. Sets conversation `status:'no_response'`, then bypass/cooldown check, then sends `business.aiGreeting || "Hi! Sorry we missed your call at {name}. I'm an automated assistant - how can I help you today?"` (note: a *different* default greeting than the main webhook) with the same deferred-DB-write pattern. **Nothing in the repo references this URL — it only runs if configured in the Telnyx portal.**

**`voice-after-dial` (61 lines, POST)** — returns XML (`text/xml`). If `state === 'completed' && duration > 0` → `<Response><Hangup /></Response>`; else `<Say>{missedCallVoiceMessage || default}</Say><Hangup/>` (XML-escaped). No DB writes beyond a business lookup. Externally configured only.

**`voice-gather` (229 lines, POST)** — standalone XML-mode gather handler; query params `businessId`, `callSid`. digits === '1' → ScreenedCall passed + missed-call SMS (same guard chain: blocked → existing-contact → bypass → cooldown) + `<Say>` goodbye; otherwise `status:'screening_blocked'` + ScreenedCall blocked. Externally configured only; not referenced by code.

---
## Section 6 — SMS Conversation System

Source: `app/api/webhooks/sms/route.ts` (2,555 lines, POST only). Anthropic client at :22: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })`.

**Model:** every Anthropic call uses **`claude-haiku-4-5-20251001`** with `max_tokens: 256` — three call sites: lead-extraction (:1033), lead-mode response (:2294), calendar-mode response (:2462, with retry loop). `AI_FALLBACK_MESSAGE = "Thanks for reaching out! Let me have someone from the team get back to you shortly."` (:2143).

### Event routing
- `message.finalized` / `message.sent` → `Message.updateMany({telnyxSid}, {telnyxStatus})`, 200.
- `message.received` → inbound pipeline below.
- Anything else → 200 "OK". Top-level catch returns **500 "Error"** (unlike the voice webhook, which always 200s).

### Inbound pipeline — guards in exact code order (:162-391)
1. Business lookup by `telnyxPhoneNumber == to`; none → 200.
2. **STOP check** (:177): exact-match (`===` after lowercase/trim) against `['stop','unsubscribe','cancel','quit']` → `sendSMS` "You've been unsubscribed. Reply START to resubscribe.", return. (No Message record; no suppression list is stored app-side — carrier/Telnyx-level opt-out only.)
3. **Never-mind check** (:185): substring match against `['never mind','nevermind','not interested','no thanks','no thank you']` → find-or-create conversation, save inbound Message, send "No worries! …", set `status:'closed', summary:'Customer said not interested'`, notify owner via `notifyOwnerOnLeadCaptured` (service = "Partial interest - customer declined").
4. **Empty-text guard** (:227): blank/MMS-no-body inbound → ack without saving (empty content blocks would 400 every future Anthropic call).
5. Conversation lookup (:237): most recent conversation for business+caller with `createdAt >= now − 90 days` (`closedWindowDays = 90`), ordered by `lastMessageAt desc`, first 50 messages included.
6. **Closed-status short-circuit** (:248): if status ∈ `NO_AI_RESPONSE_STATUSES = ['appointment_booked','lead_captured','closed','human_needed','needs_review','completed']` → save inbound message + bump `lastMessageAt`, then: `appointment_booked` → question-detection regex answers appointment logistics from the Appointment row, else "You're welcome!…", then `status:'closed'`; `lead_captured` → pleasantry detection ("thanks/ty/thx" whole-word logic) → "Anytime! Talk soon." vs "Got it, I'll pass that along…", then `status:'closed'`. Other closed statuses: message saved, no reply.
7. No conversation → create (`status:'active'`) + background `findOrCreateContact(source:'missed_call')` (fire-and-forget).
8. **Spam duplicate guard** (:325): identical inbound content within `SPAM_WINDOW_SECONDS = 30` → ignore.
9. **Message limit guard** (:338): `maxMessagesPerConversation ?? DEFAULT_MAX_MESSAGES_PER_CONVERSATION` — note the code default constant is **25** (:91) but the schema default is 23, so in practice the DB value 23 applies. Skipped entirely while `bookingFlowState.step` is set. Over limit → `status:'completed'`, send "Thanks for chatting! For further help, please {call us phrase}" via `sendSMS` (unlogged), return.
10. Save inbound Message + bump `lastMessageAt`; re-fetch conversation.
11. Re-check: `NO_AI_RESPONSE_STATUSES` or a linked appointment → return (no AI).

**`manualMode` is never read here.** It is only *written* (`manualMode: true`) by `dashboard/messages/send` and `dashboard/messages/campaign` when they create conversations. Nothing in the AI pipeline checks it — the old doc's claim that manualMode suppresses AI replies is no longer true.

### Routing (:376-396)
- If `!business.calendarEnabled || !business.smsBookingEnabled` → `handleSmsLeadFlow()` — which only short-circuits (`true`) when status is already `lead_captured`; otherwise conversation falls through to the general AI in lead mode.
- Then `handleSmsBookingFlow()` — hard-gated at :1084 on `calendarEnabled && smsBookingEnabled`; returns true when it handled the message.
- Else `generateAIResponse(business, conversation, text, bookingFlowState, calendarEnabled && smsBookingEnabled !== false)`.

### Special tags (parse sites)
- Strip-all regexes at :422-427: `[APPOINTMENT_BOOKED:…]`, `[LEAD_CAPTURED:…]`, `[READY_TO_CAPTURE]`, `[HUMAN_NEEDED(: reason="…")?]`.
- `[READY_TO_CAPTURE]` (:430): only honored when `!calendarEnabled` and not already lead_captured → `extractLeadFromConversation()` (Claude JSON extraction) → `notifyOwnerOnLeadCaptured`, conversation → `{status:'lead_captured', callerName, intent:'lead_capture', serviceRequested, customerEmail/Address/Timeframe, bookingFlowState: DbNull}`, background contact update, send `buildLeadConfirmation()`.
- `[APPOINTMENT_BOOKED: name="…", service="…", datetime="…"(, notes="…")?(, address="…")?]` (:567): parsed with that exact regex, honored **only when `canAiBook = !calendarEnabled || !googleCalendarConnected`** — with a connected calendar the AI is never allowed to book; the structured flow is the only path. On match → `createBooking({skipSlotVerification:true, allowWithoutCalendar:true})`; success → `status:'appointment_booked'` (createBooking already sent the confirmation SMS — cleanResponse is deliberately NOT sent to avoid double-texting); failure → friendly retry message.
- `[HUMAN_NEEDED(: reason="…")]` (:626): → `{status:'human_needed', intent:'human_needed'}` + `notifyOwnerOnHumanNeeded` (then the cleaned response still goes out).
- `[LEAD_CAPTURED:…]` is stripped but has **no handler** — comment at :624 says lead capture is `[READY_TO_CAPTURE]`/backstop only.

### Safety nets after the AI response (calendar-enabled, :486-555)
- **Fake-confirmation intercept:** if no flow step is active and the response matches "you're all set / your appointment is confirmed / booked for…" (and isn't a question), the AI reply is suppressed and replaced with a redirect into the structured flow (`step:'awaiting_name_and_preference'`, `status:'booking_in_progress'`).
- **Guidance detection:** AI asked for name AND day/time → engage `awaiting_name_and_preference` for the next message and send the AI's reply as-is.

### Lead backstop (:656-727, calendar-disabled only)
When the AI never emitted `[READY_TO_CAPTURE]` but ≥2 inbound messages exist and status is still open: run `extractLeadFromConversation()`; if it yields an address OR a timeframe → notify owner FIRST (status only flips to `lead_captured` if notify succeeds — a failed notify leaves it `active` so the next inbound retries), update conversation + contact, send the standard `buildLeadConfirmation()`.

### Booking state machine (`handleSmsBookingFlow`, :1070-1762)
`BookingFlowState.step` union (verbatim, :752): `'greeting' | 'awaiting_name' | 'awaiting_name_and_preference' | 'awaiting_service' | 'awaiting_notes' | 'awaiting_address' | 'awaiting_time' | 'awaiting_confirmation' | 'awaiting_name_and_address' | 'awaiting_name_after_slot' | 'awaiting_address_after_slot' | 'confirmed'`. Legacy step names `awaiting_slot`/`awaiting_selection`/`awaiting_preference` are mapped to `awaiting_time` (:1102-1108).

Flow: entry guards (already booked / step `confirmed` → true). Steps handled in order:
- `awaiting_confirmation` (+selectedSlot): yes-regex → double-check no appointment exists, `createBooking({skipSlotVerification:true})`, `status:'appointment_booked'`, `bookingFlowState: DbNull`; no-regex → back to `awaiting_time`; anything else → "Reply yes to confirm…".
- `awaiting_name_after_slot` → parse name (`parseNameFromMessage`, strips time/date tails, handles "John, Monday 9am"); time-change interception via `looksLikeTimeChange()` + `handleTimeChangeFromSlotChoice()` (re-checks `isSpecificSlotAvailable`, else `getTwoClosestSlotsOnDay`); then `awaiting_address_after_slot` (if `bookingRequiresAddress`) or straight to `awaiting_confirmation` with `buildConfirmationMessage()`.
- `awaiting_name_and_address`, `awaiting_address_after_slot` → analogous parses (`parseAddressFromMessage` requires length ≥5 and digits for short strings).
- `awaiting_time` → `parseTimePreference()` (extensive natural-language date/time parser, :1952+; handles closed-day detection via `isBusinessClosedOnDate`), exact-slot check → confirm, else two closest alternatives (`suggestedSlots` + `lastDiscussedDate` stored for matching).
- `awaiting_name_and_preference` → `handleAwaitingNameAndPreference()` (:1764): combined "John, Friday 2pm" parsing.
- `awaiting_name`, `awaiting_service` (numbered pick via `parseServiceSelection`), `awaiting_notes` (`parseNotesFromMessage` treats no/skip/none as empty), `awaiting_address`.
- **Intent detection** (:1710-1727): `BOOKING_INTENT_WORDS` (verbatim: book, appointment, schedule, booking, reserve, quote, estimate, come out, come by, stop by, take a look, set up, set me up, sign me up, available, availability, free quote, free estimate, in-person, in person, get on the schedule, when can you, what times, open slots) checked in the current message, then conversation history, plus *implicit intent* (AI offered a quote earlier + customer replies "yes/sure/okay…"). No Claude call is used for intent. Intent + calendar connected → start flow at `awaiting_time` (name known) or `awaiting_name_and_preference`, `status:'booking_in_progress'`. Otherwise return false → general AI.
- Slot lists are never sent; the machine confirms/denies the *specific* requested time (per prompt rules and `isSpecificSlotAvailable`/`getTwoClosestSlotsOnDay`).

### `generateAIResponse()` (:2145-2501)
Filters out empty message contents (Anthropic 400s on empty blocks). Two prompts:
- **Lead mode** (`!calendarEnabled` param): goal = name + address + timeframe then `[READY_TO_CAPTURE]`; explicitly "Do NOT ask for email. Ever."; no pricing ever; `[HUMAN_NEEDED]` on frustration; English only.
- **Calendar mode**: goal = guide toward the structured flow; "NEVER output [APPOINTMENT_BOOKED]"; injects up to 7 available dates for the next 14 days (best-effort, failures swallowed); appends per-step `flowGuidance` when a flow is active.
Both prompts contain the `CRITICAL: The customer's callback number is ${conversation.callerPhone}…` anchor block (:2200, :2332) plus the inline phone-verification rule, and label `forwardingNumber` as "Owner's business line (mention only when redirecting customers to call, never as their callback number)" — this prevents the AI from quoting the owner's number as the customer's callback number. Both reference `(business as any).website`, a field that does **not** exist in the schema (always undefined; harmless).
Missing/empty `ANTHROPIC_API_KEY` → immediate `aiFailed` fallback. Calendar mode retries up to 3 times on HTTP 529 (overloaded) with 3 s delay; other errors fail immediately. `aiFailed` → send fallback message + `notifyOwnerOnAIFailed`.

### Helpers
- `sendSMSAndLog(business, conversationId, to, message, timing?)` (:2508): Telnyx send → **deferred** `Message.create` + `recordMessageSent()` (`void …catch`); send errors are caught and only logged (customer silently gets nothing).
- `sendSMS(business, to, message)` (:2503): raw send, no Message record, no cooldown recording — used for STOP acks and message-limit cutoffs. Errors propagate to the caller.
- `extractLeadFromConversation()` (:1021): Claude JSON extraction (name required, "Customer" fallback instructed) — returns null on any failure.
- `getCallUsPhrase()` (:102): always uses `forwardingNumber` (owner's real line), never the Telnyx number.

---
## Section 7 — API Routes (all 56 route.ts files)

Auth legend — **none**: fully public; **middleware-exempt**: listed in `middleware.ts` public API matcher; **Clerk**: `auth()` + own business resolution; **RDB**: `requireDashboardBusiness()` (401 no session / 404 no business); **ADMIN**: `userId === process.env.ADMIN_USER_ID` else 403 (except view-as, which redirects).

### Webhooks (middleware-exempt via `/api/webhooks/(.*)`)

| Route | Methods | Notes |
|---|---|---|
| `/api/webhooks/voice` | POST | Full trace in §5. Side effects: Conversation/ScreenedCall/Message/CooldownSkipLog writes, Telnyx call actions + SMS, Blob upload, Resend voicemail email. Always returns 200. **No signature verification.** |
| `/api/webhooks/sms` | POST | Full trace in §6. Side effects: Conversation/Message writes, Anthropic calls, Telnyx SMS, createBooking, owner notifications. 500 on top-level error. **No signature verification.** |
| `/api/webhooks/voice-gather` | POST | XML-mode gather handler; query `businessId`, `callSid`. ScreenedCall + missed-call SMS (blocked→contact→bypass→cooldown chain). Externally configured only. |
| `/api/webhooks/voice-after-dial` | POST | Returns TwiML-style XML; query `businessId`. Read-only except business lookup. |
| `/api/webhooks/voice-dial-status` | POST | Query `callSid`,`businessId`,`callerPhone`; dial-outcome → conversation update + missed-call SMS (see §5). |

### Public routes

| Route | Methods | Auth | Request → Response / side effects |
|---|---|---|---|
| `/api/bookings/available-slots` | GET | none (`force-dynamic`) | `businessId`\|`businessSlug`, `start?`, `end?` (YYYY-MM-DD; start clamped to today in business TZ). 404 unknown business; `calendarEnabled=false` → **200** with `{error:'Booking not available', calendarEnabled:false}`; not connected → 200 `{error, slots:[]}`; invalid dates 400. Returns slots via `getAvailableSlotsWithMeta` + booking-page labels. |
| `/api/bookings/create` | POST | none | Body `{businessId\|businessSlug, customerName, customerPhone, customerEmail?, slotStart, serviceType, notes, customerAddress?, conversationId?}`. Website bookings (`!conversationId`) additionally require `notes` and (if `bookingRequiresAddress`) `customerAddress`. 400 gates for calendar off/not connected; 409 past slot. Delegates to `createBooking()` (calendar event + Appointment + confirmation SMS + owner notify). |
| `/api/bookings/[id]` | DELETE | Clerk (+view-as, admin override) | Permanently deletes an appointment; best-effort `deleteCalendarEvent` first. 401/404/403. |
| `/api/bookings/[id]/cancel` | POST | Clerk (+view-as, admin override) | `status:'cancelled'`, best-effort calendar delete, cancellation SMS to customer via Telnyx. 400 if already cancelled. |
| `/api/bookings/delete-past` | POST | Clerk (+view-as) | Deletes all past/cancelled/completed appointments for the business (loop with best-effort calendar deletes). Returns `{deleted}`. |
| `/api/appointments` | GET | Clerk (+view-as) | 403 if `!calendarEnabled`. Lists appointments (desc), auto-marks past confirmed as `completed`, syncs external calendar deletions via `calendarEventExists`. |
| `/api/contact` | POST + OPTIONS | **middleware-exempt**, CORS `*` | Body `{name, phone?, message?, smsConsent, businessId?, businessSlug?, email?}`. Validation: only `name && smsConsent` (400 otherwise) — no rate limiting, no captcha, no spam screening. Unattributed → Resend email to `YOUR_EMAIL` from `onboarding@resend.dev` (HTML-escaped). Attributed (id/slug) → **awaited** `findOrCreateContact(source:'website_form')` + `WebsiteLead.create` + `notifyOwnerOnWebsiteLead` (notify failure logged, not fatal). |
| `/api/marketing-bookings` | GET, POST | none | GET: /book wizard availability days. POST: discovery-call booking — validates consent + slot (409 if taken), `createMarketingCalendarEvent`, `Appointment.create`, owner SMS via `MARKETING_TELNYX_NUMBER`→`OWNER_PHONE`, two Resend emails from `onboarding@resend.dev` (owner via `YOUR_EMAIL || business.ownerEmail || 'jacob@alignandacquire.com'`, plus customer confirmation). |
| `/api/book-demo` | POST | none | `{name, business, email, phone, businessType}` → Resend email to `YOUR_EMAIL` from `onboarding@resend.dev`. **User input is NOT HTML-escaped** (unlike /api/contact). No DB writes. |
| `/api/campaigns/upload-image` | POST | RDB | multipart `file` (png/jpg/jpeg/gif/webp, ≤5 MB), `campaignId?` → Blob `campaign-images/{campaignId|draft}/{sanitized-name}` with `access:'public'`. Returns `{url, filename}`. |

### Auth routes

| Route | Methods | Notes |
|---|---|---|
| `/api/auth/google` | GET | Clerk; `businessId` query required (400). User must own the business or be admin (403). Redirects to Google consent (`getAuthUrl` embeds businessId as `state`). |
| `/api/auth/google/callback` | GET | No auth guard of its own; `code` + `state` (businessId) → `exchangeCodeForTokens` saves tokens + `googleCalendarConnected:true`; redirects to `/dashboard/settings?google_connected=1` or `?google_error=denied|missing_params|exchange_failed`. |

### Dashboard routes (all RDB unless noted)

| Route | Methods | Gates / behavior |
|---|---|---|
| `analytics` | GET | `period` = today/week/month/year/all. Returns feature-aware metrics + `features` + `totalCallsMode` ('screened' → ScreenedCall counts; 'calls' → Conversations with `callSid NOT NULL`), lead sources, recent activity. No feature 403 — cards are gated client-side. |
| `contacts` | GET, POST | GET: `search`, `status` filters. POST: requires phone **or** email (400) and `source` (400); email-only contacts get `__email_only__…` placeholder phone. |
| `contacts/[id]` | GET, PATCH, DELETE | Scoped `where {id, businessId}` (404). GET includes tags/activities/jobs; PATCH updates fields; DELETE removes contact. |
| `contacts/[id]/activities` | GET, POST | GET timeline; POST adds `note_added` Activity (body.content required). |
| `contacts/import` | POST | JSON body `{source (required, 400), contacts[], dryRun?}` — client parses the file; server imports in `BATCH_SIZE = 25` chunks via `findOrCreateContact`. |
| `conversations` | GET | **403 if `!missedCallAiEnabled`**. Conversations having ≥1 message (excludes voicemail-only/screening rows), with messages inline. |
| `emails` | GET, POST | **403 if `!massMessagingEnabled`**. POST: `{senderName?, subject (400), body, images?, recipientSelection (400)}` — resolves recipients (all/tag/status/manual), creates EmailCampaign + EmailRecipients, sends via Resend SDK from `` `${senderName} <notifications@alignandacquire.com>` `` in `BATCH_SIZE = 50` chunks, updates per-recipient status and campaign status (`sent`/`failed`). Plain-text bodies wrapped by `plainTextToEmailHtml`. |
| `emails/[id]` | GET | **403 if `!massMessagingEnabled`**; 404 if not owned. Used by "Reuse as Template". |
| `google-ads` | GET | **403 if `!googleAdsEnabled`**. `startDate`,`endDate`,`groupBy=day\|campaign` (default last 30 days). **Owner-group aggregated**: snapshots for all group businesses; grouped responses add `businessName`/`isGroup`. Returns `{totals, daily, campaigns, lastSyncedAt}`. |
| `google-ads/sync` | POST | **403 if `!googleAdsEnabled`**; ungrouped: 400 without `googleAdsCustomerId`, else `syncGoogleAdsData(business.id)`. Grouped: syncs every member with `googleAdsEnabled && googleAdsCustomerId` (others skipped); 400 if none. |
| `jobs` | GET, POST | GET: `status` filter. POST: `contactId` must belong to business (404), `serviceName` required (400); creates Job + `job_created` Activity. |
| `jobs/[id]` | PATCH | Scoped 404; updates job fields. **No DELETE handler.** |
| `messages` | GET | Conversation list (excludes threads whose callerPhone is the business's own Telnyx number); joins contact names. |
| `messages/[conversationId]` | GET | Thread + messages (`telnyxStatus` exposed as `status`), scoped 404. |
| `messages/send` | POST | `{to, body, conversationId?}` (400s; 400 if no business Telnyx number). Finds/creates conversation for the recipient — created/reused conversations get **`manualMode: true`**; sends via Telnyx; logs Message; `findOrCreateContact(source:'manual')`. |
| `messages/contacts` | GET | Lightweight contact list for the compose UI. |
| `messages/campaign` | POST | **403 if `!massMessagingEnabled`**. `{body (400), recipientFilter (400)}`; merge-field templating; sends in `BATCH_SIZE = 10` with `BATCH_DELAY_MS = 2000`; per-recipient conversation upsert (`manualMode:true`) + Message logs. |
| `messages/campaign/preview` | POST | **403 if `!massMessagingEnabled`**. Same filter resolution; returns recipient count + sample rendering (`mergeFields !== false`). |
| `screened-calls` | GET | Clerk (+view-as, not RDB). `days` param clamped 1–90 (default 30). ScreenedCall stats + rows. |
| `tags` | GET, POST | POST: `name` required (400), duplicate → 409. |
| `voicemails` | GET | Clerk (+view-as, not RDB). Conversations with `recordingUrl != null`, contact names resolved via `normalizePhoneNumber` map. |
| `voicemails/[id]` | DELETE | Scoped 404; clears `recordingUrl` + `voicemailTranscription` (soft delete; Blob file not removed). |
| `website-leads` | GET, PATCH | GET: **403 if `!missedCallAiEnabled`**; **owner-group aggregated** — leads for all group businesses; grouped responses add `businessName` + `isGroup:true` (ungrouped shape unchanged). PATCH: `{leadId, status}` (400; status must be new/contacted/converted/closed), lead looked up across the owner group (404), updates status. Note: PATCH has **no missedCallAiEnabled gate** (GET does). |

### Admin routes (all ADMIN)

| Route | Methods | Behavior |
|---|---|---|
| `businesses` | GET | All businesses (desc), `_count {conversations, appointments, users, screenedCalls}` + computed `blockedCalls30d`, `conversationsThisMonth`, `conversationsLastMonth`, `leadsThisMonth` (this-month conversations with lead signal), `conversationsAllTime`, `leadsAllTime`. |
| `businesses/[id]` | PATCH | Whitelist copy-verbatim (37 fields): `name, calendarEnabled, telnyxPhoneNumber, forwardingNumber, timezone, businessHours, servicesOffered, aiGreeting, aiInstructions, aiContext, subscriptionStatus, spamFilterEnabled, adminNotes, setupFee, monthlyFee, callScreenerEnabled, callScreenerMessage, missedCallVoiceMessage, missedCallAiEnabled, knownContactVoicemailEnabled, slotDurationMinutes, bufferMinutes, smsBookingEnabled, cooldownBypassNumbers, bookingPageTitle, bookingPageServiceLabel, bookingPageConfirmation, bookingRequiresAddress, businessType, maxMessagesPerConversation, ownerEmail, ownerPhone, googleAdsEnabled, googleAdsCustomerId, googleAdsTabLabel, smsCooldownDays, massMessagingEnabled`. Special processing: `telnyxPhoneNumber` → `normalizeToE164` (or null); `cooldownBypassNumbers` → array or comma/semicolon/space-separated string → normalized E.164 array. **`ownerGroupId` is NOT in the whitelist** — no UI/API can set it yet (DB-only). `notifyBySms`/`notifyByEmail` are also absent (despite TogglesTab exposing toggles — see §12/§16). |
| `businesses/[id]/blocked-numbers` | GET, POST, DELETE | List; add `{phoneNumber (400), label?}` (404 business); DELETE `?id=` (400). |
| `businesses/[id]/contacts` | GET, POST, DELETE | List; add single contact (`phoneNumber` required, dedupe 400); DELETE by query id. |
| `businesses/[id]/contacts/bulk` | POST | `{contacts: [{phoneNumber, name?}]}` bulk upsert; 404 business. |
| `businesses/[id]/conversations` | GET | Conversations + messages for any business. |
| `businesses/[id]/screened-calls` | GET | `days` param (default 30); blocked/passed stats. |
| `businesses/[id]/usage` | GET | SMS/call usage, cooldown-skip stats, message cost log. |
| `businesses/[id]/voicemails` | GET | Conversations with recordings. |
| `google-ads/sync` | POST | `{businessId?}` → `syncGoogleAdsData(businessId)` or `syncAllBusinessAds()`. |
| `google-calendar-backfill` | POST | **New route.** `{businessId}` (400/404; 400 if calendar not connected). Creates Google Calendar events for future non-cancelled appointments with `googleCalendarEventId: null` OR `calendarSyncFailed: true`; returns `{processed, succeeded, failed, errors[]}`. |
| `telnyx-test` | GET | Debug MDR/CDR fetch; 500 if `TELNYX_API_KEY` missing. |
| `usage/export` | GET | `dateRange` preset (default `this_month`) or `startDate`/`endDate`; `format=csv\|xlsx`. Builds workbook via `xlsx`. |
| `usage/sheets-sync` | POST | `?date=` (400 invalid) → `syncUsageToGoogleSheets(date)`. |
| `usage/sync` | POST, GET | Admin **or** cron `Authorization: Bearer ${CRON_SECRET}`; `?dateRange=yesterday\|last_7_days\|last_30_days\|last_90_days` (cron default `yesterday`, manual default `last_90_days`); 500 if `TELNYX_API_KEY` missing → `syncTelnyxUsage()`. Wired to the daily Vercel cron. |
| `view-as` | GET | `?businessId=` sets `adminViewAs` cookie (path `/`, `maxAge` 24 h, sameSite lax) → redirect `/dashboard`; `?exit=1` deletes cookie → redirect `/admin`. Non-admin → redirect `/dashboard`. |

---
## Section 8 — Library Functions (all 23 lib/ files)

### lib/auth.ts (55L) — **entirely DEAD**
`getCurrentBusiness(): Promise<Business | null>`, `getCurrentUser()`, `needsOnboarding()` — Clerk `auth()` + User lookup helpers. **Zero callers anywhere**; superseded by `get-business-for-dashboard.ts` (pages) and `dashboard-auth.ts` (API).

### lib/business-features.ts (47L)
`type BusinessFeatures = { hasSpamFilter, hasIvrScreener, hasAnyScreening, hasMissedCallAi, hasForwarding, hasCalendar, showScreeningCards, showAiCards, totalCallsMode: 'screened'|'calls' }`. `getBusinessFeatures(business)` derives: `hasSpamFilter = spamFilterEnabled === true`; `hasIvrScreener = callScreenerEnabled === true`; `hasMissedCallAi = missedCallAiEnabled !== false`; `hasForwarding = Boolean(forwardingNumber)`; `hasCalendar = calendarEnabled && googleCalendarConnected`; `totalCallsMode = hasAnyScreening ? 'screened' : 'calls'`. Callers: dashboard layout, overview page, blocked-calls page, voicemails page, analytics API. Single source of truth — never re-derive inline.

### lib/business-hours.ts (12L)
`DEFAULT_BUSINESS_HOURS: Record<string, {open,close}|null>` — Mon–Fri 09:00–17:00, Sat/Sun null. Client-safe (no imports). Callers: google-calendar (re-exported), admin SettingsTab.

### lib/contacts-check.ts (80L)
- `isExistingContact(businessId, callerPhone)` — true if a Contact with `source: null` matches (`phonesMatch`, last-10). Gate #1 inside `sendMissedCallSMS`. Callers: voice, voice-gather, voice-dial-status webhooks.
- `isClientVoicemailContact(businessId, callerPhone)` — true if a Contact with `isClientContact: true` matches. Drives known-contact voicemail routing (voice webhook only).
- `logContactSkip(businessId, phoneNumber, messageType?)` — CooldownSkipLog `reason:'existing_contact'`.

### lib/conversation-buckets.ts (44L)
`getConversationBucket(conv)`: `closed` if status `lead_captured`/`appointment_booked` OR has appointment OR any of customerEmail/Address/Timeframe; `cold` if no inbound messages; else `active` when `lastMessageAt` within **48 h** (hard-coded), else `stalled`. `BUCKET_LABELS` are now literal: `{cold:'Cold', active:'Active', stalled:'Stalled', closed:'Closed'}` — **the old doc's client-facing labels ("No Reply/In Progress/Went Quiet") no longer exist here**. `BUCKET_COLORS` = gray/green/yellow/blue tailwind classes. Callers: ConversationsClient, CombinedLeadsList, admin conversations page.

### lib/create-booking.ts (336L)
- `cleanServiceForOwner(service)` — strips "I need a quote for my…" prefixes.
- `createBooking(params): Promise<CreateBookingResult>` — params include `business, customerName, customerPhone, customerEmail?, slotStart, serviceType, notes?, customerAddress?, conversationId?, skipSlotVerification? (:80), allowWithoutCalendar? (:82), logPrefix?`. Pipeline: validate (calendar gates bypassable via `allowWithoutCalendar`); duplicate-booking check; **DB-level time-overlap check that runs regardless of `skipSlotVerification` (:161)** — new vs old doc; Google slot re-verification with `TOLERANCE_MS = 60_000` (:192) unless skipped; `createCalendarEvent` failure → `calendarSyncFailed = true`, not fatal (:216-237); `Appointment.create`; confirmation SMS wording by source (:277-278: SMS → "You're all set {name}! …", website → "Confirmed! Your quote visit…" — `calendarSyncFailed` appends a small-technical-issue note); `notifyOwnerOnBookingCreated`. Callers: `bookings/create` route, sms webhook.

### lib/crm-utils.ts (233L)
- `findExistingContact(businessId, phoneNumber?, email?)` — phone primary (normalized), email fallback.
- `findOrCreateContact(params)` — requires `source`; email-only contacts get a `__email_only__` placeholder phoneNumber; creates/updates Contact + logs Activity. Callers: /api/contact, contacts/import, messages/{send,campaign}, sms + voice webhooks.

### lib/dashboard-auth.ts (28L)
`requireDashboardBusiness(): Promise<{business} | NextResponse>` — `auth()` → 401; User lookup + `getBusinessForDashboard` → 404. Callers: 22 dashboard API routes + campaigns/upload-image.

### lib/db.ts (7L)
Prisma singleton; cached on `globalThis` outside production.

### lib/email-format.ts (23L)
`bodyContainsHtml(text)` (tag-regex); `plainTextToEmailHtml(text)` (escape + `white-space: pre-wrap` div). Callers: EmailComposeClient (preview), emails route (send), notify-owner (`sendEmail` fallback wrapper).

### lib/get-business-for-dashboard.ts (38L)
`getBusinessForDashboard(userId, userBusiness): Promise<{business, isAdminViewAs}>` — if `userId === ADMIN_USER_ID` and `adminViewAs` cookie set → that business, else userBusiness. Callers: dashboard layout + 14 pages, 6 API routes, dashboard-auth.

### lib/google-ads.ts (180L)
- `getGoogleAdsClient()` — singleton from `GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN`.
- `syncGoogleAdsData(businessId, startDate?, endDate?)` — GAQL campaign metrics (default last 30 days), `login_customer_id = GOOGLE_ADS_MCC_ID`, `refresh_token = GOOGLE_ADS_REFRESH_TOKEN`, cost_micros → USD, upsert on `(businessId, campaignId, date)`.
- `syncAllBusinessAds()` — all businesses with `googleAdsEnabled && googleAdsCustomerId`.
Callers: admin + dashboard google-ads/sync routes.

### lib/google-calendar.ts (628L, `import 'server-only'`)
Exports: `getOAuth2Client()`, `getAuthUrl(state)` (scope `https://www.googleapis.com/auth/calendar`, `access_type: offline`), `exchangeCodeForTokens(code, businessId)`, `getValidAccessToken(businessId): Promise<string | null>` (refreshes via refresh token; returns **null** on failure rather than throwing), `getCalendarClient(businessId)`, re-export `DEFAULT_BUSINESS_HOURS`, `parseBusinessHours(hours)`, `TimeSlot`, `getAvailableSlots(businessId, start, end)`, `getAvailableSlotsWithMeta` (adds `noMoreAvailabilityToday`), `getAvailableSlotsWithDebug`, `isSpecificSlotAvailable(businessId, dateStr, hour, minute, tz)`, `getTwoClosestSlotsOnDay(...)`, `getBusyTimes(...)`, `CalendarEventSource = 'website'|'sms'`, `createCalendarEvent(businessId, start, end, customerName, serviceType, customerPhone, options)`, `createMarketingCalendarEvent(...)`, `deleteCalendarEvent(businessId, eventId): Promise<boolean>`, `calendarEventExists(businessId, eventId)`. Slot computation applies business hours, slotDurationMinutes, bufferMinutes, filters past slots. Callers: 9 API routes + create-booking (see §2).

### lib/google-sheets-sync.ts (281L, `server-only`)
`syncUsageToGoogleSheets(date)` → `SheetsSyncResult`. Service-account JWT auth via `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (throws loudly if missing), target spreadsheet `GOOGLE_SHEET_ID` (throws). Pushes per-business usage rows. Sole caller: `admin/usage/sheets-sync` route.

### lib/import-contacts.ts (123L)
`parseContactFile(file): Promise<ParseResult>` — Excel/CSV via `xlsx`; auto-detects phone column (headers containing phone/mobile/cell/number/tel) and name column; normalizes phones; returns `{contacts, totalRows, invalidSkipped}`. Sole caller: admin `ToolsTab.tsx` via dynamic import. The dashboard import route does NOT use it (client-side parsing there).

### lib/industry-defaults.ts (123L)
`IndustryConfig`, `BUSINESS_TYPE_OPTIONS = ['Landscaping / Lawn Care', 'Car Detailing / Auto Detailing', …]`, `industryDefaults` map, `getIndustryDefaults(businessType)`. `getAllIndustries()` is a **DEAD export** (zero callers). Callers: onboarding page/form, SettingsFormWithIndustry, admin SettingsTab.

### lib/notify-owner.ts (714L)
All senders return/track `{smsSent, emailSent}`; SMS via Telnyx (`from telnyxPhoneNumber`, `to normalizeToE164(ownerPhone || forwardingNumber)`, gated by `notifyBySms`), email via the internal `sendEmail()` helper (:698) which uses **Resend** from `notifications@alignandacquire.com` (html param sent as-is, else `plainTextToEmailHtml(text)`), gated by `notifyByEmail && ownerEmail`. `baseUrl` (:33) = `NEXT_PUBLIC_APP_URL ?? https://${VERCEL_URL} ?? 'https://www.alignandacquire.com'` (www).
Exports: `notifyOwnerOnBookingCreated(business, appointment)` (:82), `notifyOwnerOnBookingRequestNoCalendar` (:188), `notifyOwnerOnLeadCaptured` (:276), `notifyOwnerOnHumanNeeded` (:381), `notifyOwnerOnAIFailed` (:459), **`notifyOwnerOnWebsiteLead` (:532, new)** — all emails include transcript/details + dashboard links.
`getTransporter()` (:664) still defines a nodemailer SMTP transport — **DEAD: defined, never called** (grep confirms only its definition). Callers of the module: /api/contact, sms webhook, create-booking.

### lib/owner-group.ts (34L, new/untracked)
`getOwnerGroupBusinesses(business)` — `ownerGroupId` null → `[business]` (no query); else `findMany({where:{ownerGroupId}})`, guaranteeing the calling business is included. Callers: website-leads route, google-ads route, google-ads/sync route.

### lib/phone-utils.ts (45L)
`normalizePhoneNumber(phone)` (digits; 11-digit leading-1 → 10), `normalizeToE164(phone?)` (→ `+1XXXXXXXXXX`, '' when invalid), `phonesMatch(a,b)` (normalized compare). Callers: 10 app files + 6 lib files.

### lib/sms-cooldown.ts (134L)
`isCooldownBypassNumber(callerPhone, bypassList)` (phonesMatch against JSON array); `getCooldownDays(business)` (business.smsCooldownDays → `SMS_COOLDOWN_DAYS` env (module-load parsed) → 7); `checkCooldown(businessId, phoneNumber, business?)` → `{allowed} | {allowed:false, lastMessageSent}`; `recordMessageSent(businessId, phoneNumber)` (ContactCooldown upsert); `logCooldownSkip(...)`. Callers: 4 webhooks + create-booking.

### lib/telnyx-usage-sync.ts (473L)
`syncTelnyxUsage(dateRange: string = 'last_90_days'): Promise<SyncResult>` — **signature changed from the old doc's `{start,end}` object to a Telnyx date_range preset string** (yesterday, last_7_days, last_30_days, last_90_days). Fetches MDRs + CDRs (fallback chain of record types), matches to businesses by phone digits, upserts `TelnyxUsageRecord` (idempotent on `telnyxRecordId`), backfills `Message.cost`. Sole caller: admin/usage/sync route (incl. cron).

### lib/usage-export.ts (310L)
`DateRangePreset = 'this_week'|'this_month'|'last_month'|'custom'`; `parseExportDateRange(preset, startDate?, endDate?)`; `getUsageForExport(range)` → `{dailyRows, businessSubtotals, grandTotal}`. Sole caller: admin/usage/export route.

### lib/utils.ts (48L)
`cn(...)` (clsx+tailwind-merge), `formatPhoneNumber(phone)` ("(555) 123-4567"), `formatRelativeTime(date)`, `slugify(text)` — **slugify is a DEAD export** (zero callers). Callers of the module: ~19 dashboard/UI files + both webhooks.

**Dead exports summary:** all of `lib/auth.ts`; `lib/utils.ts:slugify`; `lib/industry-defaults.ts:getAllIndustries`; `lib/notify-owner.ts:getTransporter` (internal, dead); plus `google-calendar.ts` exports with no external callers: `getAvailableSlotsWithDebug`, `getBusyTimes`, `getCalendarClient` (used only within the module).

---
## Section 9 — Frontend

### Dashboard shell & nav (`app/(dashboard)/layout.tsx` + `DashboardShellClient.tsx`)
Layout (server, noindex): Clerk `auth()` → redirect `/sign-in`; User lookup → redirect `/onboarding` if none; `getBusinessForDashboard` (admin view-as); `getBusinessFeatures(business)` builds nav items (icons passed as string names, resolved in the client shell):
1. Always: **Overview**, **Leads** (Mailbox)
2. `hasMissedCallAi` → **Conversations** (MessagesSquare)
3. Always: **Outreach** (Send), **Analytics** (BarChart3)
4. `hasMissedCallAi` → **Scheduled Quotes** (Calendar)
5. `!hasMissedCallAi` → **Voicemails** (Mail); else if `knownContactVoicemailEnabled` → **Voicemails from Contacts** (Mail)
6. `hasAnyScreening` → **Screened Calls** (`/dashboard/blocked-calls`, PhoneOff) — shown to ANY screening client, including AI clients (old doc said non-AI only)
7. Always: **Contacts**, **Jobs**
8. `googleAdsEnabled` → **{googleAdsTabLabel || 'Google Ads'}** (Megaphone)
9. Always: **Settings**
There is **no separate Website Leads nav item** anymore (merged into Leads). `DashboardShellClient` renders the sidebar (mobile hamburger slide-in), Clerk `UserButton`, and the admin view-as banner.

### FeatureGate (`app/components/FeatureGate.tsx`)
Server component. Props: discriminated union — shared `{enabled: boolean, children}`; `mode:'locked'` → `{feature, valueProp, businessName}` with CTA `mailto:jacob@alignandacquire.com?subject=Unlock {feature} for {businessName}`; `mode:'needs-setup'` → `{feature, setupDescription, setupLabel, setupHref}` with a link CTA. `enabled=true` renders children directly; otherwise children are blurred (`blur-sm opacity-40`) under an overlay card (Lock/Wrench icon).

### Dashboard pages (server wrappers → client components)

| Page | Gate / behavior |
|---|---|
| `dashboard/page.tsx` (Overview) | No gate. Builds `features` (+`googleAds`, `knownContactVoicemailEnabled`); server-fetches up to 5 recent voicemails when `!hasMissedCallAi` **or** `knownContactVoicemailEnabled` → `OverviewClient` |
| `OverviewClient.tsx` | Metric cards gated per feature (`show:` flags — blocked/passed need `hasAnyScreening`, lead cards need `hasMissedCallAi`); Total Calls sublabel from `totalCallsMode`; Google Ads summary when `features.googleAds`; upcoming appointments when `hasCalendar`; voicemail section label switches to "Voicemails from Contacts" for AI clients (:244); consumes the `app/components/ui` kit (sole consumer) |
| `conversations` | FeatureGate locked, `enabled = missedCallAiEnabled !== false`, feature "AI Conversations" → `ConversationsClient` (bucket tabs via `getConversationBucket`, mobile `mobileChatOpen` list/thread toggle, module-scope subcomponents) |
| `leads` | FeatureGate locked, `enabled = missedCallAiEnabled !== false`, feature "Leads" → `LeadsClient` → `CombinedLeadsList` — client-merges `/api/dashboard/conversations` + `/api/dashboard/website-leads`; **owner-group aware**: renders `businessName` chips when the website-leads response has `isGroup` |
| `outreach` | FeatureGate locked, `enabled = massMessagingEnabled`, feature "Mass Outreach" → `OutreachClient` (email/SMS channel tabs embedding `EmailsClient hideHeader` + `MessagesClient hideHeader`) |
| `appointments` | Page-level branching with `enabled={false}` gates: `!calendarEnabled` → locked "Scheduled Quotes"; `calendarEnabled && !googleCalendarConnected` → needs-setup with `setupHref=/api/auth/google?businessId=…`; else ungated `AppointmentsClient` (+`CancelBookingButton` → POST `/api/bookings/[id]/cancel`) |
| `ads` | FeatureGate locked, `enabled = googleAdsEnabled`, feature "Google Ads" → `AdsClient`: date-range picker, manual sync button (POST google-ads/sync), recharts dual-axis daily chart, campaign table; **owner-group aware**: "By Site" per-business summary strip + per-campaign `businessName` chips when `isGroup` |
| `analytics` | No gate (bare wrapper) → `AnalyticsClient` fetches `/api/dashboard/analytics?period=…`; cards gated by returned `features`/`totalCallsMode` |
| `blocked-calls` | FeatureGate locked, `enabled = features.hasAnyScreening`, feature "Call Screening" → `BlockedCallsClient` |
| `contacts`, `contacts/[id]`, `contacts/import` | No gates → `ContactsClient` / `ContactDetailClient` / `ImportContactsClient` (client-side papaparse+xlsx parsing, then POST JSON to contacts/import) |
| `jobs` | No gate → `JobsClient` (status filter tabs, create modal) |
| `emails` / `messages` / `website-leads` | Bare `redirect()` pages (→ /dashboard/outreach ×2, → /dashboard/leads?tab=website) |
| `emails/new` | → `EmailComposeClient` (subject/body editor, image upload → `/api/campaigns/upload-image`, recipient selection, preview via `plainTextToEmailHtml` parity, `?templateId=` pre-fill via GET emails/[id]) |
| `settings` | → `SettingsFormWithIndustry` + server actions; industry defaults pre-fill via `applyIndustryDefaultsToForm` |
| `voicemails` | Server page (features-aware) → `VoicemailsClient` (audio player, transcription, delete → DELETE voicemails/[id]) |
| `SpamOnlyDashboard.tsx`, `WebsiteLeadsClient.tsx` | **[DEAD]** — not rendered by any route (WebsiteLeadsClient was even updated for owner groups on this branch but remains unmounted) |

### Admin frontend (brief — detail in §12)
`/admin` (server, ADMIN check) → `AdminClient` (HeaderKPIs + AdminTools + ClientTable + ClientDetailPanel slide-out). `app/admin/[businessId]/conversations/page.tsx` is a client page that lets the admin browse any business's conversations with the same bucket UI (fetches `/api/admin/businesses/[id]/conversations`).

### Marketing & booking pages (brief)
- Server pages with `export const metadata` + self-canonical; client pages (`about`, `pricing`, `campaigns`, `missedcall-ai`, `book`, `book/[slug]`) get metadata-only segment layouts. Root layout: title template `%s | Align and Acquire`, `metadataBase = https://www.alignandacquire.com`, ProfessionalService JSON-LD, `MetaPixel` (renders only when `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` is set), `ConditionalNavBar` (hidden on /dashboard, /admin, and /embed paths).
- JSON-LD via `JsonLd` component: Service nodes on `/missedcall-ai` (layout, + FAQPage mirroring page copy), `/spam-screening`, `/websites`, `/ads-management` (shared `DESCRIPTION` consts).
- `/book` — marketing qualification wizard → `/api/marketing-bookings`; `/book/[businessSlug]` — tenant booking page (slots via available-slots API, `BookingCalendar`, POST bookings/create); `/book/[businessSlug]/embed` — iframe variant (noindex, light-mode, visible error boundary for mobile debugging).
- `sitemap.ts` (static marketing routes only), `robots.ts` (disallow dashboard/admin/api/onboarding/sign-in/sign-up), `opengraph-image.tsx` (Satori text-only 1200×630).
- Marketing demo components: `SmsThread` (animated fake SMS demo on /, /missedcall-ai, /services), `DemoForm` → `/api/book-demo`, `ContactForm` → `/api/contact`, `WebsiteQuoteForm` on /websites, `roi-calculator` on / and /missedcall-ai.

---

## Section 10 — Auth & Multi-tenancy

### middleware.ts (verbatim matchers)
```ts
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/onboarding(.*)', '/settings(.*)'])
const isPublicRoute    = createRouteMatcher(['/book/(.*)'])
const isPublicApiRoute = createRouteMatcher(['/api/webhooks/(.*)', '/api/contact'])
```
`clerkMiddleware`: public route or public API → pass through; protected → `auth.protect()`. All other routes (marketing pages, most `/api/*`) pass through middleware without forced auth — API routes enforce their own auth in handlers. Matcher config excludes `_next`, the `book` path segment, and static file extensions; explicitly includes `/(api|trpc)(.*)`. **`/api/contact` in the public list is new vs the old doc.**

### Request-level auth building blocks
- `requireDashboardBusiness()` (lib/dashboard-auth.ts): `auth()` → 401 JSON; `db.user.findUnique({clerkId})` + `getBusinessForDashboard()` → 404 JSON; success `{business}`. Used by 23 routes.
- `getBusinessForDashboard(userId, userBusiness)` (lib/get-business-for-dashboard.ts): if `userId === process.env.ADMIN_USER_ID` and cookie `adminViewAs` present → load that business (`isAdminViewAs: true`); else the user's own business.
- Several older routes (`appointments`, `bookings/*`, `dashboard/screened-calls`, `dashboard/voicemails`) do the Clerk + user + `getBusinessForDashboard` dance inline instead of `requireDashboardBusiness()` — same effect, duplicated code. `bookings/[id]` and `bookings/[id]/cancel` additionally allow the admin to act across businesses (`isAdmin` override).
- `lib/auth.ts` helpers exist but are dead (§8).

### Admin view-as
Set/cleared via GET `/api/admin/view-as` (§7): cookie `adminViewAs`, path `/`, `maxAge` **24 h** (no longer session-scoped), `sameSite: 'lax'`. Consumed only by `getBusinessForDashboard`. A stale cookie makes Jacob see client data for up to a day.

### Admin identification
No middleware-level admin check. Every `app/api/admin/**` handler and `app/admin/page.tsx` compares `userId === process.env.ADMIN_USER_ID` inline (403 or redirect). `auth/google`, `bookings/[id]`, `bookings/[id]/cancel` use the same comparison for cross-business admin override.

### Webhook tenant isolation
Voice: `findBusiness(to)` — exact `telnyxPhoneNumber` match with a digit-normalized fallback scan. SMS: `db.business.findFirst({where:{telnyxPhoneNumber: to}})` (exact only). One business per Telnyx number (`@unique`) keeps tenants isolated. Onboarding creates `Business` + `User` in one transaction (`tx.user.upsert`, app/onboarding/page.tsx:80).

### Data scoping & deletion
Every dashboard/admin query includes `businessId` in its `where` (contact/job/campaign lookups are `{id, businessId}` scoped → 404). The owner-group feature relaxes this deliberately for website-leads and google-ads reads/updates to `businessId IN group` (§7). All Business child relations cascade on delete; `Appointment.conversationId` uses `SetNull`; `PhoneNumber` has no FK at all.

---
## Section 11 — Integrations (verified from imports and call sites)

| Integration | Live? | Where / what |
|---|---|---|
| **Telnyx** (`telnyx` SDK) | Yes | Instantiated per call site with `TELNYX_API_KEY`. Methods actually used: `calls.actions.answer`, `.speak`, `.gatherUsingSpeak`, `.hangup`, `.reject`, `.bridge` (cast `as any`), `.startRecording` (cast `as any`), `calls.dial`, `messages.send`. Files: voice/voice-gather/voice-dial-status/sms webhooks, `lib/notify-owner.ts`, `lib/create-booking.ts`, `bookings/[id]/cancel`, `dashboard/messages/{send,campaign}`, `marketing-bookings`. `lib/telnyx-usage-sync.ts` calls the Detail Records + Usage Reports REST APIs directly via `fetch` (not the SDK). |
| **Anthropic** (`@anthropic-ai/sdk`) | Yes | Only `app/api/webhooks/sms/route.ts` (module-level client). Three call sites, all `claude-haiku-4-5-20251001`, max_tokens 256 (§6). |
| **Google Calendar** (`googleapis`) | Yes | Only via `lib/google-calendar.ts`: `google.auth.OAuth2` (per-business tokens stored on Business), `google.calendar({version:'v3'})` for freebusy/events CRUD. Consumers listed in §2/§8. |
| **Google Sheets** (`googleapis`) | Yes | `lib/google-sheets-sync.ts`: `google.sheets({version:'v4'})` with service-account auth (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`PRIVATE_KEY`), target `GOOGLE_SHEET_ID`. Sole caller: admin sheets-sync route. |
| **Google Ads** (`google-ads-api`) | Yes | Only `lib/google-ads.ts` (client singleton + `Customer()` GAQL query → GoogleAdsSnapshot upserts). |
| **Resend** | Yes — ALL email | Two styles: SDK `new Resend(...)` in `lib/notify-owner.ts` (sendEmail helper), `app/api/dashboard/emails/route.ts` (campaigns), `app/api/webhooks/voice/route.ts` (voicemail alert); raw `fetch('https://api.resend.com/emails')` in `/api/contact`, `/api/book-demo`, `/api/marketing-bookings`. From-addresses in code: `notifications@alignandacquire.com` (notify-owner, voice voicemail, campaigns via `${senderName} <notifications@…>`) and **`onboarding@resend.dev`** (contact, book-demo, marketing-bookings — Resend's sandbox sender). |
| **nodemailer** | **Dead** | Imported only by `lib/notify-owner.ts`; `getTransporter()` (:664) is defined and never called by anything. Every owner-notification path uses Resend. `@types/nodemailer` also removable. |
| **Vercel Blob** (`@vercel/blob`) | Yes | `put()` with `access:'public'` in voice webhook (voicemail mp3s) and campaigns/upload-image (campaign images). |
| **Clerk** (`@clerk/nextjs`) | Yes | `middleware.ts` (clerkMiddleware), `app/layout.tsx` (ClerkProvider), `auth()` in ~40 routes/pages, `SignIn`/`SignUp`/`UserButton` components. Users mirrored into the `User` table only at onboarding (`tx.user.upsert`). |
| **Stripe** | **No — schema-only** | No stripe package in package.json, no imports, no API calls. The only "stripe" matches in code are CSS "hazard stripe" comments. `stripeCustomerId`/`stripeSubscriptionId` are never read or written; `subscriptionStatus` is set manually via the admin panel and used only for admin MRR/status display. |

**Owner-notification transport matrix** (what actually sends each email):

| Path | SMS | Email transport | From |
|---|---|---|---|
| Booking created (`notifyOwnerOnBookingCreated`) | Telnyx | Resend SDK via `sendEmail()` | notifications@alignandacquire.com |
| Booking request, no calendar | Telnyx | Resend `sendEmail()` | notifications@… |
| Lead captured / Human needed / AI failed | Telnyx | Resend `sendEmail()` | notifications@… |
| Website lead (`notifyOwnerOnWebsiteLead`) | Telnyx | Resend `sendEmail()` (HTML template) | notifications@… |
| Voicemail alert (voice webhook) | Telnyx | Resend SDK inline | notifications@… |
| Marketing contact form (unattributed) | — | raw Resend fetch | onboarding@resend.dev |
| Demo request (`/api/book-demo`) | — | raw Resend fetch | onboarding@resend.dev |
| Marketing booking (owner + customer emails) | Telnyx (MARKETING_TELNYX_NUMBER) | raw Resend fetch | onboarding@resend.dev |
| Email campaigns | — | Resend SDK batches of 50 | `{senderName} <notifications@…>` |

---
## Section 12 — Admin Dashboard

**Access:** `app/admin/page.tsx` — `auth()`; `!userId || userId !== process.env.ADMIN_USER_ID` → `redirect`. `app/admin/layout.tsx` adds noindex. Every `/api/admin/**` route re-checks the same comparison (403).

### Components
- `AdminClient.tsx` — root client component: search/filter state, toast handling, renders HeaderKPIs → AdminTools → ClientTable → ClientDetailPanel (slide-out for the selected business).
- `HeaderKPIs.tsx` — MRR (sum of `monthlyFee` over active+trialing businesses), status counts (active/trialing/past_due/canceled), conversations this month vs last month with delta.
- `AdminTools.tsx` — global tools dropdown: **Refresh Table**, **Sync Telnyx Usage** (POST `/api/admin/usage/sync?dateRange=last_90_days`), **Sync Google Ads** (POST `/api/admin/google-ads/sync`), **Sync Google Sheets** (POST `/api/admin/usage/sheets-sync`), plus usage export links.
- `ClientTable.tsx` — desktop table (`hidden md:table`) with columns Name / Status / MRR / Features (icon strip via module-scope `FeatureIcons`) / Convos (this-month + all-time stacked) / Leads / Actions; mobile card list (`md:hidden`). Row click opens the detail panel; actions include view-as and per-business conversations page.
- `ClientDetailPanel.tsx` — slide-out `w-full sm:w-[520px] lg:w-[600px]`, three tabs.
- `components/CallScreenerCard.tsx` — **[DEAD]** scaffold, never imported.
- `[businessId]/conversations/page.tsx` — client page: admin conversation browser for any business using `getConversationBucket`/`BUCKET_LABELS`/`BUCKET_COLORS`; fetches `/api/admin/businesses/[id]/conversations`.

### `AdminBusiness` type (`app/admin/types.ts`)
All Business scalar fields used by the panel (identity, fees, all feature flags incl. `smsBookingEnabled`, `knownContactVoicemailEnabled`, `massMessagingEnabled`, notification prefs, AI config, booking-page fields, Google Ads fields, `smsCooldownDays`, `cooldownBypassNumbers`, **`ownerGroupId: string | null`**, `businessHours`, `servicesOffered`, timestamps) plus `_count { conversations, appointments, users, screenedCalls, blockedCalls30d }` and computed `conversationsThisMonth`, `conversationsLastMonth`, `leadsThisMonth`, `conversationsAllTime`, `leadsAllTime` (from the enriched businesses GET, §7).

### TogglesTab
`patch(field, value, label)` = optimistic local update → PATCH `/api/admin/businesses/{id}` → merge response (preserving `_count`/stats) or revert + toast. Toggles: `missedCallAiEnabled`, `knownContactVoicemailEnabled`, `callScreenerEnabled` (+ inline `callScreenerMessage` editor and `forwardingNumber` editor/clearer), `spamFilterEnabled`, `calendarEnabled` ("online booking"; Google Calendar connection shown read-only), `smsBookingEnabled` ("SMS auto-booking"), `googleAdsEnabled`, `notifyBySms`, `notifyByEmail`, `massMessagingEnabled` ("mass outreach").
⚠️ **`notifyBySms` / `notifyByEmail` are PATCHed by this tab but are NOT in the route's `allowedFields` whitelist — the server silently drops them** (§16).

### SettingsTab
Editable business settings: fees (setup/monthly), subscriptionStatus, telnyxPhoneNumber (E.164-normalized server-side), forwardingNumber, timezone, businessType (via `BUSINESS_TYPE_OPTIONS`), business hours (via `DEFAULT_BUSINESS_HOURS` scaffold), services, AI greeting/instructions/context, missedCallVoiceMessage, booking-page fields, slot/buffer, maxMessagesPerConversation, ownerEmail/ownerPhone, googleAds fields, smsCooldownDays, cooldownBypassNumbers, adminNotes. All two-column grids are `grid-cols-1 sm:grid-cols-2`.

### ToolsTab (per business)
Bulk contact import (client-side `parseContactFile` via dynamic import → POST `businesses/[id]/contacts/bulk`), screened-call stats viewer (GET `…/screened-calls?days=30`), blocked-numbers manager (GET/POST/DELETE `…/blocked-numbers`), voicemails viewer.

### Owner-group administration
`ownerGroupId` is visible on the type but **cannot be set from the admin UI or PATCH API** — grouping currently requires a direct DB update.

---
## Section 13 — Known Gotchas (each old gotcha verified against live code)

Old gotchas are numbered as in the previous CLAUDE.md; **KEEP** = still true (wording updated), **DROP** = no longer true, **[external]** = depends on portal/carrier config unverifiable from the repo.

1. **KEEP** — IVR commands are sent right after `answer()` inside the `call.initiated` handler without waiting for `call.answered` (voice/route.ts:135-154). Works because Telnyx queues commands; don't "fix" without testing.
2. **KEEP** — screener gather uses `maximum_tries: 1`, `timeout_millis: 8000`, `valid_digits: '0123456789'` (voice/route.ts:146-154).
3. **KEEP [external]** — Google Voice forwarding numbers won't accept Telnyx B-leg termination; the fallback chain handles it gracefully but owners never see the call.
4. **KEEP** — AMD intentionally disabled (comment voice/route.ts:28-33); short ring timeouts (25 s / 20 s) instead.
5. **KEEP** — forwarding-loop prevention via `phonesMatch(from, business.telnyxPhoneNumber)` (voice/route.ts:115).
6. **KEEP** — `client_state` is base64 JSON via `toB64()`; never store secrets in it.
7. **KEEP** — `HOLD_MESSAGE_PAYLOAD` is intentionally a long dot-padded string ("We are connecting you. . . . Please stay on the line. . . .", voice/route.ts:59-60). Don't shorten it.
8. **KEEP** — two distinct skip-SMS gates: `isExistingContact()` (`source IS NULL`, guard #1 in sendMissedCallSMS) vs `isClientVoicemailContact()` + `knownContactVoicemailEnabled` (upstream voicemail routing, keyed on `isClientContact`). Bulk-importing customers without a source blocks their SMS. Note: the schema comment on `Contact.isClientContact` claiming it's "NOT read during call routing" is stale.
9. **KEEP** — cooldown is per `(businessId, phoneNumber)` pair.
10. **KEEP** — deferred DB writes after SMS sends (`void db.message.create(...).then(recordMessageSent).catch(log)`) in `sendMissedCallSMS`, `sendSMSAndLog`, and voice-dial-status. Intentional: don't await.
11. **KEEP** — `TOLERANCE_MS = 60_000` slot verification tolerance (create-booking.ts:192).
12. **KEEP** — calendar sync failure is non-fatal: `calendarSyncFailed=true`, appointment still created, confirmation notes the issue.
13. **KEEP (updated)** — `skipSlotVerification` and `allowWithoutCalendar` are separate flags; NEW: a DB-level time-overlap check now runs **regardless** of `skipSlotVerification` (create-booking.ts:161).
14. **KEEP** — confirmation SMS wording differs by source: SMS bookings "You're all set {name}!…", website "Confirmed! Your quote visit…" (create-booking.ts:277-278).
15. **KEEP** — every `put()` passes `access: 'public'` (voicemails + campaign images). Blobs can't be made public later.
16. **KEEP (updated)** — admin view-as is now a **GET** (`/api/admin/view-as?businessId=…` / `?exit=1`) and the cookie persists **24 hours** (`maxAge: 86400`, sameSite lax) — no longer session-scoped. Stale-cookie confusion window is a full day.
17. **KEEP** — no Telnyx webhook signature verification anywhere; `TELNYX_PUBLIC_KEY` is not even read. Both webhooks accept any POST.
18. **KEEP (updated)** — message limit skipped while `bookingFlowState.step` is set. NEW WRINKLE: the code fallback constant is `DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 25` (sms/route.ts:91) while the schema default is 23 — the schema default wins because the column is non-null.
19. **KEEP (updated)** — `appointment_booked`/`lead_captured` threads get one context-aware reply (appointment-logistics answer or pleasantry ack) and are then flipped to `closed`; other closed statuses store the inbound silently.
20. **KEEP** — connected-call SMS suppression requires `callConnected && durationSeconds > 5`.
21. **KEEP** — both AI prompts anchor `conversation.callerPhone` in a CRITICAL block (sms/route.ts:2200, :2332) and label `forwardingNumber` as "Owner's business line… never as their callback number". Confirmed production bug class; do not remove.
22. **KEEP** — STOP/UNSUBSCRIBE/CANCEL/QUIT exact-match check is first in the pipeline; legally required. Note it's an *acknowledgment only* — no app-side suppression record is written (see New #7).
23–25. **DROP** — all SMTP/nodemailer gotchas are obsolete: `getTransporter()` is dead code and no email path uses SMTP. Replacement gotcha: every Resend send is guarded/try-caught, so a missing `RESEND_API_KEY` (or Resend outage) silently drops email — nothing surfaces to the user.
26. **KEEP** — `X-Frame-Options: ALLOWALL` + `frame-ancestors *` on ALL routes (next.config.js) — required by the /book embed; a security trade-off.
27. **KEEP** — Server Actions body limit 2 MB; campaign uploads use a route handler + Blob so they're unaffected.
28. **KEEP** — sub-components at module scope (ConvoCard/ThreadBody/EmptyState at ConversationsClient.tsx:62/112/156; FeatureIcons in ClientTable) — defining them inside the parent would remount subtrees every render.
29. **KEEP** — the `mobileChatOpen` list/detail pattern (ConversationsClient.tsx:173) and scrollable tab bars are the established mobile conventions.
30. **KEEP [external]** — all externally configured webhook/callback URLs must use `https://www.alignandacquire.com` (www): the apex 308s at Vercel's edge and webhook senders don't follow redirects (July 2026 outage). Code-side halves verified: notify-owner's hard-coded fallback and all in-code dashboard links use www; no bare-apex URL exists in app/ or lib/.
31. **KEEP [external]** — "calls ring forever + empty Vercel logs" = failure upstream of the function (edge 308/DNS/protection). Check Telnyx Debugging tab first.
32. **KEEP [external, updated]** — client sites POST cross-origin to `/api/contact`; it is now middleware-exempt with `Access-Control-Allow-Origin: *` and an OPTIONS handler, but client configs must still use the www URL (CORS preflight against the 308 fails silently).
33. **KEEP (updated)** — still no dead-man's-switch/health alerting. The only scheduled job is the daily Telnyx usage-sync cron (vercel.json → `/api/admin/usage/sync`, guarded by `CRON_SECRET`), which is billing telemetry, not lead-flow monitoring.

### New gotchas found in this pass

N1. **`manualMode` no longer suppresses AI.** The SMS webhook never reads `Conversation.manualMode`; it's only *written* by manual-send/campaign routes. An owner manually texting a customer does NOT stop the AI from replying to the customer's next inbound.
N2. **Admin toggles for `notifyBySms`/`notifyByEmail` are silently dropped** — TogglesTab PATCHes them (TogglesTab.tsx:325,334) but they're missing from `allowedFields` (admin businesses/[id]/route.ts), so the server never persists them.
N3. **`/api/book-demo` interpolates user input into email HTML without escaping** (route.ts:22-29) — HTML/content injection into the notification email (contrast `/api/contact`, which escapes).
N4. **The voice webhook swallows all errors and returns 200** (voice/route.ts:814-817) — Telnyx never retries; a mid-handler crash means a silently dead call. The SMS webhook conversely returns 500 → Telnyx retries → the 30 s duplicate guard is what prevents double-replies.
N5. **`call.recording.saved` sleeps 8 s** waiting for transcription (voice/route.ts:707) — burns serverless duration on every voicemail and races the transcription event.
N6. **B-leg caller announcement loads every Contact for the business** and scans in JS (voice/route.ts:199-203) — O(contacts) DB pull per forwarded call.
N7. **STOP produces no persistent opt-out record** — the ack is sent, nothing is stored; only cooldown/blocked-list/contact gates prevent later automated SMS to that number.
N8. **Marketing email senders use `onboarding@resend.dev`** (contact/book-demo/marketing-bookings) — Resend's sandbox sender; deliverability depends on Resend's shared domain, unlike the verified `notifications@alignandacquire.com` used everywhere else.
N9. **`/api/bookings/available-slots` returns 200 with an `error` key** when booking is off/not connected — clients must check `error`, not the status code.
N10. **`voicemails/[id]` DELETE only clears DB fields** — the mp3 stays in Vercel Blob forever.
N11. **website-leads PATCH is not gated on `missedCallAiEnabled`** while its GET is — a locked-out client could still flip lead statuses by direct API call.
N12. **If `CRON_SECRET` is unset (or rotated wrong), the daily usage cron 403s silently** — usage data quietly stops accruing until someone runs a manual sync.
N13. **Both AI prompts reference `(business as any).website`** — no such schema field; the line never renders. Harmless today, but a trap if someone "fixes" the cast.
N14. **`BUCKET_LABELS` are now literal Cold/Active/Stalled/Closed** — the old client-facing labels ("No Reply", "In Progress", "Went Quiet") are gone; UI copy and docs referencing them are stale.

---
## Section 14 — Drift Report (old CLAUDE.md vs live code)

### Added since the old doc
| Category | Item |
|---|---|
| Schema | `Business.ownerGroupId` (+ `@@index`) — uncommitted, this branch |
| lib | `lib/owner-group.ts` (new, untracked), `lib/google-sheets-sync.ts`, `lib/industry-defaults.ts` — the latter two exist in code but were absent from the old doc's lib list |
| Routes | `POST /api/admin/google-calendar-backfill`; `PATCH /api/dashboard/website-leads`; `OPTIONS /api/contact`; `GET /api/admin/usage/sync` (cron); `POST/DELETE` handlers on `admin/businesses/[id]/contacts` and `blocked-numbers` |
| Pages/components | `/dashboard/jobs` (page + JobsClient), `/privacy`, `/terms`, `app/admin/[businessId]/conversations` (admin conversation browser), `app/components/ui/*` kit, `SmsThread`, `MetaPixel`, `SpamOnlyDashboard` (dead), `app/config/nav-services.ts` (dead), `BlockedCallsClient` |
| Infra | `vercel.json` daily cron `0 6 * * *` → `/api/admin/usage/sync`; middleware now exempts `/api/contact` |
| Notifications | `notifyOwnerOnWebsiteLead()` export; voicemail alerts also fire for known-contact voicemails (`voicemailReason:'client_contact'`) |
| Env vars | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` — all live; none documented in the old doc |

### Removed / no longer true
| Old-doc claim | Reality |
|---|---|
| `app/components/ServicesDropdown.tsx` | **File does not exist**; `nav-services.ts` (its config) survives but has zero importers |
| Messages/Emails as standalone dashboard pages | Redirect stubs to `/dashboard/outreach` (old doc already noted this; still true) |
| "Website Leads" nav item / standalone page | Gone — merged into `/dashboard/leads`; page is a redirect; `WebsiteLeadsClient.tsx` is unmounted dead code |
| `manualMode`: "inbound SMS saves to DB but AI does NOT respond" | **False in live code** — the SMS webhook never reads `manualMode` (§6, §13-N1) |
| `BUCKET_LABELS`: cold→'No Reply', active→'In Progress', stalled→'Went Quiet' | Labels are now literal `Cold/Active/Stalled/Closed` |
| `/api/contact`: "creates Contact + WebsiteLead in background fire-and-forget" | Writes are now **awaited** (Vercel freeze-safe) and it also notifies the owner |
| `syncTelnyxUsage(dateRange?: {start,end})` | Signature is `syncTelnyxUsage(dateRange: string = 'last_90_days')` — Telnyx preset strings |
| view-as: "POST /api/admin/view-as", "session-scoped cookie" | **GET** with redirects; cookie `maxAge` 24 h |
| `/api/bookings/[id]` GET; `delete-past` DELETE; `jobs/[id]` PATCH/DELETE; `marketing-bookings` POST-only | Live: `[id]` is DELETE-only; `delete-past` is POST; `jobs/[id]` is PATCH-only; `marketing-bookings` has GET+POST |
| `CRON_SECRET` "not currently enforced in code" | Now enforced as `Bearer` token on usage/sync (cron bypasses Clerk auth with it) |
| `TELNYX_PHONE_NUMBER` fallback send number | Never read anywhere |
| Analytics period "today/week/month/all" | Live: `today/week/month/year/all` |
| "Blocked Calls nav only for non-AI screening clients" | Live: "Screened Calls" item shows for ANY `hasAnyScreening` client |
| Old doc §13 SMTP gotchas (23-25) | Obsolete — nodemailer fully dead |
| Old default-greeting claim (single default) | Voice webhook default: "Sorry we missed your call at {name}. How can we help?"; **voice-dial-status uses a different default**: "Hi! Sorry we missed your call at {name}. I'm an automated assistant - how can I help you today?" |

### Explicit lettered checks
- **a. notify-owner.ts transport:** Resend for every email (`sendEmail()` → `resend.emails.send`, from `notifications@alignandacquire.com`, lib/notify-owner.ts:698-714). nodemailer `getTransporter()` (:664) is defined but has **zero callers** — dead, along with `SMTP_*` env vars and `@types/nodemailer`.
- **b. smsBookingEnabled:** exists (`prisma/schema.prisma:50`, default true). Consumers: `app/api/webhooks/sms/route.ts` (routing gate :376, booking-flow gate :1084, AI-mode param :396), `app/admin/ClientDetailPanel/TogglesTab.tsx:273` ("SMS auto-booking" toggle), admin PATCH `allowedFields`, `app/admin/types.ts`.
- **c. ownerGroupId:** exists (`prisma/schema.prisma:27` + `@@index` :111). Consumed by `lib/owner-group.ts:getOwnerGroupBusinesses`, which is called by exactly three routes: `dashboard/website-leads` (GET :19 / PATCH :63), `dashboard/google-ads` (:37), `dashboard/google-ads/sync` (:21). Frontends `AdsClient`/`CombinedLeadsList`/`WebsiteLeadsClient` render `businessName`/`isGroup`/`perSite` group fields. Listed in `AdminBusiness` but **not settable** via admin PATCH (not in allowedFields) — DB-only. Feature is mid-flight on this branch: files were still being edited while this doc was generated.
- **d. bare-apex URLs:** none. `lib/notify-owner.ts:33-34` chain is `NEXT_PUBLIC_APP_URL ?? https://${VERCEL_URL} ?? 'https://www.alignandacquire.com'` (www — fixed in commit d4aa9bf). All other literal URLs in app/ and lib/ (voice webhook voicemail links :735/:765, sitemap, schema JSON-LD) use `https://www.alignandacquire.com`. The only non-www occurrences are email addresses (`jacob@…`, `notifications@…`) and a decorative mock URL string on /services.
- **e. /api/contact validation:** `name && smsConsent` required (400) — nothing else. No rate limiting, no captcha, no length caps, no phone/email format validation, no spam screening. `escapeHtml()` applied to all user input in the marketing email. CORS fully open (`*`). Middleware-exempt.
- **f. Telnyx signature verification:** **absent**. No ed25519/signature code; `TELNYX_PUBLIC_KEY` is read nowhere. Both webhooks accept unauthenticated POSTs.
- **g. Monitoring/health checks:** the only scheduled/monitoring-adjacent code is the `vercel.json` cron hitting `/api/admin/usage/sync` daily (billing sync, `CRON_SECRET`-gated). No health endpoint, no dead-man's switch, no alerting on webhook/lead-flow silence.
- **h. Anthropic model:** `claude-haiku-4-5-20251001` — the only model string in the repo (sms/route.ts:1033, :2286, :2439).
- **i. Stripe:** no SDK installed, zero imports, zero API calls. `stripeCustomerId`/`stripeSubscriptionId` are never read or written by any code path; `subscriptionStatus` is manually managed via admin PATCH and only drives admin-UI display/MRR math. Billing is entirely out-of-band.

---
## Section 15 — External Config Dependencies (unverifiable from repo)

Everything the code depends on that lives outside git. "Correct" is defined by what the code expects.

### Telnyx portal
- **Call Control app voice webhook URL** → must be `https://www.alignandacquire.com/api/webhooks/voice` (**www** — apex 308s and Telnyx drops the POST). One shared Call Control app serves every client number; a wrong URL is a platform-wide outage.
- **Messaging Profile inbound webhook URL** → `https://www.alignandacquire.com/api/webhooks/sms` (www). Delivery-status events (`message.finalized`) arrive here too.
- **Legacy XML-mode URLs** (only if still configured anywhere): `…/api/webhooks/voice-gather?businessId=…&callSid=…`, `…/api/webhooks/voice-dial-status?callSid=…&businessId=…&callerPhone=…`, `…/api/webhooks/voice-after-dial?businessId=…` — the query-param contracts are read by those routes; nothing in the repo generates these URLs.
- **`TELNYX_CONNECTION_ID`** must be a valid Call Control connection ID — required for B-leg forwarding dials whenever the inbound payload lacks `connection_id`.
- **10DLC registration** for every client number (carrier requirement; not represented in code).
- **Number assignment**: each Business row's `telnyxPhoneNumber` must match a Telnyx number routed to the shared Call Control app + messaging profile (the `PhoneNumber` pool model is unused — assignment is manual).

### Vercel
- **Primary domain must be `www.alignandacquire.com`** with apex redirecting — but never hand the apex URL to any webhook sender.
- **Cron**: `vercel.json` schedules `0 6 * * *` → `/api/admin/usage/sync`. Vercel sends `Authorization: Bearer $CRON_SECRET` only when `CRON_SECRET` is set in the project env — if unset/mismatched the cron silently 403s.
- **Env vars** (full list + failure modes in §3): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_MCC_ID`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_USER_ID`, `CRON_SECRET`, `SMS_COOLDOWN_DAYS` (optional), `NEXT_PUBLIC_APP_URL`, `MARKETING_BUSINESS_ID`/`MARKETING_BUSINESS_SLUG`, `YOUR_EMAIL`, `OWNER_PHONE`, `MARKETING_TELNYX_NUMBER`, `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` (optional). Deletable: `SMTP_*`, `TELNYX_PUBLIC_KEY`, `TELNYX_PHONE_NUMBER`.
- **Vercel Blob** store attached; `BLOB_READ_WRITE_TOKEN` valid (voicemails break silently without it — recordings fall back to raw Telnyx URLs which may expire).

### Google Cloud (Calendar OAuth)
- OAuth client whose **authorized redirect URI equals `GOOGLE_REDIRECT_URI` exactly** (`lib/google-calendar.ts:15` passes it verbatim to `google.auth.OAuth2`). Scope requested: `https://www.googleapis.com/auth/calendar`; offline access (refresh tokens) required.
- Per-business connections are made by clients via `/api/auth/google?businessId=…` — tokens live in the Business row.

### Google service account (Sheets usage sync)
- Service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + private key) with scope `https://www.googleapis.com/auth/spreadsheets`; the target sheet (`GOOGLE_SHEET_ID`) must be **shared with the service-account email** (code comment, lib/google-sheets-sync.ts:5).

### Google Ads API
- Developer token approved for production; OAuth client + pre-authorized `GOOGLE_ADS_REFRESH_TOKEN`; `GOOGLE_ADS_MCC_ID` manager account with each client's `googleAdsCustomerId` linked as a child (used as `login_customer_id`).

### Clerk
- App configured with the publishable/secret keys; sign-in/up routes at `/sign-in`, `/sign-up`. `ADMIN_USER_ID` must be Jacob's Clerk user ID. Note: User rows are only created during onboarding — a Clerk user who never completes onboarding bounces to `/onboarding` forever (no webhook sync).

### Resend
- Verified sending domain for `alignandacquire.com` (all `notifications@alignandacquire.com` sends). The marketing endpoints (`/api/contact` unattributed, `/api/book-demo`, `/api/marketing-bookings`) send from **`onboarding@resend.dev`** — Resend's sandbox address; if Resend restricts sandbox sending, those notification emails stop.

### Meta
- Pixel ID in `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` (build-time inline); absent → MetaPixel renders nothing.

### Client tenant sites (separate repos)
- Each client site's contact form must POST to `https://www.alignandacquire.com/api/contact` (www) with `businessId` or `businessSlug` for CRM attribution.

---
## Section 16 — Suspected Issues Found (report only, nothing fixed)

Most severe first. One line each; file:line refer to the live working tree.

1. **Unauthenticated webhooks accept any POST** — no Telnyx signature verification; an attacker who learns the URL can trigger SMS sends/conversation writes (app/api/webhooks/voice/route.ts, sms/route.ts; `TELNYX_PUBLIC_KEY` unread).
2. **Admin toggle data loss** — `notifyBySms`/`notifyByEmail` PATCHed by TogglesTab.tsx:325,334 are absent from `allowedFields` (app/api/admin/businesses/[id]/route.ts:22-59): silently dropped, UI appears to save.
3. **`manualMode` dead flag** — written by messages/send:59,101 and messages/campaign:139,158, read by nothing; the documented "AI off for this thread" behavior does not exist (app/api/webhooks/sms/route.ts).
4. **Email HTML injection** — app/api/book-demo/route.ts:22-29 interpolates unescaped user input into email HTML sent to `YOUR_EMAIL`.
5. **`/api/contact` is wide open** — CORS `*`, middleware-exempt, no rate limit/captcha (app/api/contact/route.ts:8-13): spam floods write Contacts/WebsiteLeads and trigger owner SMS/emails at cost.
6. **website-leads PATCH missing feature gate** — GET checks `missedCallAiEnabled`, PATCH does not (app/api/dashboard/website-leads/route.ts:43-78).
7. **Voice webhook top-level catch returns 200 on error** (voice/route.ts:814-817) — failed handling is invisible to Telnyx (no retry); combined with #1 the only error signal is Vercel logs.
8. **STOP not persisted** — sms/route.ts:177-182 acks opt-out but stores nothing; future automated sends rely only on cooldown/blocklist (TCPA exposure if Telnyx-level opt-out isn't enabled).
9. **8-second sleep inside `call.recording.saved`** (voice/route.ts:707) — races the transcription webhook and burns function duration per voicemail.
10. **O(n) contact scan per forwarded call** — B-leg announcement loads all contacts then `phonesMatch` in JS (voice/route.ts:199-203); same pattern in `findBusiness` fallback (:835-840) which scans every business.
11. **Message-limit constant mismatch** — code fallback 25 (sms/route.ts:91) vs schema default 23; fallback is unreachable today but will surprise if the column ever becomes nullable.
12. **Two competing SMS triggers if both webhooks configured** — voice-dial-status route dedupes on other-conversations-within-24h + cooldown, but the cooldown record is written *deferred*, so a near-simultaneous main-webhook send can double-text (app/api/webhooks/voice-dial-status/route.ts:202-251 vs voice/route.ts:1099-1110).
13. **Different default greeting in dial-status route** mentions "I'm an automated assistant" (voice-dial-status:255-256) while the main webhook's default doesn't (voice:1066) — inconsistent client voice if the legacy route is live.
14. **`getValidAccessToken` returns null instead of throwing** (lib/google-calendar.ts:55) — downstream calendar calls fail with generic errors far from the cause.
15. **Blob orphaning** — voicemail delete clears only DB fields (dashboard/voicemails/[id]/route.ts:35); campaign `draft/` images are never reclaimed (campaigns/upload-image prefix).
16. **Recording fallback stores Telnyx URL** on Blob failure (voice/route.ts:679-683) — Telnyx recording URLs are not guaranteed permanent; playback can silently die later.
17. **Empty catch blocks around call-control cleanup** (voice/route.ts:98, 315, 646, 908, 927) — acceptable for hangup races but also hide real API errors.
18. **Marketing senders on `onboarding@resend.dev`** (contact:55, book-demo:19, marketing-bookings:447,494) — sandbox sender; deliverability/permission can break without code changes.
19. **Dead code inventory** — `lib/auth.ts` (whole file), `WebsiteLeadsClient.tsx` (updated on this branch yet unmounted), `SpamOnlyDashboard.tsx`, `CallScreenerCard.tsx`, `EmbedCodeSection.tsx`, `ScrollToBookDemoLink.tsx`, `app/config/nav-services.ts`, `voice-gather` route (unreferenced), `getTransporter()`, `slugify`, `getAllIndustries`, 9 `@radix-ui/*` + `class-variance-authority` packages, `PhoneNumber` model, `Appointment.reminderSentAt`, `User.role`, `Business.stripeCustomerId/stripeSubscriptionId`.
20. **Stale schema comment** — `Contact.isClientContact` says "NOT read during call routing" (prisma/schema.prisma:156) but the voice webhook routes on it via `isClientVoicemailContact`.
21. **Prompt references nonexistent field** — `(business as any).website` in both system prompts (sms/route.ts:2251, :2401).
22. **`AI_MODEL` uses a Haiku 4.5 pin from 2025** (`claude-haiku-4-5-20251001`) — fine, but it's duplicated in three places with no shared constant, so a model bump can drift between call sites (sms/route.ts:1033, 2286, 2439).
23. **`ownerGroupId` unsettable** — feature ships with no admin/API write path (not in PATCH allowedFields); requires manual DB writes, which won't be audited.
24. **No eslint config** — `eslint` + `eslint-config-next` installed but `npm run lint` is unconfigured; nothing lints this codebase.
25. **Repo hygiene** — production data export `conversations-export-2026-05-16.jsonl` committed at repo root; `docs/CODEBASE-AUDIT.md`/`docs/system-layout.md` are additional stale doc surfaces that can drift like CLAUDE.md did.

---

*Generated 2026-07-09 from the live working tree (branch `feature/owner-group-aggregation`, with uncommitted owner-group work in flight). Verified counts: 20 Prisma models (§4), 56 API route files (§7), 23 lib modules (§8).*
