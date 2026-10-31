# CLAUDE.md — MissedCall AI: Complete Codebase Reference

This document is the single source of truth for understanding, debugging, and modifying this codebase. Read before touching anything.

**"Run the protected-path check"** means `scripts/protected-path-check.sh <branch>`: it diffs the branch against origin/main over the lead, booking and notification paths (webhooks, contact, bookings, their libraries, middleware, next.config, prisma) and exits non-zero on any hit. Run it before merging anything to main.

---

## Table of Contents

1. [Stack & Dependencies](#1-stack--dependencies)
2. [Directory Structure](#2-directory-structure)
3. [Environment Variables](#3-environment-variables)
4. [Prisma Schema — Every Model, Every Field](#4-prisma-schema--every-model-every-field)
5. [Call Flow Architecture](#5-call-flow-architecture)
6. [SMS Conversation System](#6-sms-conversation-system)
7. [API Routes](#7-api-routes)
8. [Library Functions & Utilities](#8-library-functions--utilities)
9. [Frontend Pages & Components](#9-frontend-pages--components)
10. [Multi-Tenant Architecture](#10-multi-tenant-architecture)
11. [Middleware & Auth](#11-middleware--auth)
12. [Integrations](#12-integrations)
13. [Known Gotchas](#13-known-gotchas)
14. [Google Ads Integration](#14-google-ads-integration)
15. [Admin Dashboard](#15-admin-dashboard)
16. [SEO Architecture](#16-seo-architecture)
17. [Contact Form Spam Scoring](#17-contact-form-spam-scoring)

---

## 1. Stack & Dependencies

- **Framework:** Next.js 14.2.21 (App Router), React 18.3.1, TypeScript strict mode
- **Database:** Neon PostgreSQL via Prisma ORM
  - `DATABASE_URL` = pooled connection (runtime)
  - `DIRECT_URL` = direct (non-pooled) connection (used by `prisma db push`)
  - **No `prisma/migrations/` directory.** Schema is synced with `npm run db:push` (`prisma db push`) — do NOT run `prisma migrate`. Recent additive column changes are also kept as raw SQL in `scripts/sql/` (e.g. `2026-06-02_add_isClientContact.sql`, `2026-06-02_add_knownContactVoicemailEnabled.sql`).
- **Authentication:** Clerk (`@clerk/nextjs`)
- **Telephony & SMS:** Telnyx (`telnyx` v5.37.1) — Call Control API + Messaging API
- **AI:** Anthropic Claude (`@anthropic-ai/sdk` v0.52.0)
- **Calendar:** Google Calendar API (`googleapis`) — OAuth2, service account not used; per-business OAuth tokens stored in DB
- **Email:** Resend (`resend`) for ALL transactional email — owner notifications, voicemail alerts, and outreach campaigns (all send from `notifications@alignandacquire.com`). nodemailer/SMTP is still imported in `lib/notify-owner.ts` but its `getTransporter()` is dead code (never called).
- **File Storage:** Vercel Blob (`@vercel/blob`) — voicemail recordings + email campaign images
- **UI:** Tailwind CSS, Radix UI (`@radix-ui/*`), clsx + tailwind-merge
- **Date handling:** `date-fns` + `@date-fns/tz` (TZDate) — all business-local timezone conversions use TZDate, never UTC math
- **File parsing:** `xlsx` + `papaparse` — bulk contact imports
- **Path aliases:** `@/*` maps to project root

---

## 2. Directory Structure

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout: ClerkProvider, ConditionalNavBar, dark bg, sitewide metadata + ProfessionalService JSON-LD
│   ├── page.tsx                  # Marketing homepage (absolute brand-first title)
│   ├── sitemap.ts                # Static public marketing routes only (see §16)
│   ├── robots.ts                 # Crawler rules + sitemap reference (see §16)
│   ├── opengraph-image.tsx       # Generated 1200x630 og:image, text-only Satori (see §16)
│   ├── pricing/                  # Pricing page ('use client' — metadata lives in layout.tsx)
│   │   ├── layout.tsx            # Metadata only
│   │   └── page.tsx
│   ├── missedcall-ai/            # MissedCall AI landing page ('use client')
│   │   ├── layout.tsx            # Metadata + Service + FAQPage JSON-LD (FAQ must mirror page copy — see §16)
│   │   └── page.tsx              # Hero, stats, ROI calc, how-it-works, features, FAQ, demo form
│   ├── services/page.tsx         # All-services overview (7 numbered services)
│   ├── websites/page.tsx         # Website design portfolio/service page (+ Service JSON-LD)
│   ├── ads-management/page.tsx   # Google Ads management service page (+ Service JSON-LD)
│   ├── spam-screening/page.tsx   # Spam screening feature page (+ Service JSON-LD)
│   ├── campaigns/                # Email/SMS campaigns feature page ('use client')
│   │   ├── layout.tsx            # Metadata only
│   │   └── page.tsx
│   ├── about/                    # About page ('use client')
│   │   ├── layout.tsx            # Metadata only
│   │   └── page.tsx
│   ├── demo-requested/page.tsx   # Post-demo-form thank-you page (noindex)
│   │
│   ├── (auth)/                   # Clerk auth pages (no nav)
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── onboarding/               # Post-signup business setup
│   │   └── page.tsx              # OnboardingForm.tsx client component
│   │
│   ├── book/                     # Public booking pages (no auth, iframe-embeddable)
│   │   ├── layout.tsx            # Metadata for the /book wizard (title "Book a Free Demo")
│   │   ├── page.tsx              # Marketing qualification + discovery-call wizard ('use client')
│   │   └── [businessSlug]/
│   │       ├── layout.tsx        # generateMetadata: "Book a Quote with {business.name}" + canonical
│   │       ├── page.tsx          # Full tenant booking page ('use client')
│   │       └── embed/
│   │           ├── layout.tsx    # noindex + light-mode wrapper
│   │           └── page.tsx      # Stripped-down iframe version
│   │
│   ├── (dashboard)/              # Authenticated dashboard (Clerk-protected)
│   │   ├── layout.tsx            # Sidebar + DashboardShellClient
│   │   └── dashboard/
│   │       ├── page.tsx          # Dashboard home / overview
│   │       ├── conversations/    # AI SMS conversation viewer (NEW)
│   │       │   ├── page.tsx      # FeatureGate(missedCallAiEnabled) → ConversationsClient
│   │       │   └── ConversationsClient.tsx  # Dark theme, 5 bucket tabs; mobile=mobileChatOpen list/thread toggle; desktop=split-pane
│   │       ├── outreach/         # Email + SMS campaign hub (NEW)
│   │       │   ├── page.tsx      # FeatureGate(massMessagingEnabled) → OutreachClient
│   │       │   └── OutreachClient.tsx       # Email/SMS channel switcher
│   │       ├── messages/         # Legacy SMS threads (redirects → /dashboard/outreach)
│   │       │   ├── page.tsx      # redirect('/dashboard/outreach')
│   │       │   └── MessagesClient.tsx  # hideHeader prop for embedding in OutreachClient
│   │       ├── appointments/     # Booked quote visits
│   │       │   └── page.tsx      # Dual FeatureGate: locked(!calendarEnabled) / needs-setup(!connected)
│   │       ├── contacts/         # CRM contact list
│   │       │   ├── page.tsx      # ContactsClient.tsx
│   │       │   ├── [id]/page.tsx # ContactDetailClient.tsx
│   │       │   └── import/page.tsx # ImportContactsClient.tsx
│   │       ├── voicemails/       # Voicemail recordings
│   │       │   └── page.tsx      # VoicemailsClient.tsx
│   │       ├── blocked-calls/    # Spam-screened call list
│   │       │   └── page.tsx
│   │       ├── leads/            # Unified Leads (missed-call + website) — NEW
│   │       │   ├── page.tsx      # Ungated (no FeatureGate) → LeadsClient
│   │       │   ├── LeadsClient.tsx
│   │       │   └── CombinedLeadsList.tsx  # merges /conversations + /website-leads client-side
│   │       ├── website-leads/    # Legacy → redirect('/dashboard/leads?tab=website')
│   │       │   └── page.tsx      # redirect only (WebsiteLeadsClient.tsx component still exists, unused by route)
│   │       ├── ads/              # Google Ads dashboard
│   │       │   └── page.tsx      # FeatureGate(googleAdsEnabled) → AdsClient.tsx
│   │       ├── analytics/        # Usage + cost analytics
│   │       │   └── page.tsx      # AnalyticsClient.tsx
│   │       ├── emails/           # Legacy email campaigns (redirects → /dashboard/outreach)
│   │       │   ├── page.tsx      # redirect('/dashboard/outreach')
│   │       │   ├── EmailsClient.tsx  # hideHeader prop for embedding in OutreachClient
│   │       │   └── new/page.tsx  # EmailComposeClient.tsx
│   │       └── settings/         # Business configuration
│   │           └── page.tsx      # SettingsFormWithIndustry.tsx
│   │
│   ├── api/                      # API routes (all route.ts)
│   │   ├── webhooks/
│   │   │   ├── voice/            # Main Telnyx Call Control webhook
│   │   │   ├── voice-gather/     # Legacy split-out gather handler
│   │   │   ├── voice-after-dial/ # Post-dial XML response (no DB write)
│   │   │   ├── voice-dial-status/# Dial outcome callback → SMS trigger
│   │   │   └── sms/              # Telnyx SMS webhook (inbound + delivery)
│   │   ├── bookings/
│   │   │   ├── create/           # POST: create appointment (web form)
│   │   │   ├── available-slots/  # GET: available calendar slots
│   │   │   ├── [id]/route.ts     # GET: appointment detail
│   │   │   ├── [id]/cancel/      # POST: cancel appointment
│   │   │   └── delete-past/      # DELETE: cleanup old appointments
│   │   ├── appointments/route.ts # GET: list appointments (dashboard)
│   │   ├── contact/route.ts      # POST: website contact form submission
│   │   ├── marketing-bookings/   # GET only: /book slot availability (no POST, see §19)
│   │   ├── book-demo/            # POST: demo request
│   │   ├── campaigns/
│   │   │   └── upload-image/     # POST: upload image to Vercel Blob
│   │   ├── auth/
│   │   │   ├── google/           # GET: start Google OAuth flow
│   │   │   └── google/callback/  # GET: exchange code, save tokens
│   │   ├── dashboard/
│   │   │   ├── conversations/route.ts     # GET: AI conversations (403 if !missedCallAiEnabled)
│   │   │   ├── messages/route.ts          # GET: list conversations
│   │   │   ├── messages/[conversationId]/ # GET: single conversation + messages
│   │   │   ├── messages/send/             # POST: manual SMS send
│   │   │   ├── messages/contacts/         # GET: contacts for message compose
│   │   │   ├── messages/campaign/         # POST: SMS campaign (403 if !massMessagingEnabled)
│   │   │   ├── messages/campaign/preview/ # POST: preview SMS campaign (403 if !massMessagingEnabled)
│   │   │   ├── contacts/route.ts          # GET/POST: list/create contacts
│   │   │   ├── contacts/[id]/route.ts     # GET/PATCH: contact detail/update
│   │   │   ├── contacts/[id]/activities/  # GET: contact activity timeline
│   │   │   ├── contacts/import/           # POST: bulk import from Excel/CSV
│   │   │   ├── voicemails/                # GET: list voicemails
│   │   │   ├── screened-calls/            # GET: list blocked spam calls
│   │   │   ├── website-leads/             # GET: website leads, owner-group-aware (ungated; no missedCallAiEnabled check)
│   │   │   ├── analytics/                 # GET: usage analytics data
│   │   │   ├── tags/                      # GET/POST: contact tags
│   │   │   ├── jobs/route.ts              # GET/POST: jobs for contacts
│   │   │   ├── jobs/[id]/route.ts         # PATCH/DELETE: update/delete job
│   │   │   ├── emails/route.ts            # GET/POST: email campaigns (403 if !massMessagingEnabled)
│   │   │   └── emails/[id]/route.ts       # GET: single campaign (403 if !massMessagingEnabled)
│   │   └── admin/
│   │       ├── businesses/route.ts        # GET: list all businesses
│   │       ├── businesses/[id]/route.ts   # PATCH: update business settings
│   │       ├── businesses/[id]/contacts/  # GET: list contacts for business
│   │       ├── businesses/[id]/contacts/bulk/ # POST: bulk import contacts
│   │       ├── businesses/[id]/conversations/  # GET: list conversations
│   │       ├── businesses/[id]/screened-calls/ # GET: screened calls
│   │       ├── businesses/[id]/blocked-numbers/# GET: blocked numbers
│   │       ├── businesses/[id]/voicemails/     # GET: voicemails
│   │       ├── businesses/[id]/usage/          # GET: usage data for business
│   │       ├── usage/sync/                # POST: trigger Telnyx MDR/CDR sync
│   │       ├── usage/export/              # GET: export usage to Excel
│   │       ├── usage/sheets-sync/         # POST: sync usage to Google Sheets
│   │       ├── telnyx-test/               # GET: debug Telnyx MDR/CDR fetch
│   │       └── view-as/                   # GET: set adminViewAs cookie (24h maxAge)
│   │
│   ├── admin/                    # Super-admin panel (Jacob only)
│   │   ├── page.tsx              # Lean shell — renders AdminClient
│   │   ├── AdminClient.tsx       # Main admin UI: ClientTable + ClientDetailPanel slide-out
│   │   ├── ClientTable.tsx       # Dense client table with monthly/all-time stats columns
│   │   ├── ClientDetailPanel.tsx # Slide-out panel with 3 tabs (Toggles / Settings / Tools)
│   │   ├── HeaderKPIs.tsx        # Top KPI strip (total clients, MRR, calls this month)
│   │   ├── AdminTools.tsx        # Admin-level tools (usage sync, export)
│   │   ├── types.ts              # AdminBusiness interface (enriched with monthly stats + _count)
│   │   └── ClientDetailPanel/
│   │       ├── TogglesTab.tsx    # Feature flag toggles including massMessagingEnabled
│   │       ├── SettingsTab.tsx   # Business settings (fees, phone, AI config)
│   │       └── ToolsTab.tsx      # Admin tools per business (bulk import, etc.)
│   │
│   └── components/               # Shared UI components
│       ├── NavBar.tsx
│       ├── ConditionalNavBar.tsx  # Hides NavBar on /dashboard routes
│       ├── BrandFooter.tsx       # Shared marketing footer — carries the NAP line (see §16)
│       ├── JsonLd.tsx            # Safe <script type="application/ld+json"> renderer (see §16)
│       ├── FeatureGate.tsx       # Server component: locked/needs-setup overlay for paywalled features
│       ├── Logo.tsx
│       ├── DemoForm.tsx
│       ├── ContactForm.tsx
│       ├── BookingCalendar.tsx
│       ├── BookingPageHeader.tsx
│       ├── EmbedCodeSection.tsx
│       ├── Marquee.tsx
│       ├── ScrollReveal.tsx
│       ├── CountUp.tsx
│       ├── roi-calculator.tsx
│       ├── ServicesDropdown.tsx
│       ├── WebsiteQuoteForm.tsx
│       ├── NavMenu.tsx
│       └── ScrollToBookDemoLink.tsx
│
├── lib/                          # Shared server-side logic
│   ├── db.ts                     # Prisma singleton
│   ├── auth.ts                   # getCurrentBusiness, getCurrentUser
│   ├── dashboard-auth.ts         # requireDashboardBusiness() for API routes
│   ├── get-business-for-dashboard.ts # Admin "view as" logic
│   ├── business-features.ts      # getBusinessFeatures() — centralised feature flag helper
│   ├── phone-utils.ts            # normalizePhoneNumber, normalizeToE164, phonesMatch
│   ├── utils.ts                  # cn(), formatPhoneNumber, formatRelativeTime, slugify
│   ├── business-hours.ts         # DEFAULT_BUSINESS_HOURS constant
│   ├── google-calendar.ts        # Full Google Calendar OAuth + slot logic
│   ├── create-booking.ts         # Shared booking creation (DB + calendar + SMS + notify)
│   ├── notify-owner.ts           # Owner SMS + email notifications (4 scenarios)
│   ├── sms-cooldown.ts           # Cooldown check/record/bypass/log
│   ├── contacts-check.ts         # isExistingContact, logContactSkip
│   ├── crm-utils.ts              # findExistingContact, findOrCreateContact
│   ├── owner-group.ts            # getOwnerGroupBusinesses() — resolve ownerGroupId group (aggregated Website Leads + Google Ads)
│   ├── import-contacts.ts        # parseContactFile (Excel/CSV → contacts array)
│   ├── conversation-buckets.ts   # getConversationBucket() — cold/active/stalled/closed classification
│   ├── spam-score.ts             # scoreSubmission() — additive contact-form spam scoring (see §17)
│   ├── spam-score.test.ts        # unit tests: `npm test`
│   ├── spam-constants.ts         # HONEYPOT_FIELD — dependency-free, safe for the client bundle
│   ├── spam-velocity.ts          # getVelocityCounts() — cross-tenant 24h repeat-sender counts
│   ├── telnyx-usage-sync.ts      # syncTelnyxUsage (MDR + CDR → TelnyxUsageRecord)
│   ├── usage-export.ts           # getUsageForExport (aggregate for Excel export)
│   └── email-format.ts           # plainTextToEmailHtml, bodyContainsHtml
│
├── docs/
│   ├── TESTING-VOICE.md
│   └── system-layout.md          # Comprehensive codebase reference for AI context
│
├── prisma/
│   └── schema.prisma             # Full database schema (see Section 4)
│
├── middleware.ts                 # Clerk auth middleware
├── next.config.js                # CORS headers, iframe allow-all, 2MB server actions
├── package.json
└── tsconfig.json
```

---

## 3. Environment Variables

Every variable the app uses, what it controls, and what breaks without it.

### Authentication
| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk browser-side auth key |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side API key |

### Database
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection URL (used at runtime) |
| `DIRECT_URL` | Yes | Neon direct (non-pooled) URL (used by `prisma db push` — there are no `prisma migrate` migrations) |

### AI
| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for SMS conversation AI |

### Telephony (Telnyx)
| Variable | Required | Purpose |
|---|---|---|
| `TELNYX_API_KEY` | Yes | Telnyx API key for all voice/SMS operations |
| `TELNYX_PUBLIC_KEY` | No | Webhook signature verification (not currently enforced) |
| `TELNYX_PHONE_NUMBER` | No (unused) | Referenced nowhere in code — safe to remove from env |
| `TELNYX_CONNECTION_ID` | Yes (forwarding) | Used when dialing B-leg for call forwarding. Falls back to `connectionId` from call payload |
| `NOTIFICATIONS_TELNYX_NUMBER` | No | Shared fallback `from` for **owner-facing** notification SMS only. Last step of the chain `business.telnyxPhoneNumber → business.notificationSenderNumber → this var` (see §8 `resolveOwnerSmsFrom`). Must NOT equal any client's `telnyxPhoneNumber`, and its messaging profile must POST to `https://www.alignandacquire.com/api/webhooks/sms` or owner STOP/START replies are dropped. Not validated at runtime. Unrelated to the dead `TELNYX_PHONE_NUMBER` |

### Google Calendar
| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes (calendar) | OAuth2 client ID for Google Calendar integration |
| `GOOGLE_CLIENT_SECRET` | Yes (calendar) | OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | Yes (calendar) | OAuth2 callback URL — must match Google Console exactly |

### Email / SMTP
| Variable | Required | Purpose |
|---|---|---|
| `SMTP_HOST` | Yes (email) | SMTP server (default: `smtp.gmail.com`) |
| `SMTP_PORT` | Yes (email) | SMTP port (default: `587`; use `465` for SSL) |
| `SMTP_USER` | Yes (email) | SMTP username (Gmail address) |
| `SMTP_PASS` | Yes (email) | SMTP app password (not your Google password) |
| `SMTP_FROM` | No | From address (defaults to `SMTP_USER`) |
| `RESEND_API_KEY` | No | Resend API key for voicemail email alerts (alternative path in voice webhook) |

### File Storage
| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Yes (voicemail) | Vercel Blob token — voicemail mp3s and campaign images |

### App
| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Full app URL (e.g. `https://www.alignandacquire.com`) — used in notification links |
| `ADMIN_USER_ID` | Yes (admin) | Clerk user ID of the super-admin (Jacob). Grants access to `/admin` dashboard and "view as client" |
| `CRON_SECRET` | No | Bearer token for cron job endpoints (not currently enforced in code) |
| `SMS_COOLDOWN_DAYS` | No | Global SMS cooldown in days (default: 7). Per-business `smsCooldownDays` overrides this |

### Spam Hardening (Contact Form)
| Variable | Required | Purpose |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile secret key for `/api/contact` verification. Without it, Turnstile checks are skipped. **Not set in production.** |
| `TURNSTILE_ENFORCE` | No | **Read nowhere in the code as of Aug 2026 — the auto-condemn branch it drove was removed.** See the warning below before reintroducing it. **Not set in production.** |
| `SPAM_SCORE_THRESHOLD` | No | Score at or above which a contact submission is marked `status='spam'` and the owner is not notified. Default `100`. Comparison is `>=`. Lower = more aggressive. Read from env on **every request**, so retuning needs no code change — but see the redeploy caveat in §17. Set to `100000` for shadow mode. Weights live in `lib/spam-score.ts`, not here |

> **Do not set `TURNSTILE_ENFORCE=true`.** No form on the platform or on any client site emits a Turnstile token, and no Turnstile widget script is deployed anywhere. `TURNSTILE_SECRET_KEY` and `TURNSTILE_ENFORCE` are both absent from Vercel production. Setting `TURNSTILE_ENFORCE=true` today would mark **every real lead from every client** as spam and suppress **all** owner notifications platform-wide. It may only be enabled after a Turnstile widget is confirmed live on every form that POSTs to `/api/contact` — including the client-site repos, which deploy independently of this one.

### Google Ads
| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes (ads) | Developer token from Google Ads API Center |
| `GOOGLE_ADS_CLIENT_ID` | Yes (ads) | OAuth2 client ID for Google Ads API |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes (ads) | OAuth2 client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | Yes (ads) | OAuth2 refresh token (pre-authorized via consent flow) |
| `GOOGLE_ADS_MCC_ID` | Yes (ads) | Manager (MCC) account ID — `login_customer_id` for child account access |

### Marketing Page Env Vars
| Variable | Purpose |
|---|---|
| `MARKETING_BUSINESS_ID` or `MARKETING_BUSINESS_SLUG` | Which business is used for the `/book` marketing booking page |
| `YOUR_EMAIL` | Contact form recipient |
| `OWNER_PHONE` | Marketing contact phone |
| `MARKETING_TELNYX_NUMBER` | Telnyx number for the marketing booking page |

---

## 4. Prisma Schema — Every Model, Every Field

### `Business` — Customer tenants

```
id                      String    @id @default(cuid())
name                    String                          // "Smith Landscaping"
slug                    String    @unique               // "smith-landscaping" — used in booking URLs
businessType            String?                         // "Landscaping" | "Car Detailing" | "HVAC" | "Other"
ownerGroupId            String?                         // @@indexed. Businesses sharing a non-null value form an "owner group" (one client owning several businesses). null = no group, zero behavior change

telnyxPhoneNumber       String?   @unique               // The number Telnyx routes calls/SMS through
notificationSenderNumber String?                        // Shared fallback "from" for OWNER notification SMS only. Deliberately NOT @unique — many businesses may share one number. See §8 resolveOwnerSmsFrom
forwardingNumber        String?                         // Owner's real phone — used as "from" in notifications, "to" in forwarding dial

timezone                String    @default("America/New_York")
businessHours           Json?                           // { monday: { open: "09:00", close: "17:00", closed: false }, ... }
servicesOffered         Json?                           // ["Lawn mowing", "Hedge trimming", ...] — shown in booking dropdowns

aiGreeting              String?                         // First message after missed call. Default: "Sorry we missed your call at {name}. How can we help?"
aiInstructions          String?   @db.Text              // AI personality/rules — injected into system prompt
aiContext               String?   @db.Text              // Business context (what they do, policies, pricing) — injected into system prompt

calendarEnabled         Boolean   @default(false)       // Must be true AND googleCalendarConnected for booking flow
googleAccessToken       String?   @db.Text              // Google OAuth2 access token (auto-refreshed)
googleRefreshToken      String?   @db.Text              // Google OAuth2 refresh token (permanent)
googleCalendarConnected Boolean   @default(false)       // Set to true after successful OAuth callback
slotDurationMinutes     Int       @default(30)          // Length of each booking slot (15, 30, 45, 60, 90, 120)
bufferMinutes           Int       @default(0)           // Gap between back-to-back bookings
smsBookingEnabled       Boolean   @default(true)        // When false, SMS AI captures leads instead of booking (website-only booking mode)

stripeCustomerId        String?   @unique
stripeSubscriptionId    String?
subscriptionStatus      String    @default("trialing")  // trialing, active, past_due, canceled

adminNotes              String?   @db.Text              // Visible only to Jacob
setupFee                Float?
monthlyFee              Float?

spamFilterEnabled       Boolean   @default(false)       // Toll-free + invalid area code calls auto-rejected
callScreenerEnabled     Boolean   @default(false)       // IVR "press 1" gate before connecting
callScreenerMessage     String?                         // Override default IVR prompt
missedCallVoiceMessage  String?   @default("We're sorry we can't get to the phone right now. You should receive a text message shortly.")
missedCallAiEnabled     Boolean   @default(true)        // When false: no SMS is sent; only spam screen + voicemail (if forwarding fails)
knownContactVoicemailEnabled Boolean @default(false)    // When true: a missed call from one of the client's own saved contacts (Contact.isClientContact=true) routes to voicemail instead of the AI SMS flow. Added via scripts/sql, not in a Prisma migration.

smsCooldownDays         Int?                            // null = use SMS_COOLDOWN_DAYS env or 7 days
cooldownBypassNumbers   Json?     @default("[]")        // Phone numbers that skip cooldown (for testing)

massMessagingEnabled    Boolean   @default(false)       // Unlock email + SMS campaign outreach (Outreach tab)

bookingPageTitle        String?                         // "Schedule a Free In-Person Quote"
bookingPageServiceLabel String?                         // "What do you need a quote for?"
bookingPageConfirmation String?   @db.Text              // "You're all set! ..."
bookingRequiresAddress  Boolean   @default(true)        // Whether address field is required on booking page
maxMessagesPerConversation Int    @default(23)          // Cut-off to prevent runaway conversations (not enforced mid-booking-flow)

ownerEmail              String?                         // Receives booking/lead/human-needed notifications
ownerPhone              String?                         // SMS notifications (falls back to forwardingNumber)
notifyBySms             Boolean   @default(true)
notifyByEmail           Boolean   @default(true)

createdAt               DateTime  @default(now())
updatedAt               DateTime  @updatedAt

// Relations:
users                   User[]
conversations           Conversation[]
appointments            Appointment[]
screenedCalls           ScreenedCall[]
blockedNumbers          BlockedNumber[]
contacts                Contact[]
contactCooldowns        ContactCooldown[]
cooldownSkipLogs        CooldownSkipLog[]
telnyxUsageRecords      TelnyxUsageRecord[]
tags                    Tag[]
jobs                    Job[]
emailCampaigns          EmailCampaign[]
activities              Activity[]
websiteLeads            WebsiteLead[]
```

**Critical flags:**
- `missedCallAiEnabled = false` → no missed-call SMS; call screener only triggers voicemail recording (if forwarding fails)
- `calendarEnabled + googleCalendarConnected` must both be `true` for the SMS booking-link handoff to trigger (on booking intent, the customer is texted the `/book/[slug]` link — no in-text time negotiation; see §6); `smsBookingEnabled = false` overrides this — SMS AI falls back to lead capture even when calendar is connected
- `smsBookingEnabled = false` → website booking still works; SMS AI does lead capture only (use when client wants website-only scheduling)
- `callScreenerEnabled` without `forwardingNumber` = IVR gate → speak → hangup (no actual forwarding)
- `callScreenerEnabled` with `forwardingNumber` = IVR gate → "please hold" → dial B-leg → bridge
- `massMessagingEnabled = false` → Outreach tab (email + SMS campaigns) shows a locked FeatureGate overlay; all campaign API routes return 403
- `ownerGroupId = null` (default) → every route and component behaves exactly as before. Non-null and shared across businesses → exactly two dashboard surfaces aggregate across the group: **Website Leads** and **Google Ads** (see §14 and gotcha #34). Everything else (conversations, contacts, settings, appointments) stays scoped to the single business. Resolution goes through `getOwnerGroupBusinesses()` in `lib/owner-group.ts`.

---

### `User` — Dashboard logins

```
id          String    @id @default(cuid())
clerkId     String    @unique               // Clerk's userId
email       String
firstName   String?
lastName    String?
imageUrl    String?
role        String    @default("owner")     // owner, admin, staff
businessId  String                          // FK → Business
```

---

### `Conversation` — One per missed-call session

```
id                    String    @id @default(cuid())
businessId            String
callerPhone           String                          // E.164: +1XXXXXXXXXX
callerName            String?                         // Captured during SMS conversation
callSid               String?   @unique               // Telnyx call_control_id of the A-leg (parent call)
aLegCallControlId     String?                         // Stored when forwarding starts; same as callSid for A-leg
callConnected         Boolean   @default(false)       // True when owner actually answered (prevents missed-call SMS)

dialCallStatus        String?                         // completed, no-answer, busy, failed, canceled
answeredBy            String?                         // human, machine, fax, unknown
durationSeconds       Int?
callEndedAt           DateTime?

recordingUrl          String?                         // Vercel Blob URL of voicemail mp3 (missedCallAiEnabled=false path)
voicemailTranscription String?  @db.Text

status                String    @default("active")
// Status values: active, booking_link_sent, appointment_booked, lead_captured,
//                closed, human_needed, needs_review, completed, no_response,
//                screening, screening_blocked, forwarding
//                (booking_in_progress is legacy — no longer written since the July 2026
//                 link-handoff change; may exist on old rows)

manualMode            Boolean   @default(false)       // When true: inbound SMS saves to DB but AI does NOT respond
summary               String?   @db.Text              // AI-generated summary (not auto-generated; set by flow logic)
bookingFlowState      Json?                           // LEGACY (July 2026): no longer written anywhere. The old in-text
                                                      // booking state machine persisted { step, selectedSlot, ... } here.
                                                      // The SMS webhook now clears any lingering value to DbNull.
intent                String?                         // "book_appointment", "question", "emergency", etc.
serviceRequested      String?

customerEmail         String?                         // Captured in lead flow
customerAddress       String?   @db.Text              // Captured in lead flow or booking flow
customerTimeframe     String?                         // "this week", "next week", "no rush", etc.

createdAt             DateTime  @default(now())
updatedAt             DateTime  @updatedAt
lastMessageAt         DateTime  @default(now())

// Relations:
messages              Message[]
appointment           Appointment?
```

---

### `Message` — Individual SMS texts

```
id              String    @id @default(cuid())
conversationId  String
direction       String                          // "inbound" | "outbound"
content         String    @db.Text
telnyxSid       String?                         // Telnyx message ID (for delivery tracking)
telnyxStatus    String?                         // sent, delivered, failed, webhook-updated by message.finalized
cost            Float?                          // Populated by syncTelnyxUsage from MDR
createdAt       DateTime  @default(now())
```

---

### `Appointment` — Booked quote visits

```
id                    String    @id @default(cuid())
businessId            String
conversationId        String?   @unique               // null for web bookings (/book page)
customerName          String
customerPhone         String
customerEmail         String?
serviceType           String                          // Cleaned owner-facing description (via cleanServiceForOwner)
scheduledAt           DateTime
duration              Int       @default(60)          // minutes
notes                 String?   @db.Text
customerAddress       String?   @db.Text
source                String    @default("website")   // "website" | "sms"
googleCalendarEventId String?
calendarSyncFailed    Boolean   @default(false)       // true = booked in DB but Google Calendar failed
status                String    @default("confirmed") // confirmed, cancelled, completed, no_show
reminderSentAt        DateTime?
createdAt             DateTime  @default(now())
updatedAt             DateTime  @updatedAt
```

---

### `Contact` — Business address book / CRM

```
id          String   @id @default(cuid())
businessId  String
phoneNumber String                // Normalized (no dashes/parens); unique per business
name        String?
email       String?
address     String?
city        String?
state       String?
zip         String?
source      String?               // missed_call, website_form, manual, referral, google_ad
                                  // IMPORTANT: contacts with source=null are treated as "existing contacts"
                                  //            by isExistingContact() — they skip automated SMS
isClientContact Boolean @default(false)  // The client's OWN saved contacts. Separate from source. Drives known-contact voicemail routing (see knownContactVoicemailEnabled) via isClientVoicemailContact(). Added via scripts/sql, not a Prisma migration.
status      String?   @default("new")  // new, contacted, quoted, booked, completed, lost
notes       String?   @db.Text
lastContactedAt DateTime?
updatedAt   DateTime @default(now()) @updatedAt
totalRevenue Float?   @default(0)

// Relations: contactTags[], jobs[], emailRecipients[], activities[]

@@unique([businessId, phoneNumber])
```

**CRITICAL — two distinct contact gates suppress automated SMS, by different mechanisms:**

1. **`isExistingContact()`** (`lib/contacts-check.ts`) — queries `Contact` where `source IS NULL`. UNCHANGED. Only contacts imported without a source (e.g. a bulk CSV of existing customers) block automated SMS. Contacts created from missed calls (source='missed_call') do NOT block SMS. This is guard step 1 inside `sendMissedCallSMS()`.

2. **`isClientVoicemailContact()` + `knownContactVoicemailEnabled`** (the newer gate) — queries `Contact` where `isClientContact = true`. This runs UPSTREAM in the voice webhook, *before* `sendMissedCallSMS()` is even called: if `business.knownContactVoicemailEnabled` AND the caller is one of the client's own contacts (`isClientContact=true`), the call is routed to voicemail (`startClientContactVoicemail`) and no missed-call SMS is sent. It does NOT modify `isExistingContact` and is keyed on `isClientContact`, not on `source`.

---

### `BlockedNumber` — Hard block list

```
id          String   @id @default(cuid())
businessId  String
phoneNumber String
label       String?
@@unique([businessId, phoneNumber])
```

Checked before cooldown in `sendMissedCallSMS()`. If found, logs to `CooldownSkipLog` with reason='blocked' and skips SMS entirely.

---

### `ContactCooldown` — SMS send rate limiting

```
id              String   @id @default(cuid())
businessId      String
phoneNumber     String
lastMessageSent DateTime
@@unique([businessId, phoneNumber])
```

Used by `checkCooldown()`. If `lastMessageSent` was within `smsCooldownDays` (or env var or 7 days), SMS is skipped and logged.

---

### `CooldownSkipLog` — Analytics: skipped messages

```
id              String   @id @default(cuid())
businessId      String
phoneNumber     String
reason          String   @default("cooldown")   // "cooldown", "blocked", "existing_contact"
attemptedAt     DateTime @default(now())
lastMessageSent DateTime
messageType     String?                          // "missed_call", "missed_call_dial_status", etc.
```

---

### `ScreenedCall` — Spam filter log

```
id          String    @id @default(cuid())
businessId  String
callerPhone String
callSid     String?
result      String    @default("blocked")  // "blocked" | "passed"
createdAt   DateTime  @default(now())
```

Created for both blocked spam calls (result='blocked') and IVR-passed calls (result='passed', digit=1 pressed).

---

### `Tag` + `ContactTag` — Contact labels

```
Tag:
  id         String   @id @default(cuid())
  businessId String
  name       String
  color      String?  @default("#6B7280")
  @@unique([businessId, name])

ContactTag:
  contactId  String
  tagId      String
  @@id([contactId, tagId])
```

---

### `Job` — Services performed

```
id            String    @id @default(cuid())
businessId    String
contactId     String
serviceName   String
description   String?   @db.Text
scheduledDate DateTime?
completedDate DateTime?
amount        Float?
status        String    @default("scheduled")  // scheduled, in_progress, completed, cancelled, invoiced
notes         String?   @db.Text
```

---

### `EmailCampaign` — Bulk email sends

```
id             String    @id @default(cuid())
businessId     String
senderName     String    @default("Align and Acquire")
subject        String
body           String    @db.Text
images         Json?     // [{ url: "https://...", filename: "logo.png", order: 0 }]
status         String    @default("draft")  // draft, sending, sent, failed
recipientCount Int       @default(0)
sentAt         DateTime?
```

---

### `EmailRecipient` — Per-contact delivery status

```
id         String    @id @default(cuid())
campaignId String
contactId  String
email      String
status     String    @default("pending")  // pending, sent, delivered, bounced, failed
sentAt     DateTime?
```

---

### `Activity` — Contact timeline

```
id          String   @id @default(cuid())
businessId  String
contactId   String
type        String   // missed_call, sms_conversation, voicemail, website_form,
                     // email_sent, job_created, job_completed, note_added, status_changed
description String
metadata    Json?
createdAt   DateTime @default(now())
```

---

### `WebsiteLead` — Contact form submissions

```
id          String   @id @default(cuid())
businessId  String
name        String
phone       String?
email       String?
message     String?  @db.Text
status      String   @default("new")  // new, contacted, converted, closed, spam
variant     String?                    // /book A/B arm: "gate" | "nogate" | null
spamScore   Int?                       // null = row predates scoring; 0 = scored, clean
spamReasons Json?                      // string[] of SpamReason codes (lib/spam-score.ts)
sourceIp    String?
userAgent   String?  @db.Text
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

The four spam columns are nullable and additive (added Aug 2026 via `npm run db:push`; mirrored in `scripts/sql/2026-08-27_add_websiteLead_spam_columns.sql`). **Every `/api/contact` submission writes a row here, spam included** — see §17 and gotcha #39.

---

### `TelnyxUsageRecord` — Cached MDR/CDR cost data

```
id             String   @id @default(cuid())
businessId     String
recordType     String   // "sms" | "call" | "call_forwarding"
telnyxRecordId String   @unique    // Telnyx's UUID — prevents double-counting
cost           Float    @default(0)
occurredAt     DateTime
metadata       Json?    // { durationSeconds?, from?, to?, direction?, ... }
```

---

### `PhoneNumber` — Available Telnyx number pool

```
id                   String    @id @default(cuid())
phoneNumber          String    @unique
telnyxSid            String    @unique
assignedToBusinessId String?
status               String    @default("available")  // available, assigned, released
```

---

## 5. Call Flow Architecture

### Telnyx Call Control — How it works

Telnyx does NOT use webhooks with XML responses (that's Twilio). Telnyx sends JSON webhook events and you respond `200 OK` immediately, then make separate API calls to control the call. State is passed between events via `client_state` (base64-encoded JSON).

**Voice webhook URL:** `POST /api/webhooks/voice`
**Voice constant:** `const VOICE = 'AWS.Polly.Joanna'` — all TTS uses this voice

### ClientState structure (passed via `client_state` field)

```typescript
interface ClientState {
  businessId?: string         // Always set after call.initiated
  callerPhone?: string        // From phone number (+1XXXXXXXXXX)
  connectionId?: string       // Telnyx connection_id for outbound dial
  forwardingPending?: boolean // Set after speaking "please hold" → dial B-leg on speak.ended
  dialAlreadyStarted?: boolean// Prevents double-dial (parallel speak+dial optimization)
  isForwardingLeg?: boolean   // Set on B-leg client_state to identify forwarding calls
  aLegCallControlId?: string  // B-leg stores A-leg's call_control_id for bridging
  voicemailPending?: boolean  // Set after speaking voicemail greeting → start recording on speak.ended
  announceCallerPending?: boolean // B-leg: after speak "connecting to...", bridge on speak.ended
}
```

### Call Flow Variants

#### Flow 1: Simple (no screener, no forwarding)

```
call.initiated (inbound)
  → answer()
  → if missedCallAiEnabled: sendMissedCallSMS() [async, creates Conversation + Message]
  → speak(missedCallVoiceMessage or default)

call.speak.ended
  → hangup()
```

#### Flow 2: Spam screener, no forwarding

```
call.initiated (inbound)
  → if spamFilterEnabled && isSpamCall(from): reject() + create ScreenedCall(blocked)
  → answer()
  → create Conversation(status='screening')
  → gatherUsingSpeak("press 1", timeout=8000ms, maximum_tries=1)

call.gather.ended
  → if digits == '1':
      create ScreenedCall(result='passed')
      if missedCallAiEnabled: sendMissedCallSMS()
      speak(missedCallVoiceMessage)
  → if digits == '' (timeout):
      update Conversation(status='screening_blocked')
      create ScreenedCall(result='blocked')
      hangup() immediately (no message — it's a robocall)
  → if digits != '1' (wrong key):
      update Conversation(status='screening_blocked')
      create ScreenedCall(result='blocked')
      speak("Thanks for calling. Goodbye.")

call.speak.ended
  → hangup()
```

#### Flow 3: Screener + call forwarding (full flow)

```
call.initiated (inbound)
  → answer()
  → create Conversation(status='screening')
  → gatherUsingSpeak("press 1")

call.gather.ended (digits == '1')
  → create ScreenedCall(result='passed')
  → update Conversation(status='forwarding', aLegCallControlId=callControlId)
  → if connectionId available:
      [PARALLEL]:
        speak(HOLD_MESSAGE_PAYLOAD, client_state={forwardingPending:true, dialAlreadyStarted:true})
        dial(forwardingNumber, timeout=25s[AI] or 20s[no-AI], client_state={isForwardingLeg:true, aLegCallControlId:...})
  → if connectionId missing:
      speak(HOLD_MESSAGE_PAYLOAD, client_state={forwardingPending:true, dialAlreadyStarted:false})

call.speak.ended (state.forwardingPending && !state.dialAlreadyStarted)
  → dial(forwardingNumber) [sequential fallback when parallel wasn't possible]

B-leg call.answered (state.isForwardingLeg)
  → look up contact by callerPhone → get name or format digits
  → speak("Connecting to [name/number]", client_state={announceCallerPending:true, ...})

B-leg call.speak.ended (state.announceCallerPending)
  → bridge(bLeg, aLeg)
  → update Conversation(callConnected=true, status='completed', answeredBy='human')

B-leg call.hangup (state.isForwardingLeg)
  → if conversation.callConnected == true: record end time, done
  → else: handleForwardingFallback()

call.bridging.failed (state.isForwardingLeg)
  → handleForwardingFallback()
```

#### `handleForwardingFallback()` — When B-leg doesn't answer

```
→ update Conversation(status='active', dialCallStatus='no-answer', callEndedAt=now)
→ if missedCallAiEnabled:
    sendMissedCallSMS(aLegCallControlId, callerPhone)
    speak(missedCallVoiceMessage on A-leg)
→ else (spam-screen-only mode):
    speak("Sorry, no one is available. Please leave a message...", voicemailPending=true)
```

#### `sendMissedCallSMS()` — Checks before sending

**Upstream gate (before `sendMissedCallSMS` is called):** in the voice webhook, every path first checks `if (business.knownContactVoicemailEnabled && isClientVoicemailContact(caller))` → route to voicemail and skip the SMS entirely. Only if that's false does it reach `sendMissedCallSMS`.

Order of checks inside `sendMissedCallSMS` (all must pass):
1. Check `BlockedNumber` table → skip if found
2. `isExistingContact()` → skip if caller is in address book (`source IS NULL` — NOT `isClientContact`; that's the upstream voicemail gate above)
3. `isCooldownBypassNumber()` → if bypass list match, skip cooldown
4. `checkCooldown()` → skip if recent SMS within cooldown window
5. Find or create `Conversation`
6. Check if call was connected >5s → skip (owner already talked to them)
7. Check if outbound message already exists for this conversation → skip (idempotency)
8. Send SMS via `telnyx.messages.send()`
9. Defer: create `Message` record, call `recordMessageSent()`

#### `isSpamCall()` — Spam detection heuristic

```typescript
// Blocks: toll-free (+1800/833/844/855/866/877/888)
// Blocks: <10 digit numbers
// Blocks: US numbers with area codes starting with 0 or 1
```

#### Voicemail flow (missedCallAiEnabled = false, forwarding failed)

```
handleForwardingFallback() → speak voicemail greeting, client_state={voicemailPending:true}

call.speak.ended (state.voicemailPending)
  → startRecording(format='mp3', max_length=120s, timeout_secs=5, play_beep=true)

call.recording.saved
  → fetch mp3 from Telnyx URL
  → upload to Vercel Blob (path: voicemails/{callControlId}.mp3)
  → update Conversation(recordingUrl=blobUrl)
  → if !missedCallAiEnabled: send voicemail notification to owner (SMS + email via Resend)
  → hangup()

call.transcription / call.recording.transcription.saved
  → save transcription text to Conversation.voicemailTranscription
```

#### Forwarding loop prevention

On `call.initiated`, if `from == business.telnyxPhoneNumber` (i.e. Telnyx is calling itself):
→ answer, speak missedCallVoiceMessage, return — no SMS, no conversation creation

---

### Timing constants

```typescript
const FORWARDING_TIMEOUT_SECS = 25           // missedCallAiEnabled: ring briefly → SMS flow
const FORWARDING_TIMEOUT_VOICEMAIL_SECS = 20 // missedCallAiDisabled: longer ring → voicemail
```

---

### `/api/webhooks/voice-dial-status` (POST)

Legacy/parallel webhook for when Telnyx is configured with a status callback URL. Handles dial outcome (no-answer/busy/failed) and triggers missed-call SMS independently of the main voice webhook. Query params: `callSid`, `businessId`, `callerPhone`. Same guards as `sendMissedCallSMS`: blocked list, existing contact, cooldown.

### `/api/webhooks/voice-after-dial` (POST)

Returns XML `<Response><Say>...</Say><Hangup/></Response>`. Used when Telnyx is configured with an after-dial callback URL (XML mode, not Call Control mode). No DB writes. If call was answered (completed + duration > 0), returns silent `<Hangup/>`.

---

## 6. SMS Conversation System

### Webhook entry point: `POST /api/webhooks/sms`

Handles two event types:
- `message.received` → inbound customer SMS → AI response
- `message.finalized` / `message.sent` → delivery status update → update `Message.telnyxStatus`

### Inbound SMS processing pipeline

```
0. Find business by telnyxPhoneNumber == payload.to (exact match). **If no tenant matches**, the request falls into the shared-notification-sender branch before the silent drop:
   - `to` is a shared sender when `NOTIFICATIONS_TELNYX_NUMBER` is set and `phonesMatch(to, env)` (env is hand-typed, so last-10 compare), OR a `Business.notificationSenderNumber` row equals `to` exactly (E.164 at write, E.164 in payload).
   - Not a shared sender → unchanged behavior: log `⚠️ No business found`, return 200, no DB writes.
   - Shared sender + STOP word → match `from` against every business's `ownerPhone`/`forwardingNumber` with `phonesMatch` (those columns are NOT normalized at write), set `notifyBySms=false` on **every** match via `updateMany` (an owner of several businesses mutes all of them at once — the shared number can't tell which alert it was about), send ONE ack `from: to`, return 200.
   - Shared sender + START word → same matching, `notifyBySms=true`, ack "Lead alerts by text are back on.", return 200.
   - Shared sender + any other text → `[SHARED-NUMBER]` log only, return 200, no reply (no auto-responder).
   - Shared sender + STOP/START from a number matching no business → `[SHARED-NUMBER] no-match` log, return 200, no ack.
   - The branch writes **only** `Business.notifyBySms` — no `BlockedNumber` rows (that table is per-tenant; a shared number has no tenant). Its ack uses a local `telnyx.messages.send({ from: to, ... })`, NOT `sendSMS()`.
   - Both keyword lists are declared once above the lookup so the shared branch and the tenant branch below match on identical words.
1. Find business by telnyxPhoneNumber == payload.to
2. STOP/unsubscribe check → acknowledge, return
3. "never mind"/"not interested" check → goodbye + notify owner as partial lead
4. Find conversation: look back 90 days, prefer most recent by lastMessageAt
   - If found with status in [appointment_booked, lead_captured, closed, human_needed,
     needs_review, completed]: save inbound message, optionally answer questions, return
   - If not found: create new Conversation + background findOrCreateContact(source='missed_call')
5. Spam guard: duplicate text within 30s → ignore
6. Message limit guard: if messages.length >= maxMessagesPerConversation (default 23)
   AND not currently in booking flow → close conversation, send "please call us" message
7. Save inbound Message to DB, update Conversation.lastMessageAt
8. Re-check status: if appointment_booked or has appointment → return (no AI)
9. Route to flow:
   a. if !calendarEnabled OR !smsBookingEnabled → handleSmsLeadFlow()
   b. handleSmsBookingFlow() — LINK HANDOFF: on booking intent, texts the /book/[slug]
      link and stops (never negotiates times in text)
   c. if booking flow returned false → generateAIResponse() (general AI; booking-mode
      prompt embeds the booking link and forbids discussing specific times)
```

### `handleSmsLeadFlow()` — No calendar mode

Conversational lead capture using Claude AI. Goal: get name, address, email, timeframe.

When Claude returns `[READY_TO_CAPTURE]` tag:
→ extract `customerEmail`, `customerAddress`, `customerTimeframe` from conversation
→ update Conversation with extracted fields, status='lead_captured'
→ send "We'll have someone reach out soon" message
→ `notifyOwnerOnLeadCaptured()` (SMS + email with full transcript)

When Claude returns `[HUMAN_NEEDED]`:
→ send fallback message
→ update Conversation(status='human_needed')
→ `notifyOwnerOnHumanNeeded()` (SMS + email)

### `handleSmsBookingFlow()` — Booking-link handoff (July 2026; replaced the in-text state machine)

Only runs when `business.calendarEnabled == true` AND `business.smsBookingEnabled == true`. When `smsBookingEnabled=false`, the routing block skips this function and falls through to `handleSmsLeadFlow` (lead capture mode) even if the calendar is connected.

**Current behavior — no in-text time negotiation:**

1. Skip if the conversation already has an appointment or status `appointment_booked`.
2. If status is `booking_link_sent` → return false (general AI handles follow-ups; the booking link is embedded in its system prompt so it can re-share it when asked).
3. If a lingering `bookingFlowState.step` exists from a pre-handoff in-flight conversation → clear it to `Prisma.DbNull` and continue. **Nothing writes `bookingFlowState` anymore**, so the old step handlers can never run.
4. Booking intent detection (unchanged mechanism): `BOOKING_INTENT_WORDS` keyword match in the current message OR anywhere in inbound history, OR implicit agreement ("yes"/"sure"/"ok" after the AI offered a quote). Keyword-only — there is NO Claude call for intent detection. Flow start also requires `googleCalendarConnected`.
5. On intent: `sendBookingLinkHandoff()` texts "Happy to get you scheduled. Grab a time that works for you here and you're all set: {NEXT_PUBLIC_APP_URL}/book/{slug}" and sets `status='booking_link_sent'`. If `NEXT_PUBLIC_APP_URL` or `business.slug` is missing, it sends a safe fallback ("someone from the team will reach out to get you scheduled") and logs a console warning instead of a broken URL — status is still set so the handoff doesn't re-fire on every message.

`booking_link_sent` is deliberately NOT in `NO_AI_RESPONSE_STATUSES` — after the link is sent, the AI keeps answering follow-up questions normally. The actual booking happens on the public `/book/[slug]` page → `POST /api/bookings/create` → `createBooking()` (full slot verification, confirmation SMS, owner notification — all unchanged).

**AI safety nets (in the POST handler, for calendar-enabled businesses):** if the model's response fake-confirms a booking ("you're all set!") or asks for name + day/time together (old in-text scheduling habit), the response is suppressed and the booking-link message is sent instead. Neither path writes `bookingFlowState`.

**DEAD CODE — kept in `app/api/webhooks/sms/route.ts` for a reviewable diff, slated for removal in a follow-up:** the `bookingFlowState` step handlers inside `handleSmsBookingFlow` (`awaiting_time`, `awaiting_name_after_slot`, `awaiting_address_after_slot`, `awaiting_confirmation`, `awaiting_name_and_preference`, and the legacy `awaiting_name`/`awaiting_service`/`awaiting_notes`/`awaiting_address`/`awaiting_name_and_address` steps), `handleAwaitingNameAndPreference()`, `handleTimeChangeFromSlotChoice()`, `parseTimePreference()` (the natural-language date parser that caused the wrong-day/wrong-time bookings), `getNext3BusinessDays()`, and the `BookingFlowState` type. `isSpecificSlotAvailable`/`getTwoClosestSlotsOnDay` imports are only referenced by this dead code. `createBooking` itself is still live (website flow + legacy AI-tag path).

### `generateAIResponse()` — Claude API call

**System prompt includes:**
- Business name, type, services offered
- Custom `aiContext` (business background)
- Custom `aiInstructions` (personality/rules)
- Current date/time in business timezone
- Booking-mode (calendar-enabled) prompt: the `/book/[slug]` booking link (via `buildBookingLink()`) plus STRICT link-handoff rules — never propose/suggest/confirm/discuss specific dates or times in text, never claim anything is booked, never output `[APPOINTMENT_BOOKED]`; all scheduling is directed to the booking page. When the link can't be built, the prompt tells the model to say someone will reach out (never invent a link). The old available-dates injection (getAvailableSlots into the prompt) was removed with the link-handoff change.
- `conversation.callerPhone` injected twice: once in a `CRITICAL` block at the top of the prompt, and again inline in the phone-verification rule. This is intentional — it prevents the AI from quoting `business.forwardingNumber` (the owner's number) when asking the customer to confirm their callback number. The `business.forwardingNumber` field in BUSINESS INFO is labeled "Owner's business line (mention only when redirecting customers to call, never as their callback number)" specifically to reinforce this distinction.
- Instructions for special tags (lead-mode prompt):
  - `[READY_TO_CAPTURE]` — signals lead info collected
  - `[HUMAN_NEEDED: reason="..."]` — flags need for human follow-up (both prompts)
  - `[APPOINTMENT_BOOKED: name="..." service="..." datetime="..."]` — legacy tag; NOT taught by either prompt anymore, but the webhook still honors it IF the model emits it AND calendar is off/not connected (`canAiBook`)

**Conversation history:** All previous messages in the conversation are passed as `user`/`assistant` turns.

**Model:** `claude-haiku-4-5-20251001` (both lead-only and calendar modes).

**Error handling:** If Claude API fails (503, overload), sends fallback "Let me have someone get back to you" message and calls `notifyOwnerOnAIFailed()`.

### AI response post-processing

After `generateAIResponse()`:
1. Strip all special tags from response before sending SMS
2. AI safety nets (calendar-enabled only): if the response fake-confirms a booking or asks for name + day/time, suppress it and send the booking link instead (status → `booking_link_sent`)
3. Check for `[READY_TO_CAPTURE]` → lead capture flow
4. Check for `[HUMAN_NEEDED]` → flag conversation, notify owner
5. Check for `[APPOINTMENT_BOOKED:]` → legacy path, only honored when calendar off/not connected (`canAiBook`): parse datetime, call `createBooking(allowWithoutCalendar=true)`
6. Send cleaned SMS to customer via `sendSMSAndLog()`
7. Update conversation status

### `sendSMSAndLog()` helper

```typescript
async function sendSMSAndLog(business, conversationId, to, text, timing?)
// Sends SMS via telnyx.messages.send()
// Creates Message record (direction='outbound')
// Updates ContactCooldown via recordMessageSent()
```

### `sendSMS()` helper (no DB log)

```typescript
async function sendSMS(business, to, text)
// Used for STOP/unsubscribe and message-limit cut-offs only (no Message record)
```

---

## 7. API Routes

### Public Webhooks (no auth)

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/voice` | POST | All Telnyx Call Control events |
| `/api/webhooks/voice-gather` | POST | Legacy gather handler (split from main voice route) |
| `/api/webhooks/voice-after-dial` | POST | XML response after dial attempt |
| `/api/webhooks/voice-dial-status` | POST | Dial outcome → SMS trigger |
| `/api/webhooks/sms` | POST | Telnyx SMS events (inbound + delivery) |

### Public Booking Routes

| Route | Method | Accepts | Returns |
|---|---|---|---|
| `/api/bookings/available-slots` | GET | `businessId` or `businessSlug`, `start?`, `end?` (YYYY-MM-DD) | `{ slots, businessName, slotDurationMinutes, servicesOffered, bookingPageTitle, bookingPageServiceLabel, bookingPageConfirmation, noMoreAvailabilityToday }` |
| `/api/bookings/create` | POST | `{ businessId\|businessSlug, customerName, customerPhone, customerEmail?, slotStart, serviceType, notes?, customerAddress?, conversationId? }` | `{ appointment: { id, scheduledAt, serviceType, timezone } }` |
| `/api/marketing-bookings` | GET | /book slot availability. **No POST** (removed Sept 2026, see §19). Bookings are written by `/api/demo-book`. |

### Auth Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/google` | GET | Redirect to Google OAuth consent screen. Query: `businessId`. Requires Clerk auth. Checks user owns business or is admin. |
| `/api/auth/google/callback` | GET | Exchange auth code for tokens, save to Business. Redirects to `/dashboard/settings`. |

### Dashboard Routes (Clerk auth required via `requireDashboardBusiness()`)

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/conversations` | GET | AI SMS conversation list with inline messages. 403 if `!missedCallAiEnabled`. Excludes screening/forwarding-only conversations. |
| `/api/dashboard/messages` | GET | List conversations. Query: `page`, `search`, `status`, `limit` |
| `/api/dashboard/messages/[conversationId]` | GET | Single conversation + all messages |
| `/api/dashboard/messages/send` | POST | Manual SMS. Body: `{ conversationId, text }`. Sends via Telnyx, creates Message record. |
| `/api/dashboard/messages/contacts` | GET | Contacts for compose UI |
| `/api/dashboard/messages/campaign` | POST | SMS campaign send. 403 if `!massMessagingEnabled`. |
| `/api/dashboard/messages/campaign/preview` | POST | SMS campaign preview. 403 if `!massMessagingEnabled`. |
| `/api/dashboard/contacts` | GET | List contacts. Query: `search?`, `status?` |
| `/api/dashboard/contacts` | POST | Create contact. Body: `{ phoneNumber?, name?, email?, source?, ... }` |
| `/api/dashboard/contacts/[id]` | GET | Contact detail with tags, activities, jobs |
| `/api/dashboard/contacts/[id]` | PATCH | Update contact fields |
| `/api/dashboard/contacts/[id]/activities` | GET | Activity timeline |
| `/api/dashboard/contacts/import` | POST | Bulk import. Form data: `file` (Excel/CSV). Calls `parseContactFile()` → `findOrCreateContact()` |
| `/api/dashboard/voicemails` | GET | Conversations with `recordingUrl != null` |
| `/api/dashboard/voicemails/[id]` | DELETE | Clear `recordingUrl` + `voicemailTranscription` on conversation (soft-delete voicemail). Returns `{ success: true }`. 404 if not found or no recording. |
| `/api/dashboard/screened-calls` | GET | ScreenedCall records |
| `/api/dashboard/website-leads` | GET | WebsiteLead records, newest first. **Ungated** — no `missedCallAiEnabled` check (web-only clients must see their contact-form leads). Owner groups: leads for ALL group businesses, each lead carries `businessName`, response adds `isGroup: true`. Ungrouped: today's exact `{ leads }` shape, no new fields. The PATCH (lead status) lookup is also group-scoped. |
| `/api/dashboard/analytics` | GET | Feature-aware analytics. Period: today/week/month/all. Response includes `features` (BusinessFeatures) and `totalCallsMode` ('screened' or 'calls') so the client can show/hide cards. `totalCalls` source depends on `totalCallsMode`: 'screened' → ScreenedCall count; 'calls' → Conversation WHERE callSid IS NOT NULL. |
| `/api/dashboard/tags` | GET/POST | List / create tags |
| `/api/dashboard/jobs` | GET/POST | List / create jobs |
| `/api/dashboard/jobs/[id]` | PATCH/DELETE | Update / delete job |
| `/api/dashboard/emails` | GET/POST | EmailCampaign list / create. 403 if `!massMessagingEnabled`. |
| `/api/dashboard/emails/[id]` | GET | Single EmailCampaign. 403 if `!massMessagingEnabled`. Used by "Reuse as Template" flow. |
| `/api/appointments` | GET | List appointments. 403 if `!calendarEnabled`. |
| `/api/bookings/[id]` | GET | Appointment detail |
| `/api/bookings/[id]/cancel` | POST | Cancel: update status='cancelled', delete Google Calendar event |
| `/api/bookings/delete-past` | DELETE | Remove appointments older than 90 days |
| `/api/campaigns/upload-image` | POST | Upload image to Vercel Blob. Form data: `file` (PNG/JPG/GIF/WebP, max 5MB), `campaignId?`. Returns `{ url, filename }` |

### Admin Routes (Clerk auth + `userId == ADMIN_USER_ID`)

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/businesses` | GET | List all businesses |
| `/api/admin/businesses/[id]` | PATCH | Update any business's settings |
| `/api/admin/businesses/[id]/contacts` | GET | List contacts for any business |
| `/api/admin/businesses/[id]/contacts/bulk` | POST | Bulk import for any business |
| `/api/admin/businesses/[id]/conversations` | GET | List conversations for any business |
| `/api/admin/businesses/[id]/screened-calls` | GET | Screened calls for any business |
| `/api/admin/businesses/[id]/blocked-numbers` | GET | Blocked numbers for any business |
| `/api/admin/businesses/[id]/voicemails` | GET | Voicemails for any business |
| `/api/admin/businesses/[id]/usage` | GET | Usage data for any business |
| `/api/admin/usage/sync` | POST | Trigger `syncTelnyxUsage()` — fetches MDR+CDR from Telnyx API |
| `/api/admin/usage/export` | GET | Export usage to Excel. Query: `preset?`, `startDate?`, `endDate?` |
| `/api/admin/usage/sheets-sync` | POST | Sync usage data to Google Sheets |
| `/api/admin/telnyx-test` | GET | Debug: test Telnyx MDR/CDR API fetch |
| `/api/admin/view-as` | GET | `?businessId=` sets `adminViewAs` cookie (24-hour maxAge) and redirects to `/dashboard`. `?exit=1` clears it and redirects to `/admin`, or to `/dashboard` with `&next=dashboard` (only those two `next` values; anything else → `/admin`). |
| `/api/admin/google-ads/sync` | POST | Sync Google Ads data. Body: `{ businessId? }`. Syncs one or all enabled businesses. Returns `{ synced, errors }` |

### Dashboard Google Ads

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/google-ads` | GET | Google Ads data. 403 if primary's `!googleAdsEnabled`. Query: `startDate`, `endDate`, `groupBy` (day\|campaign). Returns `{ totals, daily, campaigns, lastSyncedAt }`; owner groups add `isGroup: true` + `perSite` and tag campaign rows with `businessName`. Default last 30 days. |
| `/api/dashboard/google-ads/sync` | POST | Trigger Google Ads sync. 403 if primary's `!googleAdsEnabled`. Ungrouped: 400 if no `googleAdsCustomerId`. Owner groups: loops members with `googleAdsEnabled && googleAdsCustomerId` (others skipped, not errors), aggregates `rowsSynced`/`errors` (errors prefixed with business name). Returns `{ success, rowsSynced, errors, lastSyncedAt }`. |

### Contact / Book Demo

| Route | Method | Purpose |
|---|---|---|
| `/api/contact` | POST | Website contact form. Body: `{ name, phone?, message?, smsConsent, businessId?, businessSlug?, email?, hp_7d3a_ref?, website?, turnstileToken? }`. **Every submission is scored** by `scoreSubmission()` (`lib/spam-score.ts`) and **every submission writes a `WebsiteLead` row** carrying `spamScore`, `spamReasons`, `sourceIp`, `userAgent` — a high score sets `status='spam'` and suppresses Contact creation plus owner notification, it NEVER discards the record. Bots get an identical 200 either way. `hp_7d3a_ref` (and legacy `website`) is the honeypot; a non-empty value auto-condemns. Cross-tenant velocity counts come from `getVelocityCounts()` (`lib/spam-velocity.ts`). **Marketing path** (no `businessId`/`businessSlug`): row is written against `MARKETING_BUSINESS_ID`; clean submissions also send the Resend email to `YOUR_EMAIL`. If no marketing business is configured, the payload is logged and not persisted. **Tenant path:** awaits `findOrCreateContact(source='website_form')` + `websiteLead.create` sequentially, then `notifyOwnerOnWebsiteLead()`. **Business not found:** returns 404 and fires a throttled ops alert email carrying the full payload (see gotcha #40). All user input in email bodies is HTML-escaped. No auth, no rate limiting — open endpoint. |
| `/api/book-demo` | POST | Demo request form submission |

---

## 8. Library Functions & Utilities

### `lib/db.ts`
```typescript
export const db: PrismaClient
// Singleton. In development, stored on globalThis to survive HMR.
// Always import db from here — never instantiate PrismaClient directly.
```

### `lib/auth.ts`
```typescript
getCurrentBusiness(): Promise<Business | null>
getCurrentUser(): Promise<User & { business: Business } | null>
needsOnboarding(): Promise<boolean>
// Uses auth() from @clerk/nextjs/server to get userId, then DB lookup.
```

### `lib/dashboard-auth.ts`
```typescript
requireDashboardBusiness(): Promise<{ business: Business } | NextResponse>
// Use in every dashboard API route handler.
// Returns { business } on success, NextResponse(401) or NextResponse(404) on failure.
// Supports admin "view as client" via adminViewAs cookie.
```

### `lib/get-business-for-dashboard.ts`
```typescript
getBusinessForDashboard(userId: string, userBusiness: Business | null): Promise<{ business: Business | null }>
// If userId == ADMIN_USER_ID and adminViewAs cookie is set → return that business
// Otherwise → return userBusiness
```

### `lib/business-features.ts`
```typescript
export type BusinessFeatures = {
  hasSpamFilter: boolean        // spamFilterEnabled
  hasIvrScreener: boolean       // callScreenerEnabled
  hasAnyScreening: boolean      // either of the above
  hasMissedCallAi: boolean      // missedCallAiEnabled !== false
  hasForwarding: boolean        // Boolean(forwardingNumber)
  hasCalendar: boolean          // calendarEnabled && googleCalendarConnected
  showScreeningCards: boolean   // === hasAnyScreening
  showAiCards: boolean          // === hasMissedCallAi
  totalCallsMode: 'screened' | 'calls'
}

export function getBusinessFeatures(business: BusinessLike): BusinessFeatures
```
Single source of truth for all feature-flag derivations. Used by the dashboard layout (nav items), `dashboard/page.tsx` (voicemail section), `OverviewClient`, `AnalyticsClient`, and the analytics API route.

`totalCallsMode`:
- `'screened'` → business has spam filter or IVR screener; count `ScreenedCall` records
- `'calls'` → all other businesses (forwarding or AI-only); count `Conversation WHERE callSid IS NOT NULL`

**Always import from here — never re-derive feature flags inline.**

### `lib/phone-utils.ts`
```typescript
normalizePhoneNumber(phone: string): string
// Strip all non-digits. 11-digit starting with '1' → 10-digit.
// E.g. "+1 (555) 123-4567" → "5551234567"

normalizeToE164(phone: string): string
// Convert to +1XXXXXXXXXX format for Telnyx API.
// E.g. "5551234567" → "+15551234567"

phonesMatch(a: string, b: string): boolean
// Compare two phones regardless of format (normalizes both first).
```

### `lib/utils.ts`
```typescript
cn(...inputs: ClassValue[]): string
// Merge Tailwind classes (clsx + tailwind-merge)

formatPhoneNumber(phone: string): string
// "(555) 123-4567" format

formatRelativeTime(date: Date | string): string
// "2 hours ago", "Yesterday", "Mar 6"

slugify(text: string): string
// URL-safe lowercase slug
```

### `lib/sms-cooldown.ts`
```typescript
getCooldownDays(business: { smsCooldownDays?: number | null }): number
// Priority: business.smsCooldownDays > SMS_COOLDOWN_DAYS env > 7 (default)

isCooldownBypassNumber(callerPhone: string, bypassList: unknown): boolean
// Check cooldownBypassNumbers JSON array (stored in Business model)

checkCooldown(businessId: string, phoneNumber: string, business?): Promise<
  { allowed: true } | { allowed: false; lastMessageSent: Date }
>
// Query ContactCooldown. Returns allowed=false if lastMessageSent is within cooldown window.

recordMessageSent(businessId: string, phoneNumber: string): Promise<void>
// Upsert ContactCooldown.lastMessageSent = now(). Call after every sent SMS.

logCooldownSkip(businessId: string, phoneNumber: string, lastMessageSent: Date, messageType?: string): Promise<void>
// Create CooldownSkipLog entry for analytics.
```

### `lib/contacts-check.ts`
```typescript
isExistingContact(businessId: string, callerPhone: string): Promise<boolean>
// Returns true if Contact exists with source IS NULL (imported existing customers).
// source='missed_call' or any other source → NOT treated as existing.
// Gates automated SMS (guard step 1 in sendMissedCallSMS). UNCHANGED.

isClientVoicemailContact(businessId: string, callerPhone: string): Promise<boolean>
// Returns true if Contact exists with isClientContact = true (the client's own saved contacts).
// SEPARATE from isExistingContact. Used by the voice webhook's known-contact voicemail
// routing: when business.knownContactVoicemailEnabled is true and this returns true,
// the missed call goes to voicemail and no AI SMS is sent. Uses phonesMatch (last-10).

logContactSkip(businessId: string, phoneNumber: string, messageType?: string): Promise<void>
// Create CooldownSkipLog(reason='existing_contact') for analytics.
```

### `lib/crm-utils.ts`
```typescript
findExistingContact(businessId: string, phoneNumber?: string, email?: string): Promise<Contact | null>
// Phone match is primary; email is fallback.

findOrCreateContact(params: {
  businessId: string
  phoneNumber?: string
  email?: string
  name?: string
  source: string          // Required
  address?: string
  city?: string
  state?: string
  zip?: string
  notes?: string
  skipUpdateIfExists?: boolean
}): Promise<{ id, phoneNumber, name, email, source, isDuplicate? }>
// Creates or updates Contact. Logs Activity(type='missed_call' etc.).
// Use this for all contact creation — never create Contact directly in route handlers.
```

### `lib/owner-group.ts`
```typescript
getOwnerGroupBusinesses(business: Business): Promise<Business[]>
// Resolve the calling business's owner group.
// ownerGroupId null → returns [business] with NO db query (the null path cannot change behavior or latency).
// Non-null → findMany({ where: { ownerGroupId } }); calling business guaranteed in the result.
// No caching. Used by /api/dashboard/website-leads (GET + PATCH), /api/dashboard/google-ads (GET),
// and /api/dashboard/google-ads/sync (POST). Do not wire it into other surfaces without a spec —
// conversations, contacts, settings, and appointments intentionally stay single-business.
```

### `lib/google-calendar.ts`
```typescript
getAuthUrl(businessId: string): string
// Generate Google OAuth2 consent URL with businessId as state param.

exchangeCodeForTokens(code: string, businessId: string): Promise<void>
// Exchange auth code, save access + refresh tokens to Business, set googleCalendarConnected=true.

getValidAccessToken(businessId: string): Promise<string>
// Return stored access token, refreshing via refresh token if expired.

getAvailableSlots(businessId: string, startDate: string, endDate: string): Promise<TimeSlot[]>
// Fetch busy times from Google Calendar, apply business hours, slot duration, buffer.
// Returns array of { start: ISO string, end: ISO string, display: "10:00 AM" }.
// Filters out past slots and slots that fall outside business hours.

getAvailableSlotsWithMeta(businessId: string, startStr: string, endStr: string): Promise<{
  slots: TimeSlot[]
  noMoreAvailabilityToday: boolean
}>

getAvailableSlotsWithDebug(...): Promise<{ slots, noMoreAvailabilityToday, debug }>

getTwoClosestSlotsOnDay(businessId: string, dateStr: string, targetHour: number, targetMinute: number, tz: string): Promise<TimeSlot[]>
// Returns up to 2 slots closest to the target time on a given date.

isSpecificSlotAvailable(businessId: string, dateStr: string, hour: number, minute: number, tz: string): Promise<boolean>

parseBusinessHours(hours: unknown): BusinessHours
// Parse JSON businessHours field or return DEFAULT_BUSINESS_HOURS.

createCalendarEvent(businessId, start, end, customerName, serviceType, customerPhone, options): Promise<string>
// Create Google Calendar event. Returns eventId. Throws on failure.
// options: { customerEmail?, notes?, customerAddress?, source? }

createMarketingCalendarEvent(businessId, start, end, customerName, options): Promise<string>
// Same but for /book discovery calls.

deleteCalendarEvent(businessId, eventId): Promise<void>
calendarEventExists(businessId, eventId): Promise<boolean>
getBusyTimes(businessId, startDate, endDate): Promise<{ start: string, end: string }[]>
```

### `lib/create-booking.ts`
```typescript
cleanServiceForOwner(service: string): string
// Strip "I need a quote for my...", "my...", "your..." → clean service name.
// "I need a quote for my lawn" → "Lawn"
// "a free in-person quote" → "Free quote"

createBooking(params: CreateBookingParams): Promise<CreateBookingResult>
// Full booking creation pipeline:
// 1. Validate inputs (name, phone, service required; slot must be in future)
// 2. Check for duplicate appointment (same phone, service, ±slotDurationMinutes)
// 3. Verify slot is still available in Google Calendar (unless skipSlotVerification=true)
// 4. Create Google Calendar event (calendarSyncFailed=true if this fails, NOT a hard error)
// 5. Create Appointment in DB
// 6. Send confirmation SMS to customer
// 7. notifyOwnerOnBookingCreated()
// Returns: { ok: true, appointment, calendarSyncFailed? } | { ok: false, error, status? }

// Key params:
// skipSlotVerification: true when called from SMS AI (avoids double-checking)
// allowWithoutCalendar: true when calendarEnabled=false but AI booked anyway
// conversationId: links appointment to SMS thread; determines confirmation SMS wording
```

### `lib/notify-owner.ts`

These functions send SMS (Telnyx, `from` resolved by `resolveOwnerSmsFrom` — see below — `to` = ownerPhone||forwardingNumber) and email.

**`resolveOwnerSmsFrom(business): string` (exported).** Single source of truth for the owner-SMS `from` number:

```
business.telnyxPhoneNumber  →  business.notificationSenderNumber  →  process.env.NOTIFICATIONS_TELNYX_NUMBER  →  '' (skip + log)
```

Purpose: website/ads-only clients have no Telnyx number of their own, so before this existed every owner notification for them was silently skipped. All 7 notifiers compute `const fromNumber = resolveOwnerSmsFrom(business)` and use it in both the guard and the `from:` field; when it returns `''` the SMS is skipped with `SMS SKIP: no sender resolved (no telnyxPhoneNumber, no notificationSenderNumber, no NOTIFICATIONS_TELNYX_NUMBER)`.

⚠️ **OWNER-FACING SENDS ONLY.** Every lead-facing send still requires the business's own `telnyxPhoneNumber` and must never use this helper: missed-call greetings (`webhooks/voice`, `voice-gather`, `voice-dial-status`), all AI replies (`sendSMS` / `sendSMSAndLog` in `webhooks/sms`), SMS campaigns, manual dashboard sends, booking confirmations (`lib/create-booking.ts`) and cancellations. A lead must never receive a text from a number shared across clients.

All 7 notifiers also normalize the recipient with `normalizeToE164(...)` before sending (the four that previously sent a raw `toPhone.trim()` were fixed alongside this change). **Email now goes through Resend** via the internal `sendEmail()` helper, `from` = `notifications@alignandacquire.com` (NOT SMTP). There is also a website-lead owner email built from a clean HTML template.

**All six email subjects are prefixed with `[Business Name]`** so an owner receiving multiple businesses' alerts in one inbox can tell them apart. This is global — NOT gated on `ownerGroupId` — and applies to single-business clients too. SMS bodies and recipients are unchanged.

```typescript
notifyOwnerOnBookingCreated(business, appointment): Promise<{ smsSent, emailSent }>
// SMS: "📅 New Quote Request! [Name] wants [service] on [date] at [time]."
// Email: Subject "[Business] New Quote Visit - [Name] - [service] - [date]"
// Includes customer details, address, notes, link to dashboard/appointments

notifyOwnerOnBookingRequestNoCalendar(business, params): Promise<void>
// When AI detected booking intent but calendar is off. Owner must confirm manually.
// Email: Subject "[Business] New Quote Request - [Name] - [service]"; includes full conversation transcript.

notifyOwnerOnLeadCaptured(business, params): Promise<void>
// When [READY_TO_CAPTURE] tag received in lead flow.
// Email: Subject "[Business] New Lead - [Name] - [service]"; includes full conversation transcript.

notifyOwnerOnHumanNeeded(business, params): Promise<void>
// When AI returns [HUMAN_NEEDED]. 
// SMS: "⚠️ A customer needs your help! [Name] needs a personal follow-up."
// Email: Subject "[Business] Follow-Up Needed - [Name]"; includes reason + full conversation transcript.

notifyOwnerOnAIFailed(business, params): Promise<void>
// When Claude API is unavailable (503 etc.).
// Email: Subject "[Business] AI Unavailable - [Name] - Please Follow Up"
// Customer received: "Thanks for reaching out! Let me have someone get back to you shortly."

notifyOwnerOnWebsiteLead(business, params): Promise<{ smsSent, emailSent }>
// When a client tenant's website contact form is submitted (/api/contact with businessId/businessSlug).
// SMS: "📩 New website lead! [Name] just submitted your contact form..."
// Email: Subject "[Business] New Website Lead - [Name]"; clean HTML layout + plain-text fallback.
//        Sets Reply-To to the lead's email so the owner can reply straight to the customer
//        (see "Email transport" below). This is the ONLY notifier that passes replyTo.
```

**Email transport:** `sendEmail(to, subject, text, html?, replyTo?)` uses Resend (`RESEND_API_KEY`). When `html` is omitted it wraps `text` via `plainTextToEmailHtml`. The legacy nodemailer/SMTP `getTransporter()` is still present in the file but is **dead code — nothing calls it** (the SMTP_* env vars are no longer used for sending).

**`replyTo` (optional, 5th arg):** sets the Reply-To header. Key casing is `replyTo` — camelCase — per resend 6.9.3's `CreateEmailBaseOptions`; the SDK maps it to the wire's `reply_to` internally, so passing `reply_to` at the call site is a type error AND is silently dropped at runtime. It is applied via a conditional spread (`...(replyTo ? { replyTo } : {})`) so that when it is omitted the object handed to `resend.emails.send()` is byte-identical to what it was before the param existed — the key is absent entirely, never present-with-`undefined`. **`notifyOwnerOnWebsiteLead` is the only caller that passes it**; the other six notifiers call the 3-or-4-arg form and are unaffected. The lead's address is guarded before being passed (`typeof email === 'string'` — the value arrives as `string | null | undefined` and `/api/contact` never validates its format — then `/^[^@\s]+@[^@\s]+$/`); anything failing that omits the header rather than sending a junk one. **`from` stays `notifications@alignandacquire.com` in every case** — never set `from` to a lead's address (it would break SPF/DKIM on the sending domain). `replyTo`, unlike `from`, needs no domain verification.

### `lib/import-contacts.ts`
```typescript
parseContactFile(file: File): Promise<{
  contacts: { phoneNumber: string; name: string | undefined }[]
  totalRows: number
  invalidSkipped: number
}>
// Accepts Excel (.xlsx, .xls) or CSV
// Auto-detects phone column: looks for headers containing "phone", "mobile", "cell", "number", "tel"
// Auto-detects name column: looks for "name", "first", "last", "full name"
// Normalizes phone numbers; skips rows with no valid phone
```

### `lib/telnyx-usage-sync.ts`
```typescript
syncTelnyxUsage(dateRange?: { start: string; end: string }): Promise<{
  mdrsProcessed: number
  cdrsProcessed: number
  messagesUpdated: number
  errors: string[]
  debugLog: string[]
}>
// Fetches MDR (messaging detail records) and CDR (call detail records) from Telnyx API.
// Matches records to businesses by phone number.
// Upserts TelnyxUsageRecord (idempotent via telnyxRecordId unique constraint).
// Updates Message.cost from matched MDR records.
// CDR fallback chain: tries call, call-control, sip-trunking, then Usage Reports API.
```

### `lib/usage-export.ts`
```typescript
parseExportDateRange(preset: string, startDate?: string, endDate?: string): { start: Date; end: Date }
// Presets: this_week, this_month, last_month, custom

getUsageForExport(range: { start: Date; end: Date }): Promise<{
  dailyRows: { date, business, smsCount, smsTotal, callCount, callTotal }[]
  businessSubtotals: { ... }[]
  grandTotal: { ... }
}>
```

### `lib/business-hours.ts`
```typescript
export const DEFAULT_BUSINESS_HOURS = {
  monday: { open: '09:00', close: '17:00', closed: false },
  tuesday: { open: '09:00', close: '17:00', closed: false },
  // ... Mon–Fri open 9–5, Sat–Sun closed
}
```

### `lib/google-ads.ts`
```typescript
getGoogleAdsClient(): GoogleAdsApi
// Singleton Google Ads API client. Uses GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID, CLIENT_SECRET.

syncGoogleAdsData(businessId: string, startDate?: string, endDate?: string): Promise<{ rowsSynced, errors }>
// GAQL query for campaign metrics → upsert GoogleAdsSnapshot.
// Converts cost_micros to USD (÷ 1,000,000). Default range: last 30 days.
// Uses GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_MCC_ID.

syncAllBusinessAds(): Promise<{ synced, errors }>
// Find all businesses with googleAdsEnabled + googleAdsCustomerId → syncGoogleAdsData each.
```

### `lib/conversation-buckets.ts`
```typescript
export type ConversationBucket = 'cold' | 'active' | 'stalled' | 'closed'

getConversationBucket(conv: ConversationForBucket): ConversationBucket
// Classifies a conversation into one of four buckets:
//   'closed'  — has lead data (email/address/timeframe) or a linked appointment
//   'cold'    — no inbound messages yet (only outbound AI greeting)
//   'active'  — has inbound message AND lastMessageAt within past 48 hours
//   'stalled' — has inbound message AND lastMessageAt > 48 hours ago

export const BUCKET_LABELS: Record<ConversationBucket, string>
// Dashboard display labels: cold→'No Reply', active→'In Progress', stalled→'Went Quiet', closed→'Closed'
// (Client-facing labels differ from bucket names — always use BUCKET_LABELS in UI)

export const BUCKET_COLORS: Record<ConversationBucket, string>
// Tailwind classes per bucket: cold=gray, active=green, stalled=yellow, closed=blue
```
Used by `ConversationsClient.tsx` for tab filtering and badge coloring. The 48-hour `active`/`stalled` cutoff is hard-coded in this file — change it here if the business logic changes.

### `lib/email-format.ts`
```typescript
bodyContainsHtml(text: string): boolean
// Regex check for any tag-like token. Used by compose client to flag bodyIsHtml.

plainTextToEmailHtml(text: string): string
// HTML-escapes the body and wraps it in a <div style="white-space: pre-wrap; ...">
// so newlines and runs of spaces survive rendering in email clients.
// Shared by the compose preview (EmailComposeClient.tsx) and the send route
// (/api/dashboard/emails) so the preview matches what Resend actually delivers.
// Only applied when bodyIsHtml === false — HTML templates are sent as-is.
```

---

## 9. Frontend Pages & Components

### Marketing Pages (no auth)

**`app/page.tsx`** — Marketing homepage
- Hero, features, ROI calculator, demo form, testimonials

**`app/pricing/page.tsx`** — Pricing page (`'use client'`; metadata in `app/pricing/layout.tsx`)
- System tiers: Catch $300/mo ($400 setup), Grow $485/mo ($500 setup, "Most popular"), Automate $700/mo ($750 setup)
- Spam Call Screening is shown as a "+$75/mo" add-on on Catch and Grow; it is INCLUDED in Automate
- À la carte "build your own plan" selector: MissedCall AI $299/mo ($299 setup), Custom Website $169/mo ($250 setup), Google Ads Management $199/mo ($300 setup), Email & SMS Campaigns $149/mo ($150 setup), Leads Dashboard $109/mo (no setup), Calendar Integration $89/mo (no setup), Spam Call Screening $75/mo ($150 setup)
- No contracts / cancel anytime / 30-day money-back guarantee; CTAs push to /book
- The shared ROI calculator (`app/components/roi-calculator.tsx`, renders on / and /missedcall-ai) uses a $300/mo service cost matching the Catch tier (aligned on the `fix-roi-pricing` branch) — keep it in sync if tier pricing changes
- Dead code: a `NumbersSection` ROI component is defined in the file but never rendered (intentionally left alone)

**`app/spam-screening/page.tsx`** — Spam screening feature page

### Auth Pages

**`app/(auth)/sign-in/[[...sign-in]]/page.tsx`** and **`sign-up/`**
- Clerk-managed UI components. No custom logic.

### Onboarding

**`app/onboarding/page.tsx`** — `OnboardingForm` client component
- Shown to new users before dashboard access
- Create business (name, slug, businessType)
- Provision or enter Telnyx phone number
- Optionally connect Google Calendar
- Configure AI greeting + instructions

### Public Booking Page

**`app/book/[businessSlug]/page.tsx`**
- Fetches available slots from `/api/bookings/available-slots?businessSlug=...`
- Renders `BookingCalendar` component for slot selection
- Form: name, phone, email, service type (from `servicesOffered`), address (if `bookingRequiresAddress`)
- On submit: POST `/api/bookings/create`
- On success: shows `bookingPageConfirmation` message

**`app/book/[businessSlug]/embed/page.tsx`**
- Stripped booking page for iframe embedding
- Same logic, minimal chrome
- Works because `next.config.js` sets `X-Frame-Options: ALLOWALL` and `frame-ancestors *`

### Dashboard Pages (all require Clerk auth + business)

**`app/(dashboard)/layout.tsx`** — Dashboard shell
- `DashboardShellClient`: sidebar navigation, user menu, "Viewing as client" banner with exit link, and an "Admin" nav item (→ `/admin`) rendered only when the layout passes `isAdmin` (Clerk user is `ADMIN_USER_ID`)
- Nav items built via `getBusinessFeatures(business)` — current structure:
  - Always: Overview, Conversations, Outreach, Analytics, Contacts, Jobs, Settings
  - Always (regardless of AI flag): Leads (the unified page; see below)
  - `hasMissedCallAi`: Conversations, Scheduled Quotes
  - `!hasMissedCallAi && hasAnyScreening`: Blocked Calls (screening-only clients only — NOT for AI clients who also happen to have a screener)
  - `!hasMissedCallAi`: Voicemails
  - `googleAdsEnabled`: Google Ads (label from `googleAdsTabLabel` or "Google Ads")
- Messages and Emails nav items were removed; both old URLs redirect to `/dashboard/outreach`
- Conversations uses icon `MessagesSquare`; Outreach uses icon `Send`

**`app/components/FeatureGate.tsx`** — Server component (no `'use client'`). Takes a required `enabled: boolean` — when `true` it renders `children` directly; when `false` it blurs them and shows an overlay card. The props are a discriminated union on `mode`:
- **Shared:** `enabled: boolean`, `children`.
- **`mode: 'locked'`** (paid upgrade): `feature: string`, `valueProp: string`, `businessName: string`. CTA is a `mailto:jacob@alignandacquire.com` link with subject `Unlock {feature} for {businessName}` (encodeURIComponent'd). `valueProp` is the body copy.
- **`mode: 'needs-setup'`** (available but unconfigured, e.g. Google Calendar): `feature: string`, `setupDescription: string`, `setupLabel: string`, `setupHref: string`. CTA is a green link to `setupHref` labeled `setupLabel`; `setupDescription` is the body copy.
- NOTE: the old `setupHref?/setupLabel?/businessName?`-optional shape is gone — `valueProp` (locked) and `setupDescription` (needs-setup) are now required, and `enabled` drives whether the gate passes through.

**`app/(dashboard)/dashboard/page.tsx`** — Overview (server component)
- Calls `getBusinessFeatures(business)` to build full `features` object (including `googleAds`)
- When `!features.hasMissedCallAi`: fetches up to 5 recent voicemails server-side, resolves contact names via `normalizePhoneNumber` map lookup, passes as `initialVoicemails` prop to `OverviewClient`
- Passes `features` + `initialVoicemails` to `<OverviewClient />`

**`app/(dashboard)/dashboard/OverviewClient.tsx`** — Feature-aware overview client component
- `Features` type mirrors `BusinessFeatures` plus `googleAds: boolean`
- Metric cards section only renders when `features.hasMissedCallAi`
- Total Calls description: "Screened calls" when `totalCallsMode === 'screened'`, "Inbound calls" otherwise
- Spam screening stats section only renders when `features.hasAnyScreening`
- Upcoming appointments section only renders when `features.hasCalendar`
- Google Ads summary section only renders when `features.googleAds`
- Recent Screened Calls section: `features.hasAnyScreening && !features.hasMissedCallAi`
- Recent Voicemails section: `!features.hasMissedCallAi && initialVoicemails.length > 0` — uses server-fetched data, no client fetch needed

**`app/(dashboard)/dashboard/conversations/page.tsx`** — `ConversationsClient`
- FeatureGate `locked` on `business.missedCallAiEnabled !== false` — shows upgrade overlay for non-AI clients
- Dark theme (`bg-gray-950`), `-m-6 md:-m-8` negative margin so it bleeds edge-to-edge within the padded shell
- 5 tabs: All / No Reply (cold) / In Progress (active) / Went Quiet (stalled) / Closed
  - Tab labels are client-facing; internal bucket names differ — see `lib/conversation-buckets.ts`
  - Tab bar: `overflow-x-auto` with scrollbar hidden; tabs are `whitespace-nowrap flex-shrink-0` — scrolls horizontally on mobile, no wrapping
- **Mobile layout** (`< md`): `mobileChatOpen` boolean — list and thread never shown simultaneously
  - List visible when `!mobileChatOpen`; thread visible when `mobileChatOpen && selectedConvo`
  - Thread header: back arrow (ArrowLeft, min 44×44px touch target) + contact name + bucket badge
  - Thread content: no height cap, page scrolls naturally (no fixed-height container)
  - Switching tabs resets `mobileChatOpen(false)` back to list
- **Desktop layout** (`md+`): unchanged split-pane — `col-span-2` list, `col-span-3` thread with `sticky top-6` and `max-h-[560px] overflow-y-auto`
- Module-scope components (NOT defined inside `ConversationsClient` — avoids recreation on every render):
  - `ConvoCard` — props: `convo: BucketedConversation`, `isSelected`, `onSelect`, `activeTab`
  - `ThreadBody` — props: `convo: Conversation`, `scrollable?: boolean`
  - `EmptyState` — props: `activeTab: TabKey`
  - `BucketedConversation` type alias: `Conversation & { bucket: ConversationBucket }`
- Fetches from `/api/dashboard/conversations` (403 if AI not enabled)

**`app/(dashboard)/dashboard/outreach/page.tsx`** — `OutreachClient`
- FeatureGate `locked` on `business.massMessagingEnabled` — shows upgrade overlay for clients without outreach
- Email/SMS channel switcher tabs at the top
- Embeds `<EmailsClient hideHeader />` for email campaigns
- Embeds `<MessagesClient hideHeader />` for SMS threads (manual outbound SMS threads)
- `hideHeader` prop suppresses the h1 title inside each embedded client since OutreachClient provides its own header

**`app/(dashboard)/dashboard/messages/page.tsx`** — Legacy redirect
- `redirect('/dashboard/outreach')` — old Messages URL preserved for bookmarks/links

**`app/(dashboard)/dashboard/messages/MessagesClient.tsx`** — `MessagesClient` (embeddable)
- `hideHeader?: boolean` prop — suppresses h1 when embedded inside OutreachClient
- Conversation list with search, status filter
- Click conversation → full SMS thread view
- Manual reply compose box → POST `/api/dashboard/messages/send`
- Toggle `manualMode` (disables AI for that conversation)
- Conversation status badges

**`app/(dashboard)/dashboard/appointments/page.tsx`** — `AppointmentsClient`
- Dual FeatureGate:
  - `!calendarEnabled` → `locked` mode (upgrade required)
  - `calendarEnabled && !googleCalendarConnected` → `needs-setup` mode, link to `/api/auth/google?businessId=${business.id}`
- Upcoming + past appointments list
- Each row: customer name, phone, service, date/time, address, source badge
- `CancelBookingButton`: POST `/api/bookings/[id]/cancel`

**`app/(dashboard)/dashboard/contacts/page.tsx`** — `ContactsClient`
- Contacts list with search, status filter, tag filter
- Import button → file upload → `/api/dashboard/contacts/import`
- Create contact modal → POST `/api/dashboard/contacts`
- Tag management
- Click → contact detail page

**`app/(dashboard)/dashboard/contacts/[id]/page.tsx`** — `ContactDetailClient`
- Contact info (name, phone, email, address, source, status, notes)
- Activities timeline (missed_call, sms, voicemail, etc.)
- Jobs list (services scheduled/completed)
- Email campaigns this contact was part of

**`app/(dashboard)/dashboard/contacts/import/page.tsx`** — `ImportContactsClient`
- Drag & drop or click to upload Excel/CSV
- Preview detected columns (phone, name)
- Confirm import → POST `/api/dashboard/contacts/import`

**`app/(dashboard)/dashboard/voicemails/page.tsx`** — `VoicemailsClient`
- List conversations with `recordingUrl`
- Inline audio player for each voicemail
- Shows transcription if available
- Delete button (Trash2 icon) per voicemail — confirmation dialog, DELETEs to `/api/dashboard/voicemails/[id]`, removes from list client-side, shows toast

**`app/(dashboard)/dashboard/blocked-calls/page.tsx`**
- ScreenedCall records (spam-filtered calls)
- Shows caller phone, date, result

**`app/(dashboard)/dashboard/leads/page.tsx`** — `LeadsClient` → `CombinedLeadsList` (the unified Leads page)
- **Ungated** (no FeatureGate, Sept 2026): the page renders for every client, and when MissedCall AI is off the 403 from `/api/dashboard/conversations` is tolerated client-side in `CombinedLeadsList` (`hasAiLeads=false`, empty conversation list, empty-state copy "No website leads yet. Leads from your website's contact form show up here."); a non-OK `/api/dashboard/website-leads` response still shows the error state.
- `CombinedLeadsList` fetches BOTH `/api/dashboard/conversations` and `/api/dashboard/website-leads` client-side and merges them into one list with a source filter (All / Missed Call / Website). Missed-call rows reuse the conversation buckets/labels; website rows use WebsiteLead status. No dedicated `/api/dashboard/leads` route exists.
- **Owner groups:** when the website-leads response has `isGroup: true`, website rows show a gray site pill (`lead.businessName`) next to the status badge. Missed-call rows never get a pill — `/api/dashboard/conversations` stays primary-scoped, so on a grouped dashboard the All tab deliberately mixes group-wide website leads with primary-only missed-call leads (accepted as spec).

**`app/(dashboard)/dashboard/website-leads/page.tsx`** — legacy redirect
- `redirect('/dashboard/leads?tab=website')` — old Website Leads URL preserved for bookmarks/links. (It is no longer a standalone `WebsiteLeadsClient` page; the `WebsiteLeadsClient.tsx` component still exists but the route only redirects. The component is owner-group-aware too — same `isGroup` site-pill pattern as `CombinedLeadsList`.)

**`app/(dashboard)/dashboard/ads/page.tsx`** — Google Ads (server wrapper)
- FeatureGate `locked` on `!business.googleAdsEnabled` — shows upgrade overlay
- Server component fetches business, renders `<AdsClient />` inside the gate

**`app/(dashboard)/dashboard/analytics/page.tsx`** — `AnalyticsClient`
- Period picker: Today / This Week / This Month / All Time
- Fetches `/api/dashboard/analytics?period=...`; response includes `features` and `totalCallsMode`
- Metric cards are feature-gated:
  - Total Calls: always shown; description = "Screened calls" or "Inbound calls" per `totalCallsMode`
  - Calls Blocked / Calls Passed: only when `features.hasAnyScreening`
  - Leads Captured / Website Leads / Messages Sent: only when `features.hasMissedCallAi`
- Lead sources bar chart + Recent Activity timeline always shown

**`app/(dashboard)/dashboard/emails/page.tsx`** — Legacy redirect
- `redirect('/dashboard/outreach')` — old Emails URL preserved for bookmarks/links

**`app/(dashboard)/dashboard/emails/EmailsClient.tsx`** — `EmailsClient` (embeddable)
- `hideHeader?: boolean` prop — suppresses h1 when embedded inside OutreachClient
- "Sent Campaigns" section — lists campaigns where `status === 'sent'`, sorted by `sentAt` desc
- Columns: Subject, Sent (timestamp), Recipients, Actions
- "Reuse as Template" button per row links to `/dashboard/emails/new?templateId=[campaignId]`
- Draft/sending campaigns are intentionally hidden for now

**`app/(dashboard)/dashboard/emails/new/page.tsx`** — `EmailComposeClient`
- Subject line input
- Rich HTML editor for email body
- Image upload → POST `/api/campaigns/upload-image`
- Recipient selection from contact list
- Preview → POST `/api/dashboard/messages/campaign/preview`
- Send → POST `/api/dashboard/messages/campaign`
- **Reuse as Template**: when URL has `?templateId=<id>`, the client calls GET `/api/dashboard/emails/[id]` on mount and pre-fills `subject` + `body` from that campaign. Recipients, sender name, and images are intentionally NOT pre-filled — the user picks fresh recipients each time. Header copy switches to "Starting from a previous campaign. Recipients reset — pick them below." while in this mode.

**`app/(dashboard)/dashboard/settings/page.tsx`** — `SettingsFormWithIndustry`
- Business name, slug, timezone, businessType
- Business hours (per-day open/close/closed toggle)
- Services offered (add/remove list)
- AI greeting + context + instructions (text areas)
- `missedCallVoiceMessage` (TTS audio message)
- Google Calendar connect/disconnect button → `/api/auth/google?businessId=...`
- Slot duration + buffer minutes
- SMS preferences: `smsCooldownDays`, `missedCallAiEnabled`
- Notification preferences: ownerEmail, ownerPhone, notifyBySms, notifyByEmail
- Booking page: title, service label, confirmation message, requiresAddress
- `maxMessagesPerConversation`
- `callScreenerEnabled` + screener message
- Blocked numbers management

---

## 10. Multi-Tenant Architecture

Every database table has `businessId` as a foreign key (except `User`, `PhoneNumber`). All data is scoped:

- **API auth:** `requireDashboardBusiness()` resolves `business.id` from Clerk userId → User → Business. All DB queries in dashboard routes use this `businessId` in `where` clauses.
- **Admin "view as":** Admin sets `adminViewAs` cookie (via GET `/api/admin/view-as`, 24-hour maxAge). `getBusinessForDashboard()` checks this cookie if `userId == ADMIN_USER_ID`. Allows Jacob to view any client's dashboard without separate login.
- **Owner groups (deliberate cross-tenant exception):** businesses sharing a non-null `Business.ownerGroupId` form a group — one client owning several businesses with one dashboard login. Exactly three API routes aggregate across the group: `/api/dashboard/website-leads` (GET + PATCH), `/api/dashboard/google-ads` (GET), and `/api/dashboard/google-ads/sync` (POST). Resolution goes through `getOwnerGroupBusinesses()` (`lib/owner-group.ts`). Everything else — conversations, contacts, settings, appointments — stays scoped to the login's own business.
- **Webhook isolation:** Voice and SMS webhooks find business by `telnyxPhoneNumber`. Each business has a unique Telnyx number → no cross-contamination.
- **Phone number pool:** `PhoneNumber` table tracks available/assigned numbers. Assigning to a business sets `assignedToBusinessId` and `status='assigned'`.
- **Data deletion:** All models use `onDelete: Cascade` from Business, so deleting a business cleans up all related data.
- **Feature flags:** `getBusinessFeatures(business)` in `lib/business-features.ts` is the single place that derives all feature booleans and `totalCallsMode` from the Business row. Dashboard layout, overview, analytics page, and analytics API route all call this. Do not re-derive flags inline.

---

## 11. Middleware & Auth

### `middleware.ts`

```typescript
// Protected (require Clerk session):
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/settings(.*)',
])

// Explicitly public (skip auth even if matching above):
const isPublicRoute = createRouteMatcher([
  '/book/(.*)',    // Booking pages — no auth, iframe-embeddable
])

// Public API routes:
const isPublicApiRoute = createRouteMatcher([
  '/api/webhooks/(.*)',   // Telnyx webhooks — no Clerk auth
])
```

**Matcher config:** Excludes `_next` static files, `book/` path segment, and all static file extensions. Applies to all `/api/(.*)` routes.

**Admin check:** Not done in middleware. Individual admin routes check `userId == process.env.ADMIN_USER_ID` in the route handler.

**View-as cookie (`adminViewAs`):** set by `GET /api/admin/view-as?businessId=<id>` (24 h, `path=/`, `sameSite=lax`, then redirect `/dashboard`) and read by `getBusinessForDashboard()` only when `userId === ADMIN_USER_ID`. Cleared by `GET /api/admin/view-as?exit=1`, which takes an optional `next` param allowlisted to exactly two values: `admin` (default → redirect `/admin`) and `dashboard` (→ redirect `/dashboard`); anything else falls back to `admin`. The `← Dashboard` link in the admin header uses `exit=1&next=dashboard` so leaving `/admin` never strands a stale cookie; the dashboard's "Exit view" banner uses plain `exit=1`. The dashboard layout also computes `isAdmin = userId === ADMIN_USER_ID` server-side and passes it to `DashboardShellClient`, which renders an extra "Admin" nav item → `/admin` for that user only.

**Dashboard API auth:** Each dashboard route calls `requireDashboardBusiness()` which does:
1. `auth()` → get Clerk userId
2. DB lookup: `User.findUnique({ where: { clerkId: userId } })`
3. `getBusinessForDashboard()` → handles admin view-as cookie
4. Returns `{ business }` or 401/404 NextResponse

---

## 12. Integrations

### Clerk (Authentication)

- Provider: `ClerkProvider` in `app/layout.tsx`
- Server auth: `auth()` from `@clerk/nextjs/server` in API routes
- Middleware: `clerkMiddleware` + `createRouteMatcher`
- User data stored in both Clerk and `User` table (synced at signup/webhook)
- Admin identified by `process.env.ADMIN_USER_ID` (Clerk user ID)

### Telnyx (Telephony & SMS)

- SDK: `new Telnyx({ apiKey: process.env.TELNYX_API_KEY })`
- **Inbound calls:** Telnyx sends webhooks to `/api/webhooks/voice`. You respond 200 immediately, then make separate API calls to `telnyx.calls.actions.*`
- **Inbound SMS:** Telnyx sends webhooks to `/api/webhooks/sms`
- **Webhook URLs configured in the Telnyx portal (Call Control app + Messaging Profile) MUST use `https://www.alignandacquire.com` — the bare apex 308-redirects and Telnyx drops the delivery (see gotcha #30)**
- **Outbound SMS:** `telnyx.messages.send({ from: business.telnyxPhoneNumber, to, text })`
- **Outbound calls (forwarding):** `telnyx.calls.dial({ connection_id, to, from, timeout_secs, client_state, ringback_tone })`
- **Call control actions used:**
  - `telnyx.calls.actions.answer(callControlId, { client_state })`
  - `telnyx.calls.actions.speak(callControlId, { payload, voice, client_state })`
  - `telnyx.calls.actions.gatherUsingSpeak(callControlId, { payload, voice, minimum_digits, maximum_digits, timeout_millis, valid_digits, maximum_tries })`
  - `telnyx.calls.actions.hangup(callControlId, {})`
  - `telnyx.calls.actions.bridge(callControlId, { call_control_id: aLegId })`
  - `telnyx.calls.actions.startRecording(callControlId, { format, channels, max_length, timeout_secs, play_beep })`
  - `telnyx.calls.actions.reject(callControlId, { cause: 'CALL_REJECTED' })`

### Anthropic / Claude (AI)

- SDK: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
- Used in: `/api/webhooks/sms/route.ts` for response generation and intent detection
- All conversation history passed as messages array
- System prompt includes business context, current datetime, calendar status, special tag instructions
- Special response tags trigger app-side actions (booking, lead capture, human flag)

### Google Calendar

- OAuth2 flow: redirect → consent → callback → token storage in DB
- Per-business tokens (`googleAccessToken`, `googleRefreshToken` in Business model)
- Auto-refresh: `getValidAccessToken()` checks expiry, calls refresh if needed
- API calls use `google.calendar({ version: 'v3', auth: oauth2Client })`
- Free/busy query + business hours = available slots
- Events created with customer details in description field

### Resend (Email — ALL transactional email)

- `new Resend(process.env.RESEND_API_KEY)`, sends from `notifications@alignandacquire.com`
- Three send paths, all on Resend:
  - **Owner notifications** — `lib/notify-owner.ts` `sendEmail()` (booking/lead/human-needed/AI-failed + website-lead emails)
  - **Voicemail notifications** — voice webhook `call.recording.saved` handler (used when `missedCallAiEnabled == false`, spam-screening-only mode)
  - **Outreach email campaigns** — `app/api/dashboard/emails/route.ts`

### nodemailer / SMTP — retained but DEAD

- `lib/notify-owner.ts` still imports nodemailer and defines `getTransporter()` (reads SMTP_HOST/PORT/USER/PASS), but **nothing calls it** — email send was moved to Resend. The SMTP_* env vars are effectively unused.

### Vercel Blob (File Storage)

- Used for voicemail mp3 uploads and campaign image uploads
- `import { put } from '@vercel/blob'`
- All blobs uploaded with `access: 'public'` — this is REQUIRED (see gotchas)
- Voicemail path: `voicemails/{callControlId}.mp3`
- Campaign image path: `campaign-images/{campaignId}/{filename}` or `campaign-images/draft/{filename}`

---

## 13. Known Gotchas

Never push to main, merge to main, or trigger a production deploy without Jacob saying so in the same conversation. Commit on a branch and report.

### IVR / Call Control

1. **IVR audio MUST fire inside `call.answered` or after** — You cannot send `gatherUsingSpeak` before `call.answered`. Always: `answer()` first, then `speak()` or `gatherUsingSpeak()`. The webhook flow is sequential: you get `call.initiated`, you call `answer()`, you get `call.answered`, then you can send IVR commands. BUT in the current architecture, we send `gatherUsingSpeak` directly after `answer()` in the `call.initiated` handler (without waiting for `call.answered`). This works because Telnyx queues commands. Do not change this without testing.

2. **`number_of_tries: 1` on `gatherUsingSpeak`** — Always set `maximum_tries: 1` on screener gather. Otherwise Telnyx will repeat the IVR message multiple times on timeout/wrong key, creating a confusing experience for real callers.

3. **Google Voice rejects Telnyx outbound calls** — When `forwardingNumber` is a Google Voice number, the B-leg forwarding dial will fail or ring without connecting. Google Voice does not accept PSTN termination from Telnyx. The forwarding fallback handles this gracefully (falls through to missed-call SMS), but the owner will never see the call in their Google Voice app. Consider documenting this for clients using Google Voice.

4. **AMD (Answering Machine Detection) is intentionally disabled** — AMD produces false positives with Google Voice, carrier voicemail, and other systems that answer before a human does. The codebase does NOT use AMD. Instead, it uses a short ring timeout (25s) so unanswered calls quickly fall back to the missed-call SMS flow.

5. **Forwarding loop prevention** — If Telnyx calls the business number from the business number (e.g. someone calls a Telnyx number that has a forwarding rule back to itself), `call.initiated` handler checks `phonesMatch(from, business.telnyxPhoneNumber)` and plays the voice message without creating a conversation or sending SMS.

6. **`client_state` is base64-encoded JSON** — All state passed between Telnyx webhook events goes through `toB64(obj)` (Buffer.from JSON → base64) and is parsed in each handler. Never store sensitive data in client_state — it's passed through Telnyx.

7. **HOLD_MESSAGE_PAYLOAD is intentionally long** — It's a string of dots and spaces that plays as a "hold" TTS sound. The length ensures the hold music continues until the B-leg either answers or times out. Do not shorten it.

### SMS / Cooldown

8. **Two separate "skip SMS" gates — don't conflate them.**
   - **`source IS NULL`** → `isExistingContact()` queries contacts where `source IS NULL` and skips SMS (guard inside `sendMissedCallSMS`). If you import existing customers without a source tag, they won't get automated SMS; contacts from missed calls (source='missed_call') WILL. Uploading a full customer CSV without a source blocks all of them.
   - **`isClientContact = true` + `knownContactVoicemailEnabled`** → a *different, newer* gate. It does NOT touch `isExistingContact` or `source`. When the business has `knownContactVoicemailEnabled` on and the caller is one of its own contacts (`isClientContact=true`, matched by `isClientVoicemailContact()`), the voice webhook routes the call to voicemail *before* `sendMissedCallSMS` runs, so no SMS is sent. A contact can have a non-null source and still hit this gate.

9. **SMS cooldown is per-business-phone pair** — The `ContactCooldown` table uses `(businessId, phoneNumber)`. If someone calls two different businesses on the same platform, they get separate cooldowns.

10. **Deferred DB writes after SMS** — In both `sendMissedCallSMS()` and `sendSMSAndLog()`, the Telnyx `messages.send()` call happens first. The DB write (`Message.create()`) and `recordMessageSent()` are deferred with `void promise.then().catch()`. This means: if the DB write fails after SMS succeeds, the message won't appear in the dashboard but WAS sent. Don't "fix" this by awaiting — it's intentional to keep the webhook response fast.

### Booking & Calendar

11. **60-second slot tolerance** — `createBooking()` uses `Math.abs(slotStart - availableSlot.start) < 60_000ms` when verifying slot availability. This handles timezone/parsing edge cases where the same "10:00 AM" slot might differ by a minute in ISO representation.

12. **Calendar sync failure is non-fatal** — If `createCalendarEvent()` throws, `createBooking()` sets `calendarSyncFailed=true` and continues. The appointment IS created in DB. The confirmation SMS adds: "Note: We had a small technical issue syncing to our calendar, but you're definitely booked." Always check `calendarSyncFailed` in appointment views.

13. **`skipSlotVerification` vs `allowWithoutCalendar`** — These are separate flags:
    - `skipSlotVerification=true`: Skip the double-check that the slot is still available (used in SMS booking flow to avoid an extra Calendar API call)
    - `allowWithoutCalendar=true`: Create appointment even if `calendarEnabled=false` or `googleCalendarConnected=false` (used when AI booked without calendar)

14. **Booking message wording differs by source** — In `createBooking()`:
    - `conversationId != null` (SMS source): "You're all set [Name]! [Business] will meet you on [date]..."
    - `conversationId == null` (website source): "Confirmed! Your quote visit with [Business] is scheduled for [date]..."

### File Storage

15. **Vercel Blob MUST be `access: 'public'` at creation** — Blobs cannot be made public after creation. Both voicemail recordings and campaign images must pass `{ access: 'public' }` to `put()`. Private blobs cannot be served to browsers. If you ever add a new `put()` call, always include `access: 'public'`.

### Auth & Multi-tenant

16. **Admin "view as" via cookie** — When Jacob is logged in and sets `adminViewAs` cookie (via GET `/api/admin/view-as`), `getBusinessForDashboard()` returns that business instead of Jacob's own business. This means all dashboard API calls use the client's `businessId`. The cookie has a 24-hour maxAge — it persists across browser restarts within that window. If Jacob sees unexpected data, check for a stale `adminViewAs` cookie.

17. **No webhook signature verification** — The Telnyx webhooks at `/api/webhooks/voice` and `/api/webhooks/sms` do NOT verify the `TELNYX_PUBLIC_KEY` signature. They are currently open to any POST request. This is a security risk — anyone who knows the URL can trigger conversation creation or SMS sends. The `TELNYX_PUBLIC_KEY` env var is defined but not used in verification code. Do not add verification without testing that the signature format matches Telnyx's current implementation.

### Data Model

18. **`maxMessagesPerConversation` in-booking-flow exemption is now inert** — The message limit guard still checks `inBookingFlow = Boolean(conversation.bookingFlowState?.step)`, but since the July 2026 link-handoff change nothing writes `bookingFlowState` (and lingering values are cleared), so the exemption can no longer trigger and the limit effectively always applies. The check can be removed together with the dead state-machine code.

19. **Conversation status `appointment_booked` vs `lead_captured`** — After booking, status is `appointment_booked`. In lead flow (no calendar), status is `lead_captured`. Both statuses receive limited AI responses: only appointment-related questions get answered; other messages get "You're welcome! Call us if you need anything."

20. **`callConnected` prevents duplicate SMS** — When a forwarding call connects (`callConnected=true`), `sendMissedCallSMS()` skips SMS. The check is: `if (conversation.callConnected && durationSeconds > 5)`. The >5s guard prevents triggering on connections that immediately dropped.

21. **AI phone verification must use `conversation.callerPhone`, not `business.forwardingNumber`** — Both system prompts in `generateAIResponse()` contain `business.forwardingNumber` (labeled "Owner's business line") in the BUSINESS INFO section. Without an explicit anchor, the AI would quote that number when verifying the customer's callback number (confirmed in production: customers were asked "Is +1XXXXXXXXXX the best number?" where the number was the owner's). The fix: `conversation.callerPhone` is injected into a `CRITICAL` block at the top of each prompt and again inline in the phone-verification rule. Do NOT remove these CRITICAL blocks or rename the forwardingNumber label back to `- Phone:` without understanding this interaction.

### React / Component Architecture

28. **Define sub-components at module scope, not inside parent components** — Defining a component function inside another component (e.g. `function ConvoCard() {}` inside `ConversationsClient`) causes React to treat it as a new component type on every render, destroying and remounting its subtree instead of reconciling. Always define helper components at module scope and pass state down as props. Established examples: `ConvoCard`, `ThreadBody`, `EmptyState` in `ConversationsClient.tsx`; `FeatureIcons` in `ClientTable.tsx`.

29. **Mobile-first responsive pattern for list/detail views** — When a page has a list + detail pane, use the `mobileChatOpen` boolean pattern (established in `MessagesClient.tsx` and followed in `ConversationsClient.tsx`): single `boolean` state; show list OR detail, never both stacked. Desktop uses a CSS grid split-pane (`md:grid-cols-5`) and the boolean is irrelevant. Tab bars that could overflow on mobile should use `overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]` with `whitespace-nowrap flex-shrink-0` on each tab.

### 10DLC / SMS Compliance

21. **10DLC registration required** — For US business SMS at scale, all Telnyx numbers must be registered under a 10DLC campaign. Without registration, carriers may block or rate-limit messages. Required fields for registration: business name, EIN, business type, use case (marketing/transactional), sample message content. This is done in the Telnyx portal, not in code.

22. **STOP/unsubscribe is legally required** — The `message.received` handler checks for STOP, UNSUBSCRIBE, CANCEL, QUIT and immediately sends an opt-out acknowledgment. Do NOT remove this check. It's required by TCPA and carrier policies.

### Email Notifications

23. **`SMTP_USER`/`SMTP_PASS` missing = silent email failure** — `getTransporter()` throws if these env vars are missing, but callers catch the error with `try/catch`. The notification function returns without sending email. No error is surfaced to the user. Always verify SMTP vars are set before going to production.

24. **Gmail SMTP requires App Password, not account password** — `SMTP_PASS` must be a Gmail App Password (16-char code from Google Account security settings). Regular Gmail passwords do not work with SMTP.

25. **Emails send from `SMTP_FROM` or `SMTP_USER`** — Owner notification emails come from whichever Gmail account is configured, not from an Align and Acquire branded address. Voicemail Resend emails send from `notifications@alignandacquire.com`.

### Next.js Config

26. **`X-Frame-Options: ALLOWALL` on ALL routes** — `next.config.js` sets this globally. This means every page, including the dashboard, can be iframed by any website. This is intentional (for the `/book` embed feature) but is a security trade-off. Do not accidentally tighten this — it would break the embed feature.

27. **Server Actions body size limit is 2MB** — Set in `next.config.js` under `experimental.serverActions.bodySizeLimit`. This affects file upload actions. Campaign image uploads are route handlers (not Server Actions) and use Vercel Blob directly, so they're not affected.

### Webhooks & Domains

30. **Every externally configured webhook or callback URL MUST use `https://www.alignandacquire.com` (with www)** — Vercel's primary domain is www; the bare apex returns a 308 permanent redirect at Vercel's edge, and webhook senders do NOT follow redirects — the POST gets a 308 back, is marked failed, retried, and dropped. Applies to the Telnyx Call Control voice webhook, the Telnyx Messaging Profile inbound webhook, failover URLs, and any third party that POSTs to this app. Bare-apex webhook URLs in the Telnyx portal caused a full platform outage (all clients simultaneously — one shared Call Control app serves every client number) that ran silently from late June until discovered July 7, 2026.

31. **Calls ring forever + empty Vercel logs = failure is upstream of the function** — The 308 happens at the edge before any function is invoked, so Vercel function logs show NOTHING (`answer()` never fires because `call.initiated` never reaches the app). When you see this signature, suspect an edge redirect, deployment protection, or DNS — not app code. Check the Telnyx Debugging tab first: it logs every delivery attempt with the exact response code (the July 2026 outage showed failed deliveries with response code 308).

32. **Client site configs must use the www URL for `/api/contact`** — Client sites POST cross-origin to `/api/contact`. A `site.config.ts` pointing at the bare domain fails the CORS preflight against the 308 → silent website-lead loss. Always use `https://www.alignandacquire.com` in client site configs.

    - `GET /api/verify-slug?slug=…` exists solely for AA-Template's build gate (`scripts/verify.ts` check 3), which refuses to pass until the slug in a client `site.config.ts` resolves to a real `Business` row: 200 `{ ok: true }`, 404 `{ ok: false }`, 400 `{ ok: false, error: 'bad slug' }`, `Cache-Control: no-store`, and no business data in any response. Public and unauthenticated for the same reason `/api/contact` is; do not add fields to it.

33. **No alerting on webhook delivery failure** — The July 2026 outage was discovered by a client complaint, not monitoring. A dead-man's-switch check (daily "was any Conversation created in the last 24h?" → alert Jacob if not) is planned but not built.

### Owner Groups

34. **The grouped Google Ads GET displays snapshots by group membership, NOT by member flags** — `/api/dashboard/google-ads` queries `GoogleAdsSnapshot` for every business in the owner group regardless of each sibling's `googleAdsEnabled` flag (only the primary's flag gates the 403). Toggling a sibling's `googleAdsEnabled` off stops the *sync loop* from refreshing its data but does NOT remove its existing snapshots from the group view. To remove a site from a group view, clear its `ownerGroupId` (or delete its snapshots) — do not expect the flag toggle to do it.

35. **Ungrouped responses are byte-for-byte unchanged** — For a business with `ownerGroupId = null` (or a singleton group), the website-leads and google-ads responses contain NO new fields (`isGroup`, `perSite`, `businessName` are all absent, campaign map keys unchanged) and the clients render today's exact JSX. The new fields appear only when group size > 1. Preserve this when touching these routes: it's the compatibility guarantee for every existing client.

### Spam Hardening

36. **`WebsiteLead(status='spam')` is excluded from all dashboard queries** — `/api/dashboard/website-leads` and `/api/dashboard/analytics` both filter `status: { not: 'spam' }`. Admin/Neon access is intentionally unfiltered so Jacob can audit spam volume. If you add a new query on `WebsiteLead` for client-facing surfaces, add the same filter.

37. **`TURNSTILE_ENFORCE` was a platform-wide kill switch and its auto-condemn branch has been removed.** A **missing** token is now worth nothing at all; only an explicit siteverify `success:false` contributes score (`SPAM_WEIGHTS.TURNSTILE_FAILED`, 25), which on its own can never condemn. Siteverify network failures and a missing `TURNSTILE_SECRET_KEY` both fail open — never lose a real lead to a Cloudflare outage.

> **Do not set `TURNSTILE_ENFORCE=true`.** No form on the platform or on any client site emits a Turnstile token, and no Turnstile widget script is deployed anywhere. `TURNSTILE_SECRET_KEY` and `TURNSTILE_ENFORCE` are both absent from Vercel production. Setting `TURNSTILE_ENFORCE=true` today would mark **every real lead from every client** as spam and suppress **all** owner notifications platform-wide. It may only be enabled after a Turnstile widget is confirmed live on every form that POSTs to `/api/contact` — including the client-site repos, which deploy independently of this one.

### Client-Side Tags

38. **Never verify a client-side tag by grepping the served HTML.** `MetaPixel` renders a `next/script` with `strategy="afterInteractive"` from inside a client component, so the snippet lands in the layout JS chunk (`/_next/static/chunks/app/layout-*.js`), never in the HTML document. A clean HTML grep is the expected result for a perfectly healthy pixel. `.env.local` is equally useless as evidence: it is gitignored and never deployed. To verify, grep the layout chunk, run `vercel env ls production`, and check an older deployment before declaring an outage. A 2026-08-21 audit declared a full pixel outage on exactly these two invalid tests when the pixel had been live since 2026-05-30. See `docs/pixel-record-correction.md`.

### Contact Form Spam Scoring

39. **No submission is ever silently dropped, and this is the system's most important invariant.** Every `/api/contact` request writes a `WebsiteLead` row — spam included. A high score suppresses the *notification*, never the *record*. Both historical silent-drop paths were closed in Aug 2026: marketing-path spam (which logged and returned 200 with no DB write) now persists against the marketing business, and business-not-found now alerts. If you add a branch to this route, it must write a row or alert before returning.

40. **The dropped-lead alert is throttled per lambda instance, on purpose.** `/api/contact` cannot write a `WebsiteLead` when the `businessSlug` resolves to nothing — there is no valid FK — so it emails the full payload to `YOUR_EMAIL` instead. The throttle is a module-scope `Map` keyed on the failed reference, one alert per hour, with an occurrence count in the body. On Vercel that is **per lambda instance and therefore approximate**: several instances can each send a first alert for the same slug. That is the intended trade — the goal is to stop a bot hammering a bad slug from burying the signal, not exactly-once delivery. A typo'd slug in a client `site.config.ts` loses 100% of that site's leads, so this alert must never be removed without a replacement.

41. **`spamScore = null` is not the same as `spamScore = 0`.** Null means the row predates scoring (Aug 2026); 0 means it was scored and cleared every signal. This is why the column has no default. `/api/admin/spam-leads` selects `status='spam' OR spamScore != null` specifically to include clean scored rows — a view showing only condemned rows can never surface a real lead that scored 85 and got through, which is the row that proves the weights are drifting.

42. **Never verify the honeypot by reading this repo alone.** `app/components/ContactForm.tsx` is the only form here that emits `hp_7d3a_ref`. Every client tenant site (e.g. `Clients/Brett Master Gardner/Brett Website/components/ContactForm.tsx`) is a **separate repo with a separate deploy** and emits no honeypot at all. The observed bots also replay the real form payload, so they will learn to send the field. The scoring design deliberately does not lean on the honeypot — content signals (b)–(f) condemn all four observed samples without it.

---

---

## 14. Google Ads Integration

### Overview

Optional per-business Google Ads dashboard integration. When enabled, syncs campaign-level performance metrics from the Google Ads API into `GoogleAdsSnapshot` records and renders them on a dedicated `/dashboard/ads` page with summary cards, a daily trend chart (recharts), and a campaign breakdown table.

### New Business Fields

```
googleAdsCustomerId   String?                         // Google Ads customer ID (no dashes, e.g. "1234567890")
googleAdsEnabled      Boolean   @default(false)       // Show Google Ads tab in dashboard sidebar
googleAdsTabLabel     String?   @default("Google Ads") // Custom label for the nav item (e.g. "Ad Performance")
```

- Set `googleAdsEnabled=true` AND `googleAdsCustomerId` to activate for a business
- `googleAdsTabLabel` allows per-business nav item customization

### `GoogleAdsSnapshot` Model

```
id                String   @id @default(cuid())
businessId        String
date              DateTime                // Reporting date (start of day UTC)
campaignId        String                  // Google Ads campaign ID
campaignName      String                  // Campaign name at time of sync
impressions       Int      @default(0)
clicks            Int      @default(0)
cost              Float    @default(0)    // USD (from cost_micros / 1_000_000)
conversions       Float    @default(0)
ctr               Float    @default(0)    // Click-through rate (0.0–1.0)
costPerConversion Float?                  // null if 0 conversions

@@unique([businessId, campaignId, date])  // Upsert key — prevents duplicates
@@index([businessId, date])
```

### Environment Variables (Google Ads)

| Variable | Purpose |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token from Google Ads API Center |
| `GOOGLE_ADS_CLIENT_ID` | OAuth2 client ID (from Google Cloud Console) |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | OAuth2 refresh token (generated once via OAuth consent) |
| `GOOGLE_ADS_MCC_ID` | Manager (MCC) account ID — used as `login_customer_id` for accessing child accounts |

### `lib/google-ads.ts`

```typescript
getGoogleAdsClient(): GoogleAdsApi
// Singleton. Uses GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET.

syncGoogleAdsData(businessId: string, startDate?: string, endDate?: string): Promise<{ rowsSynced, errors }>
// Queries Google Ads GAQL for campaign metrics within date range (default last 30 days).
// Uses business.googleAdsCustomerId + GOOGLE_ADS_REFRESH_TOKEN + GOOGLE_ADS_MCC_ID.
// Converts cost_micros to dollars (÷ 1,000,000).
// Upserts into GoogleAdsSnapshot using (businessId, campaignId, date) unique constraint.

syncAllBusinessAds(): Promise<{ synced, errors }>
// Finds all businesses with googleAdsEnabled=true AND googleAdsCustomerId set.
// Calls syncGoogleAdsData for each. Aggregates results.
```

### New API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/google-ads/sync` | POST | Admin only | Sync Google Ads data. Body: `{ businessId?: string }`. If businessId provided, syncs one; otherwise syncs all enabled businesses. Returns `{ synced, errors }`. |
| `/api/dashboard/google-ads` | GET | `requireDashboardBusiness()` | Returns aggregated ad data. Query: `startDate`, `endDate`, `groupBy` (day\|campaign). Returns `{ totals, daily, campaigns, lastSyncedAt }`. Default: last 30 days. `lastSyncedAt` is the most recent `createdAt` across all snapshots in range. **Owner groups:** snapshots for ALL group businesses; `totals`/`daily` summed across the group; campaign rows keyed `businessId:campaignId` (so equal campaign ids from different Ads accounts can't merge) and tagged `businessName`; response adds `isGroup: true` + `perSite: [{ businessId, name, spend, clicks, conversions }]` (zero-data members included, sorted by spend). Ungrouped: today's exact shape, no new fields. |
| `/api/dashboard/google-ads/sync` | POST | `requireDashboardBusiness()` | Triggers Google Ads sync. 403 if primary's `!googleAdsEnabled`. Ungrouped: requires `googleAdsCustomerId` (400 otherwise), syncs that business. **Owner groups:** loops members with `googleAdsEnabled && googleAdsCustomerId`; members missing a customer ID (including the primary) are skipped, not errors; 400 only if NO member is syncable; per-member try/catch so one failed account doesn't abort the rest; aggregates `rowsSynced`, errors prefixed with business name. Returns `{ success, rowsSynced, errors, lastSyncedAt }`. |

### Dashboard Page: `/dashboard/ads`

**Files:**
- `app/(dashboard)/dashboard/ads/page.tsx` — server component wrapper
- `app/(dashboard)/dashboard/ads/AdsClient.tsx` — client component with all UI

**Features:**
- Date range picker: Last 7 Days, Last 30 Days, Last 90 Days, Custom
- "Refresh Data" button (RefreshCw icon, spins while syncing): POSTs to `/api/dashboard/google-ads/sync`, then refetches dashboard data
- "Last updated: [relative time]" label next to refresh button — uses most recent snapshot `createdAt` from GET response, updates to current time after manual refresh
- 6 summary cards: Total Spend, Total Clicks, Impressions, Avg CTR, Conversions, Cost/Conversion
- Daily trend line chart (recharts): dual-axis with Spend (left, $) and Clicks (right)
- Campaign breakdown table: campaign name, impressions, clicks, CTR, spend, conversions, cost/conversion
- **Owner groups only** (`isGroup` in response): a compact "By Site" summary strip (name, spend, clicks, conversions per site) above the campaign table, and a gray site pill next to the campaign name in each row. Both are behind `data.isGroup && ...` conditionals — ungrouped businesses render exactly as before.
- Empty state: "No ad data available yet. Data syncs daily."

**Sidebar nav item:**
- Only rendered when `business.googleAdsEnabled === true`
- Label: `business.googleAdsTabLabel` or "Google Ads"
- Icon: `Megaphone` from lucide-react
- Route: `/dashboard/ads`
- Inserted before Settings in the nav list

### Dependencies Added

- `google-ads-api` — Google Ads API client for Node.js
- `recharts` — React charting library for the daily trend chart

---

## 15. Admin Dashboard

### Overview

Super-admin panel at `/admin` — only accessible when `userId == ADMIN_USER_ID`. Provides a bird's-eye view of all client businesses plus a slide-out detail panel for managing each client.

**Access:** Clerk auth required. Route handler checks `userId !== ADMIN_USER_ID → 403`. Not in middleware — check is per-route.

**Reaching `/admin` and leaving it (Sept 2026):** the client dashboard sidebar shows an "Admin" item (lucide `ShieldCheck`, after Settings) only when the signed-in Clerk user is `ADMIN_USER_ID` — `isAdmin` is computed in `app/(dashboard)/layout.tsx` and passed to `DashboardShellClient`. The admin header's `← Dashboard` link is `/api/admin/view-as?exit=1&next=dashboard`, so it clears any `adminViewAs` cookie on the way out (see §11).

**The admin User row points at Align and Acquire.** `User.clerkId = ADMIN_USER_ID` (jacobholtzer22@gmail.com) has `businessId = cmmpd4fya0000jl04w8brdpvb` ("Align and Acquire", the `MARKETING_BUSINESS_ID` row that receives every alignandacquire.com website lead, marketing-line conversation, and `/book` appointment). Repointed 2026-09-08 from "Test Business" (`cmlztu4yc0000i6040it1mtrb`), so signing in as the admin lands on the real business at `/dashboard` without view-as. **Test Business is intentionally orphaned** (zero Users): its row was not modified and must not be deleted — it still hosts a live public `/book/test-business-1771890470291` link. Align and Acquire has two Users: this one and jacob@alignandacquire.com.

**Mobile:** The admin dashboard is designed to be used on a phone. All components are responsive — see mobile notes below.

### Files

Reorganized Sept 2026 (`admin-ui-reorg` branch, on top of the `admin-stats-layer` data work). The page answers "which accounts need me today" first: an alerts list, a fleet line, then health-sorted client cards. Presentation only — every number comes from `getAdminBusinesses()` (`stats` / `health` / `alerts`, see "Stats layer" below); the UI adds no queries. Deleted in the reorg: `HeaderKPIs.tsx` (KPI strip) and `ClientTable.tsx` (desktop table + mobile list).

| File | Purpose |
|---|---|
| `app/admin/page.tsx` | Server shell: auth check, reads the `adminShowRevenue` cookie, calls `getAdminBusinesses()`, renders `<AdminClient initialBusinesses initialShowRevenue />` |
| `app/admin/AdminClient.tsx` | Main client component. Header: "Admin", revenue eye toggle (+ "MRR $x" beside it only when on), `<AdminTools>`, `← Dashboard`. Body: `<AlertsPanel>`, `<FleetLine>`, controls (search on name/phone/businessType; sort Health / Last activity / Name / Missed calls / Web leads; chips All / Needs attention / Phone / Web only / Ads; "Show canceled" checkbox, canceled hidden by default), `<ClientGrid>`, `<ClientDetailPanel>`, toast stack. Health sort = red, yellow, green, gray, then `lastActivityAt` desc with nulls last. `openPanel()` bumps `openKey` so re-opening a client resets the panel to the Health tab. |
| `app/admin/ui.tsx` | Shared module-scope primitives: `STATUS_COLORS`, `STATUS_LABELS`, `StatusPill`, `HealthDot` (emerald-400 / amber-400 / red-500 / gray-500), `FeatureIcons` (**active features only**; renders nothing for a web-only client), `Age` (compact relative age `now/12m/3h/2d/5w/3mo/never`, full timestamp in `title`), `Stat` (number + label pair used in every funnel row), `formatAge()`. |
| `app/admin/AlertsPanel.tsx` | `AlertsPanel`: zero fleet alerts → one line "All clients healthy"; else "N need attention" + a list sorted red, yellow, then name. Each row = health dot, name, every alert message on its own line; tapping opens the detail panel on Health. Canceled businesses excluded. `FleetLine`: client count + this month's `missedCallsMonth` / `textbacksMonth` / `capturedMonth` / `webLeadsMonth` totals, no card chrome. |
| `app/admin/ClientCard.tsx` | One card for all widths. Rows appear only when relevant (`hasPhone = Boolean(telnyxPhoneNumber)`, `features = getBusinessFeatures(biz)`; never gated on `missedCallAiEnabled` alone): header (dot, wrapping name, status pill, `Age` of `lastActivityAt` + `lastActivityKind` icon); identity (mono phone or "Web only", `FeatureIcons`); funnel Missed/Texted/Replied/Captured when `hasPhone && hasMissedCallAi` (+ red "n failed" when `failedSms7d > 0`); Blocked/Passed when `hasAnyScreening`; "n web leads, last {age}" when web-only or `webLeadsMonth > 0`; Booked when `hasCalendar` or any booking; ads row when `googleAdsEnabled` (spend only with revenue on, else clicks); amber "n need a human, n went quiet"; 44px View-as (Eye) + Conversations (MessageSquare) buttons with `stopPropagation`; `$fee/mo` bottom-right only with revenue on. Whole card is a `role="button"` (Enter/Space open the panel). |
| `app/admin/ClientGrid.tsx` | `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. Empty filter result: "No clients match. Clear the filter." with a clear button. |
| `app/admin/ClientDetailPanel.tsx` | Slide-out, `w-full sm:w-[520px] lg:w-[600px]`. Header stacks: name on its own line (wraps, no truncate), then status pill + "View as client" + close, all 44px. Four tabs, **Health first and default**: Health, Toggles, Settings, Tools. Threads `showRevenue` to Health and Settings. |
| `app/admin/ClientDetailPanel/HealthTab.tsx` | Read-only, props only, no fetch. Sections: Alerts (or "No alerts"), Activity (last call / screened call / message / web lead as `Age`), This month (funnel + screening with the card's gating, web leads, Booked split website/text, need-a-human/went-quiet), Skipped texts (cooldown / existing contact / blocked), Delivery last 7 days ("n failed of m finalized"), Telnyx (cost this month — revenue-gated — and last usage record age), Ads last 30 days ("Google Ads not enabled" / "No ad data in 30 days" / spend-clicks-conversions-last synced; spend revenue-gated). |
| `app/admin/ClientDetailPanel/TogglesTab.tsx` | Toggle rows for all feature flags: MissedCall AI, known-contact voicemail, No-Reply Alerts (+ minutes), Call Screener (+ IVR message), Spam Filter, Online Booking, SMS Auto-Booking, Google Calendar (read-only status), Google Ads, Notify by SMS/Email, Mass Outreach. `px-4 sm:px-6` padding. Unchanged in the reorg. |
| `app/admin/ClientDetailPanel/SettingsTab.tsx` | Editable fields: fees, Telnyx number, notification sender, forwarding number, AI config, timezone, booking copy, `ownerGroupId` (Admin Only section — blank clears the group). Takes `showRevenue`; the Setup Fee / Monthly Fee inputs render only when it is on, otherwise "Revenue hidden. Use the eye icon in the header to show it." |
| `app/admin/ClientDetailPanel/ToolsTab.tsx` | Per-business tools: conversations link, screened-calls summary, bulk import contacts, blocked numbers, voicemails via view-as. `px-4 sm:px-6` padding. Unchanged in the reorg. |
| `app/admin/AdminTools.tsx` | Admin-level tools dropdown (Refresh table, Telnyx usage sync, Google Ads sync, Sheets sync, Excel export, and links to `/admin/spam`, `/admin/marketing`, `/admin/arms`, `/admin/leads`) |
| `app/admin/spam/page.tsx` | Cross-tenant scored-submission audit view. **Read only, no mutations.** See §17 |
| `app/admin/types.ts` | `AdminBusiness` — all Business fields plus `_count`, the legacy computed fields, and `stats: AdminStats`, `health: AdminHealth`, `alerts: AdminAlert[]`. `AdminStats` is declared here; `AdminHealth` / `AdminAlert` / `AdminAlertCode` are re-exported from `lib/admin-health.ts`. |
| `app/admin/components/CallScreenerCard.tsx` | Imported nowhere (dead); left untouched. |

**Revenue toggle.** Every dollar figure under `app/admin` is behind `showRevenue`, default **off**. State lives in `AdminClient`; persisted in the cookie `adminShowRevenue=1` (`path=/; max-age=31536000`, cleared with `max-age=0`) and read server-side in `page.tsx` so the first paint is already correct. When on: header "MRR $x" (active + past_due `monthlyFee` sum), card fee, Health-tab Telnyx cost and ad spend, Settings-tab fee inputs. When off none of those render — `grep -rn '\$' app/admin --include='*.tsx'` should show no unguarded dollar render.

**Design rules (keep):** dark shell only (`bg-gray-950`, `bg-gray-900` surfaces with `border-gray-800`, blue-500 focus/active), containers `rounded-lg`, pills `rounded-full`, no shadows/gradients/entrance animations, no all-caps eyebrow labels, no middle-dot data strings (use commas or separate lines), numbers in Inter with `tabular-nums` (mono is for the phone number only), every mobile tap target ≥ 44px with a visible `focus-visible` ring.

### `app/api/admin/businesses/route.ts` — enriched list

Returns each business with:
- All Business model fields
- `_count` with `conversations`, `appointments`, `users`, `screenedCalls`, `blockedCalls30d`
- Computed server-side: `conversationsThisMonth`, `conversationsLastMonth`, `leadsThisMonth`, `conversationsAllTime`, `leadsAllTime`

Stats are computed via Prisma `_count` with date filters (current calendar month, all-time).

### `app/api/admin/businesses/[id]/route.ts` — PATCH

`allowedFields` array includes all business configuration fields including:
- `massMessagingEnabled` — unlock outreach features
- `smsCooldownDays` — per-business SMS cooldown override
- `googleAdsEnabled`, `googleAdsCustomerId`, `googleAdsTabLabel`
- `ownerGroupId` — owner-group membership (see §4/§10)
- All toggles, fees, phone numbers, AI config

Special processing:
- `telnyxPhoneNumber` → normalized to E.164 via `normalizeToE164()`
- `notificationSenderNumber` → normalized to E.164 via `normalizeToE164()` (blank saves as `null`), then **the only cross-business validation in this route**: if the normalized value matches ANY business's `telnyxPhoneNumber`, the request is rejected `400 { error: 'That number is a client Telnyx number (<name>). Owner replies would route into their AI flow. Pick a dedicated number.' }` — returned BEFORE `db.business.update`, so nothing is written. Two businesses sharing the same `notificationSenderNumber` is expected and NOT rejected. Self-collision (setting a business's own Telnyx number) is also rejected, harmlessly — `resolveOwnerSmsFrom` already prefers `telnyxPhoneNumber`. The `NOTIFICATIONS_TELNYX_NUMBER` env var bypasses this check entirely (no runtime validation — verify by hand). Edited in SettingsTab as "Notification Sender (fallback)", directly under Telnyx Phone
- `cooldownBypassNumbers` → parsed from comma-separated string or array → normalized E.164 array
- `ownerGroupId` → trimmed; empty/whitespace-only (or non-string) saves as `null` (clears the group). The text input lives in SettingsTab's "Admin Only" section — to group N businesses, type the same value into each business's panel (no bulk-apply tool).

### `AdminBusiness` type (`app/admin/types.ts`)

Extends all standard Business fields with:
```typescript
_count: {
  conversations: number
  appointments: number
  users: number
  screenedCalls: number
  blockedCalls30d: number
}
conversationsThisMonth: number
conversationsLastMonth: number
leadsThisMonth: number
conversationsAllTime: number
leadsAllTime: number
```

### Toggle architecture in `TogglesTab.tsx`

Each toggle calls `patch(field, !currentValue, label)` which:
1. Optimistically updates local state
2. PATCH `/api/admin/businesses/{id}` with `{ [field]: value }`
3. On success: merges DB response back (preserves `_count` and computed stats from original)
4. On failure: reverts to original state + shows error toast

The `callScreenerMessage` and `forwardingNumber` have inline edit flows (text input + Save/Cancel) rather than simple toggles.

### Stats layer — `lib/admin-stats.ts` (Sept 2026, `admin-stats-layer` branch)

`getAdminBusinesses(): Promise<AdminBusiness[]>` is the **single source** for the admin business list. Both `app/admin/page.tsx` (initial SSR) and `GET /api/admin/businesses` (manual "Refresh Table") call it; the two inline copies that used to live in each are gone. It returns every raw Business column (with `createdAt`/`updatedAt` serialized to ISO strings), the legacy computed fields (`conversationsThisMonth`, `conversationsLastMonth`, `leadsThisMonth`, `conversationsAllTime`, `leadsAllTime`, `_count.blockedCalls30d` — unchanged), plus `stats: AdminStats`, `health: AdminHealth`, `alerts: AdminAlert[]`.

- **Query cost is constant in N.** Every stat is one cross-tenant `groupBy` (or one `$queryRaw` for the SMS join, since `Message` has no `businessId`), all inside a single `Promise.all`. Measured 2026-09-07: 21 businesses → **23 SQL statements, ~740 ms** against Neon. Never add a per-business loop here.
- **Windows are UTC, computed once at the top:** `monthStart` = first of the current calendar month (`Date.UTC`), `d7`/`d30` = now − N days, `h48` = now − 48 h. Business timezone is deliberately not applied (a per-row TZ groupBy would need raw SQL).
- **Definitions that matter:** a *missed call* is `callSid NOT NULL AND callConnected=false AND status NOT IN (screening, screening_blocked)`; `textbacksMonth` counts *conversations* with an outbound message (campaign and manual sends reuse the missed-call conversation row, so counting messages would overstate); `failedSms7d` keys on `telnyxStatus='delivery_failed'` (the value Telnyx actually writes — `'failed'` never appears); `webLeadsMonth`/`lastWebLeadAt` exclude `status IN ('spam','partial')`; `stalled` mirrors `lib/conversation-buckets.ts` (closed first, then inbound-exists, then 48 h) and is capped at 30 days; `ads30d` reads existing `GoogleAdsSnapshot` rows only. Missing groupBy rows are `0` / `null`, never `undefined`.
- `AdminStats` lives in `app/admin/types.ts`; `AdminHealth`/`AdminAlert` are re-exported there from `lib/admin-health.ts`. `TogglesTab`/`SettingsTab` merge-back spreads preserve `stats`/`health`/`alerts` (they spread the original row before the PATCH response).

### Health rules — `lib/admin-health.ts`

Pure functions, no DB, no imports from `app/`. `computeAlerts(row, now)` → `AdminAlert[]`; `computeHealth(alerts, subscriptionStatus)` → `'green' | 'yellow' | 'red' | 'gray'`. Called at the end of `getAdminBusinesses()`.

Derived flags (internal): `hasPhone = Boolean(telnyxPhoneNumber)`; `isPhoneClient = hasPhone && (missedCallAiEnabled !== false || callScreenerEnabled || spamFilterEnabled)`; `isWebOnly = !hasPhone`. **Never gate on `missedCallAiEnabled` alone** — its default is `true`, so every web-only row has it on. `subscriptionStatus === 'canceled'` → no alerts, health `'gray'`.

| Code | Severity | Fires when |
|---|---|---|
| `sms_failing` | red | `hasPhone && failedSms7d >= smsFailMin && failedSms7d >= smsFailRate × finalizedSms7d` |
| `past_due` | red | `subscriptionStatus === 'past_due'` |
| `calendar_disconnected` | yellow | `calendarEnabled && !googleCalendarConnected` |
| `no_owner_contact` | yellow | `isPhoneClient && missedCallAiEnabled !== false && !ownerPhone && !forwardingNumber && !ownerEmail` |
| `inactive` | yellow | `subscriptionStatus === 'active'` AND (`isPhoneClient` with `lastActivityAt` null or > `inactivePhoneDays`) OR (`isWebOnly` with `lastWebLeadAt` null or > `inactiveWebDays`). Trialing rows never fire this. |
| `human_needed` | yellow | `stats.humanNeeded > 0` |
| `usage_stale` | yellow | `hasPhone && (telnyxLastRecordAt null OR > usageStaleDays)` |

Health: any red → `red`; else any yellow → `yellow`; else `green`. `HEALTH_THRESHOLDS = { smsFailMin: 2, smsFailRate: 0.5, inactivePhoneDays: 14, inactiveWebDays: 30, usageStaleDays: 3 }` — tune there, not in the rules. Messages are short and specific (`"3 of 4 texts failed in 7d"`, `"No calls or texts in 21 days"`). As of 2026-09-07 the UI does not yet render `stats`/`health`/`alerts`; that is Phase 1B.

---

## 16. SEO Architecture

Implemented on the `seo-foundation` branch (July 2026). Everything below applies to the public marketing site only — dashboard/admin/API surfaces are noindexed and excluded.

### Per-page metadata pattern

- **Root layout (`app/layout.tsx`)** sets `metadataBase: new URL('https://www.alignandacquire.com')`, the title template `{ default: 'Align and Acquire', template: '%s | Align and Acquire' }`, and sitewide `openGraph` + `twitter` (`summary_large_image`) blocks. No og image is listed there — it comes from the file convention (below).
- **Server-component pages** export `const metadata` directly with a unique title (formatted by the template), a 140–160 char description, and `alternates: { canonical: './' }` (self-referencing, resolved against `metadataBase`).
- **Client-component pages cannot export metadata.** They get a metadata-only segment `layout.tsx` instead: `app/about/layout.tsx`, `app/pricing/layout.tsx`, `app/missedcall-ai/layout.tsx`, `app/campaigns/layout.tsx`, `app/book/layout.tsx`. Keep new marketing pages server-side where possible; if a page must be `'use client'`, follow this layout pattern.
- **Absolute titles (bypass the template):**
  - `/` — `Align and Acquire | Missed Call Text Back Service` (brand first on purpose: the homepage owns the branded SERP; `/missedcall-ai` keeps the keyword-first title; kept under ~60 chars for Google's display cutoff).
  - `/book/[businessSlug]` — `generateMetadata` in that segment's **layout** (the page is `'use client'`) queries the DB by slug and returns `Book a Quote with {business.name}` as an absolute title (client-tenant pages must not carry the "| Align and Acquire" suffix), plus a tenant description and an explicit `/book/{slug}` canonical.
- **Shared `DESCRIPTION` consts:** on pages that also carry Service JSON-LD (`/spam-screening`, `/websites`, `/ads-management`) and in `app/missedcall-ai/layout.tsx`, the meta description and the schema `description` reference one const so they cannot drift. Edit the const, never just one copy.

### sitemap.ts / robots.ts

- `app/sitemap.ts` lists ONLY the static public marketing routes: `/`, `/pricing`, `/services`, `/missedcall-ai`, `/spam-screening`, `/websites`, `/ads-management`, `/campaigns`, `/about`, `/book`, `/privacy`, `/terms`. Tenant `/book/[slug]` pages, `/demo-requested`, and all dashboard/admin/api/auth/onboarding routes are intentionally excluded.
- `app/robots.ts` allows `/` for all agents, disallows `/dashboard`, `/admin`, `/api`, `/onboarding`, `/sign-in`, `/sign-up`, and references `https://www.alignandacquire.com/sitemap.xml`. **`/demo-requested` must NOT be added to the disallow list** — it is noindexed via meta robots, and robots-blocking it would prevent crawlers from ever reading that directive.

### opengraph-image.tsx

- `app/opengraph-image.tsx` generates the sitewide 1200×630 og:image via `ImageResponse` (`next/og`). Text-only on purpose — Satori is fragile with embedded image assets. Palette mirrors the marketing pages (#16181C / #F2F0EB / #EE6B1A). `twitter:image` inherits it automatically.
- The route URL carries a per-deploy build hash — never hard-code it anywhere that needs a stable URL (schema uses `/aa-logo.png` instead).

### Structured data (JSON-LD)

- **`app/components/JsonLd.tsx`** — server component that renders `<script type="application/ld+json">` with `<` escaped to `\u003c`. All schema goes through it.
- **`ProfessionalService`** node in the root layout (every page): `@id` `https://www.alignandacquire.com/#business`, name `Align and Acquire`, telephone `+15175809709`, `areaServed: ["Michigan", "Texas", "Indiana", "New York", "United States"]`, logo/image = stable `https://www.alignandacquire.com/aa-logo.png`. **No `address` property anywhere** — the GBP is a service-area business with no displayed address. No `sameAs` (add only real profile URLs).
- **`Service`** nodes: in `app/missedcall-ai/layout.tsx` and inline in the `/spam-screening`, `/websites`, `/ads-management` pages. Each has name, serviceType, description (the shared const), and `provider: { "@id": ".../#business" }`.
- **`FAQPage`** node in `app/missedcall-ai/layout.tsx`, mirroring the six `FAQItem` entries in `app/missedcall-ai/page.tsx` VERBATIM. ⚠️ **If the FAQ copy on the page changes, the schema in the layout must be updated in the same commit — there is no shared source, and they silently desync otherwise.**
- **Never add Review, AggregateRating, or star-rating schema.** Self-serving review markup violates Google guidelines.

### NAP — must match the Google Business Profile exactly

- GBP name: `Align and Acquire` (with "and" — the "&" is wordmark-only). GBP phone: `+15175809709`, displayed as `(517) 580-9709`.
- The NAP lives in two places that must stay in sync with the GBP character-for-character: the `ProfessionalService` schema (root layout) and the `BrandFooter` bottom bar (`© {year} Align and Acquire · Serving Michigan, Texas, Indiana, and New York · (517) 580-9709`, phone as a `tel:+15175809709` link). `BrandFooter` renders on all marketing pages including `/privacy` and `/terms`.
- If the GBP name, phone, or service area ever changes, update schema + footer together.

### Noindex list (`robots: { index: false, follow: false }`)

- `app/(dashboard)/layout.tsx` (all dashboard pages)
- `app/admin/layout.tsx` (all admin pages)
- `app/onboarding/page.tsx`
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `app/book/[businessSlug]/embed/layout.tsx` (iframe embed; its canonical intentionally points at the parent booking page)
- `app/demo-requested/page.tsx` (post-form thank-you page)

### On-page rules

- Every public page has exactly ONE `<h1>`. The ROI calculator's internal heading (`app/components/roi-calculator.tsx`) is an `h3` — do not promote it back to `h2` (it used to stack under the page-level H2 on `/` and `/missedcall-ai`).
- `/missedcall-ai` carries the exact phrase "missed call text back" in its first H2 plus two body mentions (Instant response feature card, demo-form paragraph). Keep those when editing copy.

---

## 17. Contact Form Spam Scoring

Added Aug 2026 on the `contact-spam-scoring` branch, after bot submissions reached client inboxes despite the existing honeypot + Turnstile hardening. Root cause: **neither check was operative.** No form on the platform or on any client site emitted a honeypot field or a Turnstile token, and `TURNSTILE_SECRET_KEY`/`TURNSTILE_ENFORCE` were absent from production — so `detectSpam()` returned `{isSpam:false}` for 100% of requests.

### The one rule

**A submission is never dropped.** Every `/api/contact` request writes a `WebsiteLead` row. A score at or above the threshold sets `status='spam'` and suppresses Contact creation and owner notification — it never discards the record. Silent lead loss is the worst failure mode in this system; see gotcha #39.

### Files

| File | Role |
|---|---|
| `lib/spam-score.ts` | `scoreSubmission()` — pure, synchronous, no DB/network. All weights exported as `SPAM_WEIGHTS`. Tune here, never in the route. |
| `lib/spam-constants.ts` | `HONEYPOT_FIELD` only. Dependency-free so the client form can import it without pulling server code into the browser bundle. |
| `lib/spam-velocity.ts` | `getVelocityCounts()` — the only DB-touching piece, kept separate so the scorer's tests need no database. |
| `lib/spam-score.test.ts` | 30 tests. `npm test` (`npx tsx --test`, Node's built-in runner, no new deps). |
| `app/api/admin/spam-leads/route.ts` | Read-only cross-tenant feed for the admin view. |
| `app/admin/spam/page.tsx` | `/admin/spam`, reached from the AdminTools dropdown. **Read only — no mutations.** |

### Signals and weights

Threshold `SPAM_SCORE_THRESHOLD`, default **100**, compared with **`>=`** (not `>`: a threshold should mean "at or above condemns", and with `>` a sample landing exactly on it would be delivered).

| Signal | Weight | Notes |
|---|---|---|
| Honeypot `hp_7d3a_ref` / `website` filled | 1000 | The **only** auto-condemn. Short-circuits everything else. |
| gmail/googlemail local part, 4+ dots | 60 | One inbox faking many identities. |
| …exactly 3 dots | **0** | Detector and reason code live at weight 0. "Start at 0, tune from admin view distribution." |
| Gibberish in `name` | 55 | |
| Gibberish in `message` | 35 | category cap **80** |
| Phone fails structural NANP | 40 | via `validateUsMobile()`; area-code list is a TODO, see below |
| Bare 7–11 digit run where prose belongs | 40 | **two** suppressions: phone field empty + run is valid, OR run equals the phone field |
| B2B solicitation phrase, strong | 40 ea | category cap **120** — 3 strong phrases condemn, 2 do not |
| B2B solicitation phrase, weak | 12 ea | all six weak phrases together = 72, still under threshold |
| Email local unrelated to name | 20 | **gated**: only scores when gmail-dots or gibberish already fired |
| Cross-tenant velocity (email / IP, 24h) | 30 / 60 | category cap **60** |
| Turnstile explicit `success:false` | 25 | never a *missing* token — see gotcha #37 |

**No single category cap reaches the threshold.** Condemnation always requires the honeypot, a 3+ phrase solicitation cluster, or two independent content categories agreeing.

### Things that will bite you if you tune this

- **The gibberish detector requires 2 of 3 conditions, not 1, and `y` counts as a vowel.** Both are load-bearing false-positive defenses. `Schmidt` has a 0.14 vowel ratio and a naive one-condition check condemns it; `Krzysztof` is only spared because `y` is a vowel. Both are regression-tested — if you "simplify" the rule, those tests fail. Do not bump them.
- **The design deliberately does not lean on the honeypot.** The observed bots replay the real form payload, so they will send whatever fields they saw, honeypot included. All four observed samples are condemned by content signals alone.
- **It also does not lean on gmail dots**, the cheapest thing for the operator to change. A regression test asserts all four samples still clear the threshold with that signal removed entirely (135/140/115/120).
- **B2B phrase normalization is load-bearing.** Lowercase, strip apostrophes, fold hyphens to spaces. Without it `"This isn't a sales call"` and `"It's a 20-minute demo"` both miss, dropping the observed solicitation bot from 5 phrase hits to 3 — its detection floor.
- **Detector (e) has two suppression rules and both matter.** It scores a bare digit run only when the customer is not plausibly giving their own number: suppressed if the phone field is empty and the run is valid, and suppressed if the run **equals** the phone field as bare digits. That equality rule is what separates real behaviour from the bots — a person repeating their number sends the *same* digits twice, while the observed bots send a *different* number in the message (sample 1: `2711934617` vs `9969063456`; sample 3: `5254356086` vs `7129221395`). Without it, a real customer with a dotted gmail that does not match their typed name, who filled the phone field and wrote "call me at &lt;same number&gt;", stacked to 60 + 20 + 40 = 120 and was condemned. Regression-tested.
- **TODO — assigned NANP area codes.** Sample phone numbers used area codes 271, 221 and 525: structurally legal but unassigned, so they pass today's check. Pull the official list from NANPA's "Geographic Area Code Number Report" CSV at `https://nationalnanpa.com/enas/geoAreaCodeNumberReport.do`. **Do not approximate it from memory — a wrong list rejects real customers.** Adding it later is a pure gain requiring no retuning.

### Headroom

The worst legitimate submission constructible against these weights (3-dot gmail, phone repeated in the message, "book a call") scores **52** — 48% headroom. Analysed real-customer cases all score 0–24: a one-word `"Aeration"` message, an address typed as digits with the phone field empty, a 2-dot gmail, the surnames Nguyen/Ng/Xu/Bhattacharya/Schmidt, and a property manager writing "our clients" and "book a call". Each is an explicit named test. **The legitimate-submission tests matter more than the spam ones** — a missed bot is an annoying email; a condemned real customer is a lost job for a client, and they never find out.

### Shadow-mode rollout

This endpoint is the sole lead funnel for every client, so scoring goes live in shadow mode first: **score and store everything, condemn nothing.**

1. **Deploy with `SPAM_SCORE_THRESHOLD=100000`.** Every submission is scored and every score, reason list, source IP and user agent is written to the `WebsiteLead` row. `verdict.isSpam` is `score >= threshold`, so at 100000 it is `false` for everything — including a filled honeypot, which is worth 1000. Nothing is condemned, no Contact creation is skipped, and **every owner SMS and email fires exactly as it does today**.
2. **Watch `/admin/spam` for one week** against real traffic. The default ≥ 70 filter shows the near misses in both directions; "All scored" shows the full distribution. This is the data for tuning `GMAIL_DOTS_3` (currently 0) and confirming no real client lead scores near 100.
3. **Then lower `SPAM_SCORE_THRESHOLD` to `100`.** Condemnation begins from that moment. Nothing else changes.

**The code path that guarantees step 1** (`app/api/contact/route.ts`): `verdict` is computed for every request; `leadFields` always carries `spamScore`/`spamReasons`/`sourceIp`/`userAgent`; the `if (verdict.isSpam)` branch is the *only* thing that skips `findOrCreateContact()` and `notifyOwnerOnWebsiteLead()`. When that branch is false, execution falls through to exactly the code that ran before this feature existed. `/api/admin/spam-leads` matches on `status='spam' OR spamScore != null`, which is why cleared rows still appear in the view.

⚠️ **`getSpamThreshold()` reads `process.env.SPAM_SCORE_THRESHOLD` on every call, not at module load** — so changing the value needs no code change. **But Vercel binds environment variables to a deployment**, so editing the variable in the dashboard does not affect functions already running. After changing it, trigger a redeploy (re-deploying the same commit from the Vercel dashboard is enough). The per-request read is what makes the *value* swappable; the redeploy is a platform requirement, not a code one.

### Auditing

`/admin/spam` lists scored submissions across all tenants, condemned and not, defaulting to score ≥ 70. It shows score, reason codes, full payload, source IP and user agent. Read only by design.

*This document reflects the codebase as of August 27, 2026 (contact form spam scoring). Update after any significant architectural changes.*

---

### Mobile Responsiveness Summary (as of May 2026)

The following dashboards are fully mobile-optimized (tested at < 640px):

| Area | Pattern |
|---|---|
| `/admin` client grid | One `ClientCard` for all widths; `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (Sept 2026 reorg) |
| `/admin` slide-out panel | `w-full sm:w-[520px] lg:w-[600px]`; header stacks name / controls on phones |
| `/admin` alerts + fleet line | Plain list and a wrapping flex row, no grid |
| `/admin` settings forms | `grid-cols-1 sm:grid-cols-2` on all two-column grids |
| `/dashboard` shell | Hamburger menu → slide-in sidebar (already done before May 2026) |
| `/dashboard/conversations` | `mobileChatOpen` toggle, scrollable tab bar |
| `/dashboard/contacts` | Mobile card list + desktop table (already done) |
| `/dashboard/jobs` | Mobile card list + desktop table (already done) |

Remaining pages not yet audited for mobile: `appointments`, `analytics`, `voicemails`, `website-leads`, `ads`.

---

## Changelog — `spam-hardening-contact-endpoint` branch (July 2026)

1. **Schema:** booking page override columns (`bookingPageHeaderTagline`, `bookingPageSubtitle`, `bookingPageDateLabel`, `bookingPageNotesLabel`, `bookingPageNotesPlaceholder`, `bookingHideAddress`, `bookingConfirmationSmsText`) + no-reply alert columns (`noReplyAlertEnabled`, `noReplyAlertMinutes`, `Conversation.noReplyAlertSentAt`)
2. **SMS webhook:** STOP/START opt-out enforcement via `BlockedNumber(label='sms-opt-out')`, lead-flow fallback when calendar is disconnected
3. **SMS sends:** exclude blocked numbers from campaigns, block manual sends to `sms-opt-out` recipients
4. **Booking:** calendar fail-closed (`getBusyTimesWithRange` throws instead of returning empty), `pg_advisory_xact_lock` on appointment creation, per-business booking page copy overrides
5. **No-reply alerts:** cron route (`/api/cron/no-reply-alerts`, every 10 min), `notifyOwnerOnNoReply()`, admin toggle + minutes input, booking override fields in admin allowedFields and types
6. **Email campaigns:** `[first name]`/`[last name]`/`[name]`/`[full name]` personalization tokens, per-recipient failure handling
7. **Admin:** E.164 normalization on blocked-number save, `scripts/check-calendar-tokens.ts`, `scripts/normalize-blocked-numbers.ts`, `scripts/sql/2026-07-20_add_noReplyAlert.sql`
8. **Admin panel + docs:** booking override fields in SettingsTab, `docs/system-layout.md` updates

---

## 18. Review Request Automation — Foundation Layer (Aug 2026)

Added on the `review-automation-foundation` branch. **This section documents the foundation only: schema, Intuit OAuth, and `lib/quickbooks.ts`. The webhook, the send path, the cron, and the dashboard page do not exist yet.**

### New `Business` columns

| Column | Type | Purpose |
|---|---|---|
| `quickbooksConnected` | `Boolean @default(false)` | Set true by a successful token exchange or refresh; set false by a refresh failure or an expired refresh token |
| `qbRealmId` | `String?` | Intuit company id. **Arrives ONLY as a query param on the OAuth callback** — absent from the token response, unrecoverable later. `@@index([qbRealmId])`, deliberately NOT unique: one QBO company can legitimately map to several `Business` rows (an owner running multiple businesses from one QuickBooks file) |
| `qbAccessToken` | `String? @db.Text` | Plaintext, same as the existing `googleAccessToken` |
| `qbRefreshToken` | `String? @db.Text` | Plaintext. **Rotates on every refresh** |
| `qbAccessTokenExpiresAt` | `DateTime?` | From `expires_in`. Google has no equivalent column, which is why `getValidAccessToken` refreshes on every call |
| `qbRefreshTokenExpiresAt` | `DateTime?` | From `x_refresh_token_expires_in`. QBO expires an idle refresh token after 100 days |
| `qbLastRefreshError` | `String? @db.Text` | Last refresh failure message; cleared on success |
| `reviewRequestsEnabled` | `Boolean @default(false)` | Master feature flag, off for every existing tenant |
| `reviewTrigger` | `String @default("payment_received")` | `payment_received`, `invoice_sent`, `invoice_created` |
| `reviewDelayMinutes` | `Int @default(120)` | Delay from billing event to send |
| `reviewQuietStartHour` / `reviewQuietEndHour` | `Int @default(9)` / `Int @default(20)` | Business-local send window (start inclusive, end exclusive). **No quiet-hours logic exists yet** — these are storage only |
| `reviewCapDays` | `Int @default(90)` | Per-customer frequency cap window |
| `googleReviewLink` | `String?` | Destination link for the review text |
| `reviewMessageTemplate` | `String? @db.Text` | Per-tenant copy override |
| `billingWebhookSecret` | `String?` | Shared secret for the generic (Zapier/Square) billing endpoint |

### `ReviewRequest` model

One row per billing event. Statuses `queued, sending, sent, skipped, failed`; sources `quickbooks, zapier, square, manual`; skip reasons `opted_out, frequency_cap, no_phone, invalid_phone, no_review_link, feature_disabled, duplicate, expired, send_failed`.

- `@@unique([businessId, source, externalInvoiceId])` — per-invoice dedupe; the same billing event can never queue twice.
- `@@index([businessId, createdAt])` — `businessId`-leading, so it also serves `businessId`-only lookups (this is why there is no standalone `@@index([businessId])`).
- `@@index([status, scheduledFor])` — **deliberately NOT tenant-prefixed.** The only such index in this schema. It exists for the cron's cross-tenant drain query.
- `@@index([businessId, customerPhone, sentAt])` — powers the `reviewCapDays` frequency cap.
- `contactId` uses **`onDelete: SetNull`, not Cascade** (`Activity` cascades). Deleting a contact must not erase the send history — that row is the audit trail when a customer asks why they were texted.

Migration: `scripts/sql/2026-08-29_add_review_automation.sql` (applied via `npm run db:push`, verified against Neon 2026-08-29 — 16/16 columns, table + 6 indexes + 2 FKs present).

### New env vars

`QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI`, `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`, `QUICKBOOKS_ENVIRONMENT` (`sandbox` | `production`), `QUICKBOOKS_STATE_SECRET`, and optional `QUICKBOOKS_MINOR_VERSION`.

`QUICKBOOKS_ENVIRONMENT` **throws when unset or unrecognised** rather than defaulting. Defaulting to production would have a misconfigured deploy read a real company's books; defaulting to sandbox would have production silently read an empty test company forever.

`QUICKBOOKS_MINOR_VERSION` is optional and unset by default. The current Intuit minor version could not be verified (the docs pages are client-rendered and return no content to a fetch), and Intuit's own sample sends none, so nothing is hardcoded.

### OAuth routes

| Route | Behavior |
|---|---|
| `/api/auth/quickbooks` | Clerk auth, `businessId` query param, same admin-or-owner check as the Google route, redirect to `getQbAuthUrl(businessId)` |
| `/api/auth/quickbooks/callback` | Verifies `state` **first**, then requires `code` + `realmId`, then exchanges. Redirects: `?qb_connected=1`, `?qb_error=invalid_state`, `?qb_error=missing_params`, `?qb_error=denied`, `?qb_error=not_configured`, `?qb_error=exchange_failed` |

Both routes are public under the existing middleware matcher only in the sense that `/api/auth/(.*)` is not listed as protected — the start route enforces Clerk itself, exactly as `/api/auth/google` does.

### `lib/quickbooks.ts` — three deliberate divergences from `lib/google-calendar.ts`

The module shape mirrors `google-calendar.ts`. These three differences are load-bearing; do not "simplify" them back:

1. **Signed state.** `getQbAuthUrl` puts `businessId` + a random nonce + an HMAC-SHA256 of both (base64url) into `state`; `verifyQbState` verifies it with `timingSafeEqual` and returns the businessId or null. `app/api/auth/google/route.ts` passes a bare businessId and its callback trusts it.
2. **Cached access token.** `getValidQbAccessToken` returns the stored token when `qbAccessTokenExpiresAt` is more than 5 minutes away. `getValidAccessToken` in `google-calendar.ts` calls `refreshAccessToken()` on **every** invocation — survivable only because Google's refresh tokens neither rotate nor idle-expire. Both are false for QuickBooks.
3. **Rotation persisted unconditionally.** A rotated `refresh_token` is written whenever the response carries one, independent of whether an access token came with it. `google-calendar.ts` writes it only inside `if (credentials.access_token)`.

`getValidQbAccessToken` also skips the network call entirely when `qbRefreshTokenExpiresAt` is already past — a dead refresh token cannot be revived by asking.

**Verified 2026-08-29** against Intuit's OIDC discovery documents (`developer.api.intuit.com/.well-known/openid_configuration` and `…/openid_sandbox_configuration`) and Intuit's own source (`intuit/oauth-jsclient`, `IntuitDeveloper/SampleApp-WebhookNotifications-nodejs`): the authorize and token endpoints are **identical for sandbox and production** — only the API base URL and userinfo endpoint differ. There is no sandbox token endpoint; do not invent one.

`verifyIntuitSignature(rawBody, signatureHeader)` is HMAC-SHA256 over the **raw** body, base64, timing-safe compared to the `intuit-signature` header. It takes the raw string on purpose: Intuit's own sample hashes `JSON.stringify(req.body)`, and any key-order or escaping difference between Intuit's bytes and Node's re-serialisation breaks the comparison. **The prompt-3 webhook route must read the body with `await request.text()` before parsing it.** Nothing else in this repo verifies any webhook signature (see gotcha #17), so there is no other pattern to copy.

### ⚠️ The review send path must NEVER call these four

Each would be the natural thing to reach for by pattern-matching the missed-call flow. Each is wrong here:

- **`checkCooldown` / `recordMessageSent`** (`lib/sms-cooldown.ts`) — `ContactCooldown` is keyed on `(businessId, phoneNumber)` with **no message type**. A review send that stamped it would suppress that customer's missed-call text-back for the next 7 days; reading it would suppress review sends for anyone who recently called. The 90-day cap lives in `ReviewRequest` (`@@index([businessId, customerPhone, sentAt])`, window `Business.reviewCapDays`), never in `ContactCooldown`.
- **`sendSMSAndLog`** (`app/api/webhooks/sms/route.ts`) — calls `recordMessageSent` internally, so using it inherits the problem above silently. It also requires a `conversationId`, and creating a `Conversation` for a review send makes those rows candidates for the no-reply owner-alert cron, which already misfires on campaign-created conversations.
- **`isExistingContact`** (`lib/contacts-check.ts`) — queries `Contact WHERE source IS NULL` and exists to stop automated SMS to the client's own address book. Review recipients are existing customers **by design**; any tenant who bulk-imported customers without a source would have the feature silently do nothing.

### Known gaps — accepted, no mitigation today

1. **`getValidQbAccessToken` returns `null` in some failure modes and `throws` in others.** Null: no refresh token stored, refresh token already expired, refresh succeeded but returned no access token. Throws: the token endpoint itself failed. **Every caller must handle both.** In particular the prompt-3 cron must wrap each tenant in its own `try`/`catch` — one dead QuickBooks connection would otherwise abort the whole batch, exactly the way a single failure aborts nothing in `/api/cron/appointment-reminders` because that route catches per-appointment.
2. **A refresh that succeeds followed by a failed `db.business.update` loses the rotated refresh token.** Intuit has already invalidated the old one at that point, so the connection is unrecoverable without re-consent. Known gap, no mitigation.
3. **The OAuth state is signed but carries no expiry**, so a leaked state string verifies indefinitely. Mitigated in practice only by the Clerk admin-or-owner check on `/api/auth/quickbooks`, which bounds who can obtain one in the first place. Known gap.

---

## 19. Marketing Demo Funnel (`/book`): Booking, Slots, SMS

The Align and Acquire demo funnel. **Completely separate from the tenant booking
flow.** It does not use `getAvailableSlots`, `createBooking`, or any `Business`
booking column. Meta ads point at `/book`; nothing else in the product touches it.

### Routing

`/book` is not a page. [middleware.ts](middleware.ts) 302s it to `/book/a` or
`/book/b` (a sticky 30-day A/B arm cookie); `app/book/page.tsx` is only a
backstop redirect for the case where middleware does not run. Both arms render
the same `VslLanding` and differ only in which video the watch page plays.

### Slot rules: `lib/marketing-slots.ts` is the single source of truth

| Constant | Value | Meaning |
|---|---|---|
| `START_HOUR` / `END_HOUR` | 7 / 21 | 7:00 AM to 9:00 PM ET. Every block must finish by `END_HOUR`. |
| `SLOT_MINUTES` | 30 | Calendar block length and `Appointment.duration`. |
| `BUFFER_MINUTES` | 0 | Gap required around a demo. Zero means demos stack back to back. |
| `SLOT_STEP_MINUTES` | 30 | Derived: `SLOT_MINUTES + BUFFER_MINUTES`. |
| `MIN_NOTICE_HOURS` | 1 | Nothing bookable inside the next hour. |
| `MAX_DAYS_AHEAD` | 3 | Today plus 3 days. The day picker renders only these. |

7:00 to 21:00 on a 30-minute step is **28 slots a day**, 7:00 AM through 8:30 PM.

Only two files import these: `/api/demo-book` (write) and the
`/api/marketing-bookings` GET (read). Both arms inherit the rules through that
GET rather than importing anything. **Never hardcode an hour, a step or a window
anywhere else**. `isValidSlotStart` and `lastSlotOffsetMinutes` both derive from
the constants precisely so changing one value cannot silently drop the day.

**`BUFFER_MINUTES` is applied once, to the gap, by the private `conflicts()`
helper.** Two blocks collide when either starts before the other has ended plus
the gap. At 0 this collapses to a strict overlap test, so a demo ending at 5:00
and one starting at 5:00 are both offered. `overlapsWithExisting` (booked
appointments) and `overlapsWithBusy` (Google free/busy) both route through it, so
they can never drift apart.

**`isWithinBookingWindow` builds its upper bound with `TZDate`, never
`setDate`/`setHours`.** Those resolve against the server zone, which is UTC on
Vercel: the old form capped the final day at 23:59 UTC, i.e. 7:59 PM Eastern,
silently discarding the 8:00 PM and 8:30 PM slots on day 3. It was invisible in
local development because that machine is already Eastern.

### Write path

**`POST /api/demo-book` is the live write path.** `BookingWizard.tsx` and
`DateCalendar.tsx` both post to it.

**`/api/marketing-bookings` is GET only.** It serves the slot list and nothing
else. It used to carry a second, unreachable POST that duplicated the appointment
insert, the calendar event and the confirmation SMS. Nothing in the app called it,
so it drifted from the live path while staying publicly reachable, and it was
removed Sept 2026. A POST to it now returns 405. **Do not restore it**: a second
write path for one funnel is how the SMS copy diverged in the first place.

The route sets `duration: SLOT_MINUTES`, ends the calendar event at
`addMinutes(slotStart, SLOT_MINUTES)`, and writes the literal marker
`SMS consent: yes (captured at booking)` into `Appointment.notes`. **The
reminder cron keys on that exact string**. Changing it silently stops every
reminder.

### Inbound SMS on the funnel number

Handled in `app/api/webhooks/sms/route.ts`, in this order. **The order is the
feature.**

1. `message.finalized` / `message.sent` delivery updates.
2. Tenant lookup by `telnyxPhoneNumber`, then the shared-notification-sender branch.
3. **START, then STOP.** Unchanged, and ahead of everything. `BlockedNumber`
   opt-out always wins.
4. Empty or blank inbound, acknowledged and dropped.
5. **The marketing branch** (`isMarketingLine()`, matched on
   `MARKETING_TELNYX_NUMBER`, not on business id, because the marketing business
   also owns a tenant-style number).
6. "Never mind" / "not interested".
7. The tenant flow.

**Step 5 moved above step 6 deliberately.** A prospect texting "not interested"
to the demo line previously fell into the tenant goodbye and filed a
`notifyOwnerOnLeadCaptured` "Partial interest" row against the marketing
business: wrong voice, junk lead. The never-mind block itself is unchanged.

**The marketing line does not auto-reply.** Inbound is saved as a `Message` on
the caller's conversation, then forwarded to Jacob twice: by text
(`pingOwnerWithThread`) and by email (`emailInboundToOwner`, routed through
`notifyOwnerOfMarketingEvent` with no `smsText` so it sends email only and does
not duplicate the text). A human answers.

`composeMarketingReply()` in `lib/marketing-reply.ts` is the Claude persona that
used to answer here. **Disabled by request, not deleted.** To re-enable, call it
in that branch and pass its text to `sendSMSAndLog` and as the last argument to
`pingOwnerWithThread` (whose `reply` parameter is nullable precisely so the
"You (auto)" line disappears while it is off).

`MARKETING_INBOUND_ACK` in `app/book/constants.ts` is `null` by default. Set it
to a string to send that one static line back and nothing else. It is a constant
rather than a `Business` column on purpose: one line of copy on one number, and a
column would imply a per-tenant behaviour that does not exist.

### Every booker-facing message, and the reminder cron

Copy rewritten Sep 2026. Each message has exactly one builder, and
`scripts/preview-booker-messages.ts` renders every one of them through that same
builder (plus reminder timing through the cron's own `decideReminder`) for
Pacific, Mountain, Arizona, Central, Eastern, an IP-guessed zone and no zone, in
September and January. **Run it before and after any copy change**:
`npx tsx scripts/preview-booker-messages.ts`. It sends nothing and blanks the
send keys and `DATABASE_URL` itself.

| # | Message | Builder | Sent by | When |
|---|---|---|---|---|
| 2 | Lead text | `leadTextBody`, `lib/lead-sms.ts` | `/api/demo-lead/wizard` | Right after OTP |
| 3 | 24h follow-up | `followUpBody`, `lib/lead-sms.ts` | `/api/cron/lead-follow-up` (hourly) | 24h to 72h after OTP, 11:00 AM to 7:00 PM ET only |
| 4 | Confirmation SMS | `confirmationText`, `lib/marketing-sms-copy.ts` | `/api/demo-book` | The moment the slot is taken |
| 5 | Confirmation email | `confirmationEmail`, `lib/demo-booker-copy.ts` | `/api/demo-book` | Same |
| 6 | Calendar invite | `demoInviteTitle` / `demoInviteDescription`, `lib/demo-booker-copy.ts` | `createMarketingCalendarEvent` | Same |
| 7 | Night before | `nightBeforeText`, `lib/marketing-sms-copy.ts` | reminder cron | 6:30 PM the day before, booker-local |
| 8 | Hour before | `hourBeforeText`, `lib/marketing-sms-copy.ts` | reminder cron | 45 to 60 minutes out |

Copy rules the tests enforce (`lib/demo-booker-copy.test.ts`, `lib/lead-sms.test.ts`):

- **All SMS copy is GSM-7.** Straight quotes and apostrophes, no em or en dashes,
  no emoji. One character outside the alphabet turns a text into UCS-2 and
  roughly doubles its segments. No em dashes in the email or invite either.
- **{time}** is `bookerWhen().timeMarked`: "1:00 PM PDT (your time)" for a
  widget or device zone, "1:00 PM PDT (4:00 PM EDT)" for an IP guess, "4:00 PM
  EDT" for none. MSG 8 alone uses the bare `time` ("1:00 PM PDT"). {date} is
  `dateShort` ("Tue, Sep 22"), {longDate} is `dateLong` ("Tuesday, Sep 22").
- **No first name** reads "Hey," / "Hi," (`greetingName`, which also refuses
  the banked-lead phone-number placeholder). **No company** reads "your business".
- **MSG 7 and MSG 8 carry no STOP line**, by decision. MSG 7 asks the booker to
  "Reply YES"; that lands in the marketing-line branch of the SMS webhook, which
  forwards it to Jacob and auto-replies nothing. YES is not an opt-in keyword
  (only START and UNSTOP are).
- **The invite carries no Meet link in its description.** Google puts its own
  Join button on the event and in the invite email (from `conferenceData`), and
  the link does not exist until the insert returns. There is no follow-up patch.
- **Invite title:** "Align and Acquire demo with Jacob | {firstName}, {company}",
  first word of the name only (`greetingName` rules). No company: "... | {firstName}".
  No usable name: "... | {company}". Neither: "Align and Acquire demo with Jacob".
  Never "your business" in the title; that fallback is for sentences.
- **Confirmation email:** subject "You're booked: {date} at {time}". From
  `Jacob at Align and Acquire <notifications@alignandacquire.com>`
  (`DEMO_EMAIL_FROM`); Reply-To is `business.ownerEmail` when it is set and looks
  like an address, omitted entirely otherwise (`demoEmailEnvelope`). /api/demo-book
  posts to Resend's REST API directly, so the field is `reply_to` (snake_case).
  The resend SDK's `replyTo` maps to that same wire field; do not pass `replyTo`
  to the REST endpoint. The email is sent with both an HTML and a plain-text part.
- **Call length:** the email says "It usually takes about 15 minutes. I block 30
  so we're never rushed." Pages still say 15 (`CALL_LENGTH_MINUTES`); the
  calendar block is 30 (`SLOT_MINUTES`).

**The reschedule number is always derived from `business.ownerPhone`** and
rendered `517-580-9709` by `formatReschedulePhone()`. Never write a literal phone
number into the copy modules. A missing `ownerPhone` or a missing Meet link drops
its whole sentence rather than rendering `Join here: .`

**24h follow-up send window** (`lib/lead-follow-up-window.ts`): 11:00 AM to 7:00
PM **Eastern for everyone**, because the lead's zone is not captured at OTP. A
24h mark outside the window waits for the next 11:00 AM ET (at most 16 hours,
always inside the 72h cap). The cron runs on the hour and returns early outside
the window.

`/api/cron/appointment-reminders` runs every 15 minutes (`vercel.json`) and is
marketing-business only. Its timing rules live in `lib/demo-reminder-schedule.ts`
(`decideReminder`), pure, so the preview script and the tests call exactly what
the cron calls. Client tenants have their own numbers and never
consented to this funnel. Rules, on top of the claim-before-send idempotency:

- **"Local" is the booker's zone** (`Appointment.customerTimezone`), Eastern when
  it was not captured. Quiet hours, the 8:00 AM hour-before rule and the 6:30 PM
  night-before are all evaluated per appointment in that zone.
- **Nothing before 7:00 AM local.** Checked per appointment, because bookers are
  in different zones.
- **Night before** is skipped when the call was booked the same day it happens.
- **Hour before** is skipped when the meeting starts before 8:00 AM local (its
  hour mark falls inside quiet hours and the night-before already covered it), or
  when the booking was made within 90 minutes of the meeting (the confirmation
  text IS the reminder at that point).
- **Each reminder is claimed by conditionally setting its stamp BEFORE the send.**
  `reminderNightBeforeSentAt` / `reminderHourBeforeSentAt`. Two overlapping runs
  cannot both send. `reminderSentAt` is legacy and nothing writes it.
- **The stamp is deliberately NOT rolled back on a Telnyx failure.** A missed
  reminder is a better failure than texting a prospect twice. Failures surface in
  the response body's `failed[]`.
- **The Google Calendar cancellation guard is three-state.** `cancelled` marks the
  booking cancelled and aborts; `unknown` (network error, expired token, Google
  5xx) still sends, because our own record says the booking is on. Never collapse
  `unknown` into `cancelled`: one bad API call would wipe out live bookings.
- **`?now=<ISO>` shifts the clock** for verification runs. Authorized callers
  only, logged with `CLOCK OVERRIDE`. It can fire a real reminder early against a
  real booking, so it is not a dry run.

⚠️ The cron gates on the literal string `SMS consent: yes` appearing in
`Appointment.notes`, written by `/api/demo-book`. **Rewording that marker silently
stops every reminder platform-wide.**

### Booker time zone (Sep 2026)

Every message a booker receives renders the call in THEIR zone with its
abbreviation ("1:00 PM PDT"), through `lib/booker-time.ts`: the confirmation
text, both reminders, the confirmation email, the invite's description line and
event zone, and the "Locked in" screen. Jacob's own alerts stay ET, with an extra
"Their time: ..." line.

The zone is sent by the browser calendars (`timeZone` = the zone DateCalendar
showed, `browserTimeZone` = the device's) and stored on
`Appointment.customerTimezone` + `customerTimezoneSource`
(`widget` | `browser` | `ip`). `ip` is Vercel's `x-vercel-ip-timezone`, a
guess, so it always renders beside ET: "1:00 PM PDT (4:00 PM EDT)". Null renders
ET with its abbreviation. Times go through `plainSpaces()` because some ICU
builds emit U+202F before AM/PM, which is not GSM-7 and would push every text
into UCS-2.

`/api/demo-book` derives the slot's ET day with `toTZDate(slotStart)`. It used
to read `slotStart.getDate()` in the server zone (UTC on Vercel), so 8:00 and
8:30 PM ET slots checked the NEXT day for conflicts and busy time.

### Google free/busy fails closed

Both the GET and the write path treat an unreadable calendar as "no availability"
rather than "free". Better to show no times than to double-book.

---

## 20. Admin Pipeline (`/admin/pipeline`): outcome + follow-up CRM

Added Sep 2026. Outcome and follow-up tracking on the `/book` funnel, so closes
tie back to the ad that produced them. **Admin only and additive.** It touches
nothing on `/book`, `/watch`, `/calendar`, the booking routes, the wizard, CAPI
or the pixel.

### The row is a person, not a booking

A person is every non-spam `WebsiteLead` and every `Appointment` of the
marketing business that share a phone number (E.164 on both, exact match),
stitched together at read time in `lib/pipeline-server.ts`. A lead with no phone
is its own person, keyed `lead:<id>`. This is what makes verified leads who never
booked visible. They are the main list to chase.

Two separate axes:
- **Stage** is where they got to. It is derived and never stored:
  `lead_only` / `booked` / `showed` / `no_show` / `cancelled`. Showed on any
  booking wins. Otherwise the *primary* booking decides: the latest one not
  cancelled, else the latest.
- **Status** is the outcome call, stored on `PipelinePerson.status`:
  `pending` / `working` / `won` / `lost` / `not_a_fit` / `junk`. "Open" means
  pending or working.

### Data (applied 2026-09-18 via `scripts/sql/2026-09-18_add_pipeline.sql`)

- `Appointment.showStatus`: `pending` | `showed` | `no_show` | `cancelled`. It is
  per booking, because one person can book, cancel and rebook. A `pending` row
  whose `Appointment.status` is `cancelled` reads as cancelled (`effectiveShow`),
  so calendar cancellations count without a backfill. An explicit mark wins.
- `PipelinePerson` (`@@unique([businessId, personKey])`): status, lostReason,
  closedAt, mrr, setupFee (Float dollars, what they actually pay),
  lastContactedAt, nextFollowUpAt. **Created lazily on the first write.** No row
  means pending, which is how every existing lead and booking starts out.
- `PipelineNote`: append-only log (`kind` = `note` | `contact`). No route
  updates or deletes a note.
- ⚠️ **Applied with `npx prisma db execute --file …`, not `db push`.** Two
  sessions had schema.prisma open at once, and `db push` diffs against one schema
  file, so it would have dropped the other session's `customerTimezone` columns.
  The SQL is additive and safe to re-run.
- ⚠️ **Never store an outcome in `Appointment.status`.** That column is the
  calendar slot's state, and it is rewritten automatically: `GET /api/appointments`
  flips every past `confirmed` row to `completed` whether or not anyone showed,
  and the Google sync flips rows to `cancelled`.
- `status = 'junk'` is independent of `WebsiteLead.junk`. The lead flag drives
  the follow-up cron and the arm counts, and the pipeline never writes it. Cards
  show it read-only.

### Files

| File | Role |
|---|---|
| `lib/pipeline.ts` | Pure and client-safe: vocabularies, `effectiveShow`, `primaryBooking`, `stageOf`, `surfaceKey`, `resolveUtmTerm`, `resolveCompany`, `followUpState`, `sortPipeline`, `rollupRoi`. Tests in `lib/pipeline.test.ts`. |
| `lib/pipeline-server.ts` | `loadPipeline()` / `loadPerson(key)`: 3 queries, no pagination (under 100 people as of Sep 2026). Also `requireAdmin()`. |
| `app/api/admin/pipeline/route.ts` | GET: all people |
| `app/api/admin/pipeline/person/route.ts` | PATCH `{ key, …fields }`: upserts `PipelinePerson`. 404 unless the key matches a lead or booking. A non-open status stamps `closedAt` (unless it is sent explicitly); going back to open clears it. A win with the primary booking still unmarked marks it `showed`. |
| `app/api/admin/pipeline/person/notes/route.ts` | POST `{ key, body, logContact, nextFollowUpAt? }`: `logContact` stamps `lastContactedAt = now` in the same transaction. |
| `app/api/admin/pipeline/booking/[id]/route.ts` | PATCH `{ showStatus }`: writes only `Appointment.showStatus`. |
| `app/admin/pipeline/` | Server auth shell plus `PipelineClient` (Pipeline and ROI tabs). Linked from the AdminTools dropdown. |

### Rules

- **utm_term**: any first touch (leads oldest first, then bookings) before any
  last touch, then `utm_term:` in a booking's notes block (the placeholder
  `direct` is ignored).
- **Needs follow-up**: `nextFollowUpAt` has passed (any status), OR the person is
  open with no contact in 3 days (`FOLLOW_UP_STALE_DAYS`). The clock starts at the
  later of the call and the last contact for a past call. For a lead only, or
  someone with only cancelled bookings, it starts at the last contact, else when
  they verified, else when they booked. **No clock** for someone with a call still
  ahead, or for an unverified lead: only a date you set flags them. A future
  `nextFollowUpAt` suppresses the stale rule.
- **Sort**, remembered per browser in localStorage (`adminPipelineSort`):
  - *Newest first* (default, the backfill order): latest booking call time if
    they booked (upcoming calls on top), else when the lead came in (`activityAt`).
  - *Needs follow-up*: due now (longest waiting first), then scheduled follow-ups
    (soonest first), then everyone else newest first.
- **Nothing is ever required.** Every showed / no-show / cancelled mark and every
  status saves on one tap and opens nothing. Log contact stamps
  `lastContactedAt` on the tap itself. The panel it opens only offers an optional
  next follow-up (each chip saves on its own tap) and an optional note. Add note is
  a separate card action. MRR, setup and the lost reason live in Details, and are
  never prompted.
- **Presets**: "Verified, never booked" (lead only + verified + open), "Showed,
  not closed" (showed + open), "Needs follow-up".
- **ROI**, grouped by utm_term and by `surfaceKey` (the primary booking's surface,
  "(no booking)", or "(surface not recorded)" for old rows). Only test numbers
  are excluded. Leads are people. Verified = passed OTP or booked. Bookings count
  every booking, cancelled and junk included. Show rate = showed ÷ (showed +
  no-show). Cancelled and not-marked get their own columns. Close rate = won
  people ÷ people who showed. MRR and setup sum won people only. No Meta spend
  integration, by design.
- Every dollar figure is behind the `adminShowRevenue` toggle, like the rest of `/admin`.

## 21. Ops Module (`/admin/ops`): client delivery tracking

Added Oct 2026, schema only so far (branch `ops-schema`): no UI, routes or cron
yet. Ops tracks what happens **after** a sale: what each client bought, whether
each piece is live, contact after the sale, and agent work dispatched for them.
Vocabularies for every String column are in `lib/ops/types.ts`.

### Tables (`scripts/sql/2026-10-24_add_ops.sql`)

| Model | Purpose |
|---|---|
| `Engagement` | One row per client. The bridge between a won `PipelinePerson` (prospect) and the `Business` row they become (client). Both links are nullable and `@unique`: a prospect has no Business yet, and a self-onboarded client has no PipelinePerson. Holds stage, services bought, Stripe ids and amounts (written only by the ops sync), and post-sale follow-up. |
| `Deliverable` | One per thing sold (`@@unique([engagementId, type])`): website, domain, email, missedcall, ads, gbp. `computedStatus` comes from its checks; `manualStatus` (plus a note) wins in the UI until cleared. `evidence` holds the pointers checks and agents read (repo, Vercel project, domain, Telnyx number, Ads ids). |
| `OpsCheck` | Latest result per automated check per deliverable (`@@unique([deliverableId, key])`), keyed by a dotted key such as `stripe.upfront_paid` or `dns.a_record`. `passed = null` means the check could not run. |
| `OpsActivity` | Post-sale contact log. Pre-sale contact stays in `PipelineNote`. |
| `AgentRun` | Log of agent dispatches (site build, SEO pass, ads setup…) with input, output and status. |

`OpsActivity` is named that way because `Activity` already exists for tenant contacts.

### Rules

- **Ops reads existing models and writes only its own tables** (the five above plus the Ops HQ tables: `OpsJob`, `OpsMessage`, `AgentEvent`, `OpsApproval`). It never
  writes `Business`, `PipelinePerson`, `WebsiteLead`, `Appointment` or any other
  pre-existing model, with one exception: the HQ ads specialist's `bind_account` sets
  `Business.googleAdsCustomerId` when it is empty (never overwrites; see Ops HQ). `Business.stripeCustomerId` is left alone; Ops keeps its
  own copy on `Engagement`. The only change to existing models is the two
  back-relation lines (`Business.engagement`, `PipelinePerson.engagement`), which
  add no columns.
- ⚠️ **Schema changes are applied by hand from `scripts/sql/`, never `db push`
  from a branch.** The SQL is generated with `prisma migrate diff` (main's
  schema → the branch's) so it cannot drift from `schema.prisma`, then run with
  `npx prisma db execute --file …`. `db push` diffs against one schema file and
  would drop columns other branches have already added to the database.

### Sync (`lib/ops/sync.ts`, Oct 2026)

`runOpsSync({ dryRun })`, run by `GET /api/cron/ops-sync` (every 4 hours, CRON_SECRET
bearer or the admin, `?dry=1` writes nothing) and `POST /api/admin/ops/sync`
(`requireAdmin`, same `?dry=1`). Phases in order: engagements from won
`PipelinePerson` rows, engagements from `Business` rows (link to an unlinked
engagement on exactly one phone/email match, otherwise create; two or more is
reported as an ambiguity and nothing happens), deliverables for each
engagement's services, Stripe, checks, status derivation. It writes only
`Engagement`, `Deliverable` and `OpsCheck`, and deletes unfiled HQ chat photos
(Blob `ops-inbox/`) older than 7 days (`cleanInbox`, `lib/ops/photo-filing-server.ts`).

- **Sync-owned Engagement fields** (`SYNC_OWNED_FIELDS`), the only ones it changes
  on an existing row: `businessId` (link only, never unlink), `stripeCustomerId`,
  `stripeSubscriptionId`, `stripeSubscriptionStatus`, `upfrontPaidAt`,
  `upfrontAmount`, `monthlyAmount`, `monthlyStartedAt`, `stripeSyncedAt`.
  Everything else is set on create and then edited by hand only, with one
  exception for rows inserted **in the same run**: their stage is finalized
  after the Stripe phase (subscription active/trialing/past_due → `active`,
  canceled → `churned`, upfront found and no subscription → `paid_upfront`,
  nothing in Stripe → the insert stage), and a same-run link renames them to
  `Business.name` and fills empty `services` from the Business row. Names in
  `IGNORE_ON_CREATE` are inserted with stage `ignored`. On a
  Deliverable it adds missing ones and merges `evidence.telnyxNumber` /
  `evidence.adsCustomerId`; it never deletes a row or an evidence key.
- **Check keys written** (database only): missedcall → `business.number_assigned`,
  `business.owner_contact_set`, `missedcall.activity_30d`; website →
  `website.business_row`, `business.owner_contact_set`, `lead.test_row` (a `ZZTEST…` lead exists),
  `website.real_lead_30d`; ads → `ads.customer_linked`, `ads.snapshot_7d`,
  `ads.spend_7d`. No checks yet for domain, email, gbp. With no linked
  Business, every business-dependent check is `passed = null`, detail
  "no platform account linked".
- **Status derivation**: no check rows → `unknown`; every non-null result passed →
  `live`; every non-null result failed → `not_started`; mixed → `in_progress`;
  all null → `unknown`. `blocked` only ever comes from `manualStatus`, which the
  sync never reads or writes.
- ⚠️ **Stripe is read-only.** `STRIPE_SECRET_KEY` must be a restricted key with
  READ access only (Customers, Charges, PaymentIntents, Checkout Sessions,
  Invoices, Subscriptions). Unset key = Stripe phase skipped with a note. API
  2026-09-30 has no `charge.invoice` or `invoice.subscription`: subscription
  invoices are told apart by `invoice.parent.subscription_details`, and invoice
  charges by the InvoicePayments API, so upfront money is never counted twice.
  Upfront charges are net of refunds. **Stripe never clears a value**: the money
  fields are written only when Stripe found something. Ignored rows never claim a
  Stripe customer. Unmatched paying customers (last 120 days) are reported, never
  created.
- `lib/ops/alerts.ts` `computeEngagementAlerts` is the pure health/alert rules for
  one engagement, in the style of `lib/admin-health.ts`. The sync does not call it.

### Page (`/admin/ops`, Oct 2026)

`app/admin/ops/page.tsx` is the server gate (`ADMIN_USER_ID`, like `/admin`) and
renders `OpsClient` from `getOpsBoard()` (`lib/ops/board.ts`: a fixed set of
cross-tenant queries, ISO dates, `ignored` rows split out of every list and
total). Tabs are `?tab=today|clients|money|agents`. Linked from AdminTools ("Ops").
Writes are optimistic and every one is followed by a board refetch, because
alerts, health and totals are computed only on the server.

| Route (all `requireAdmin()`) | What it does |
|---|---|
| `GET /api/admin/ops/board` | `getOpsBoard()` |
| `PATCH /api/admin/ops/engagements/[id]` | Allowlist: `displayName`, `contactName`, `email`, `phone`, `trade`, `location`, `services`, `stage`, `notes`, `nextFollowUpAt`, `lastContactedAt`, `monthlyAmount`, `upfrontAmount`, `stripeCustomerId` (null unlinks and also clears `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripeSyncedAt`; the amounts stay). Any other key is a 400. Services → `ensureDeliverables`; stage → `OpsActivity` `status_change`; a new `stripeCustomerId` → 409 if taken, else `syncStripeForEngagement`. |
| `POST /api/admin/ops/engagements` | `{ stripeCustomerId }` → new Engagement, source `stripe`, stage `paid_upfront`, then `syncStripeForEngagement`. 409 if the customer is already linked. |
| `GET` / `POST /api/admin/ops/engagements/[id]/activities` | GET: the full log, newest first (the board carries the last 5; the panel's "Show all"). POST `{ kind, body, followUpAt? }`: contact kinds stamp `lastContactedAt`; `followUpAt` becomes `nextFollowUpAt`. |
| `POST /api/admin/ops/engagements/[id]/snooze` | `{ days }` 1–60 → `nextFollowUpAt`, plus a `system` activity. |
| `PATCH /api/admin/ops/deliverables/[id]` | Allowlist: `manualStatus` (null clears; stamps `manualStatusAt`), `manualStatusNote`, `evidence` merged key by key (null removes one key) over `EVIDENCE_KEYS` in `lib/ops/evidence.ts`. Never `computedStatus`. |
| `GET /api/admin/ops/stripe/unmatched` | `listUnmatchedStripeCustomers()`, cached 10 min per instance; `?refresh=1` skips the cache. |
| `POST /api/admin/ops/sync` | The Sync button (same `runOpsSync`). |

- **effectiveStatus** (`effectiveStatusOf` in `lib/ops/steps.ts`): `manualStatus` if
  set; else `live` when the step is terminal (except `paused_by_client` → `paused`);
  else `in_progress` when any step is set; else `computedStatus`. A hand-set status
  wins until cleared; the sync keeps updating `computedStatus` underneath.
- **MRR is split Verified / Projected** (`lib/ops/money.ts`, shared by the board totals
  and the Money tab). Verified = `stripeSubscriptionStatus` `active` or `past_due`;
  Projected = every other row with a `monthlyAmount`. Bucket by stage (active →
  Active; paid_upfront, onboarding → Pending; churned → Churned), except a
  `scheduled` subscription, which is Pending unless the row is churned: a churned
  row is always Churned, even with an open Stripe invoice still showing.
- **`scheduled`**: with no live subscription (active, trialing, past_due, unpaid), a
  Stripe subscription schedule in `not_started` or `active` sets
  `stripeSubscriptionStatus = 'scheduled'`, `monthlyStartedAt` from its first phase
  and `monthlyAmount` from that phase's first price when monthly. It suppresses the
  `no_subscription` alert. A schedules error (e.g. a restricted key without that
  permission) lands in `stripe.errors` and the rest of the customer still syncs.
- ⚠️ **Booking show-status goes through `PATCH /api/admin/pipeline/booking/[id]`.**
  Ops never writes `Appointment`.
- `lib/ops/sync.ts` also exports `ensureDeliverables`, `listUnmatchedStripeCustomers`
  and `syncStripeForEngagement` (the full run's match + per-customer update for one
  row; it refuses a match another unlinked engagement would also make).

### Stripe amounts, promotion, `paused` / `scheduled` (Oct 23 2026)

- **monthlyAmount = every live subscription, every item.** Live = active, trialing,
  past_due, unpaid. Per item `unit_amount × quantity ÷ interval_count`, normalised
  to a month (year ÷ 12, week × 52 ÷ 12, day × 30), then any `percent_off`
  discount on the subscription (`subscriptionMonthly` in `lib/ops/sync.ts`).
  Tiered and metered prices count 0, as does `amount_off`, and each is named in
  the summary. `stripeSubscriptionStatus` / `stripeSubscriptionId` are still the
  highest-priority subscription; the per-subscription breakdown
  (`stripe.synced[].subscriptions`) is in the sync summary only. Subscriptions are
  listed with `expand: ['data.discounts.source.coupon']`; a key that cannot expand
  coupons falls back to the plain list with a warning.
- **`scheduled`** (no live subscription): a subscription schedule in `not_started`
  or `active` (first phase start, monthly price), else an open or draft invoice
  with no subscription whose `due_date` or `automatically_finalizes_at` is ahead
  (that date, `total / 100`). Still never clears a value Stripe cannot see.
- **Promotion only.** When a run (full sync or `syncStripeForEngagement`) finds an
  active subscription on a `prospect`, `paid_upfront` or `onboarding` engagement,
  it sets `active` and writes an `OpsActivity` `status_change` "stage: <old> ->
  active (Stripe subscription active)". Nothing demotes automatically: a canceled
  subscription on an active client stays a red alert.
- **Deliverable `paused`**: manual only (the sync never derives it, like
  `blocked`), slate chip, no alert. The Stripe `scheduled` status has its own chip
  (`StripeStatusPill` in `app/admin/ops/opsUi.tsx`).
- `scripts/ops-apply-2026-10-23.ts` is the one-off standings apply (`--dry` first;
  idempotent, never undoes a promotion). Kept for the record; do not re-run blind.

### Waiting-on steps (Oct 24 2026)

Every Deliverable can sit at a **step** from `STEP_CATALOG` in `lib/ops/steps.ts`
(fixed, ordered, per type). Each step has an owner: `jacob`, `client`, `vendor`, or
`none` once done; `terminal` marks the end states (`live`, `running`,
`paused_by_client`). Columns added by `scripts/sql/2026-10-24_add_deliverable_steps.sql`
(applied by hand): `step`, `waitingOn`, `waitingNote`, `stepUpdatedAt`.

- `PATCH /api/admin/ops/deliverables/[id]` accepts `step` (must be in the catalog for
  that type; null clears), `waitingOn` (jacob | client | vendor | null, an override)
  and `waitingNote`. Setting `step` stamps `stepUpdatedAt` and sets `waitingOn` to the
  step's owner (null for `none`) unless `waitingOn` is sent too.
- The board returns `step`, `stepLabel`, `stepOwner`, `stepTerminal`, `waitingOn`,
  `waitingNote`, `stepUpdatedAt` per deliverable.
- Home's **Needs you** (`rankNeedsYou`, see "Ops command center" below) ranks
  approvals, red alerts, steps waiting on Jacob (oldest `stepUpdatedAt` first),
  follow-ups, today's calls and yellow alerts; steps waiting on clients and vendors
  sit collapsed under it. (The Today tab that listed these was folded into Home.)
- Chips are coloured by step owner: you orange, client blue, vendor grey, done
  green (`paused_by_client` keeps the paused slate). A `manualStatus` still wins.
- The sync never reads or writes steps. `scripts/ops-apply-2026-10-24-steps.ts` is the
  one-off seed (`--dry` first).

### Web checks (`lib/ops/checks/`, Oct 24 2026)

`runWebChecks({ dryRun })` (`lib/ops/checks/run-web.ts`), run by `GET /api/cron/ops-web-checks`
(daily 11:17 UTC, CRON_SECRET bearer or the admin, `?dry=1`, maxDuration 120) and
`POST /api/admin/ops/checks/web` (the "Run web checks" button). Read only against
Vercel (`VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`), GitHub (`GITHUB_OPS_TOKEN`, repos owned
by `jacobholtzer22-droid`), DNS and the live sites; tokens are never logged. Every
external call runs at most 5 at a time. Writes only Deliverable (evidence, computedStatus,
forward steps), OpsCheck and OpsActivity.

- **Discovery order** (`lib/ops/checks/discover.ts`), first hit wins: (a) a website
  deliverable whose evidence already has the `repoUrl` / `vercelProjectId`; (b) the
  repo's `site.config.ts` `businessSlug` equals a `Business.slug` that has an
  Engagement; (c) the Vercel project's git link points at a matched repo; (d) a
  Vercel project domain equals a domain deliverable's `evidence.domain` (that
  project's git-linked repo comes along). **Never by name similarity**: the rest is
  listed as `unmatchedRepos`, `unmatchedProjects`, `clientsWithoutProject`; two
  candidates for one client are an ambiguity and neither is used.
- **Evidence it owns** (set when found, never deleted, since some can be hand-entered):
  website `repoUrl`, `repoDefaultBranch`, `repoHasWorkflow`, `siteConfigSlug`,
  `siteIndexableFlag` (`launch.indexable`, else `!prelaunch`), `vercelProjectId`, `vercelProjectName`, `vercelGitLinked`,
  `productionUrl`, `productionState`, `previewUrl`, `previewState`; domain `domains`
  (`[{ name, verified }]`, custom domains only) and `primaryDomain` (the www host if
  present, else the apex).
- **Check keys**: website `vercel.project_found`, `vercel.git_linked`,
  `vercel.prod_ready` (latest production deployment READY), `slug.matches_db`,
  `repo.has_workflow`, `http.indexing_matches_step` (step `live` ⇒ no noindex in
  X-Robots-Tag or robots meta; any other step ⇒ noindex), `http.homepage_200`,
  `http.inner_page_200` (`/contact` on the production URL by its clean URL; a project
  without the nextjs framework preset serves only `/contact.html`). Domain,
  only with a `primaryDomain`: `dns.apex_points_to_vercel` (A 76.76.21.21 or Vercel's
  newer 216.150.1.x / 216.150.16.x / 216.198.79.x ranges, or CNAME `*.vercel-dns*.com`), `dns.www_cname`,
  `vercel.domain_verified`, `dns.mx_present`, `dns.txt_spf` (fail when MX and no
  v=spf1; null with no MX), `dns.txt_dmarc`, `http.https_200`. DNS uses a 5s resolver;
  resolver errors are `passed = null`. `repo.has_workflow`, `dns.mx_present` and
  `dns.txt_dmarc` are informational (`INFORMATIONAL_CHECK_KEYS` in `lib/ops/types.ts`):
  `deriveDeliverableStatus` skips them, in the sync and the web checks alike.
- **Auto-advance is forward only.** A domain at `propagating` or `dns_records` moves
  to `live` when `dns.apex_points_to_vercel`, `vercel.domain_verified` and
  `http.https_200` all pass. A website at `approved` moves to `live` when
  `vercel.prod_ready` and `slug.matches_db` pass and the domain deliverable is live.
  Each writes an `OpsActivity` (`system`). Never backward, never a terminal step,
  never a deliverable with a manualStatus.
- **Preview by branch.** `previewBranch` is owned by the build callback, not the web
  checks. When it is set and a Vercel project is matched, `previewUrl` / `previewState`
  come from the newest preview deployment of that branch (`listDeploymentsForBranch`);
  with no `previewBranch` they come from the latest preview deployment.

### Web designer dispatch (`lib/ops/agents/`, Oct 25 2026)

The agent is the `aa-build.yml` workflow in each client repo (from AA-Template). The
platform provisions repos, dispatches runs and records a signed callback. Clients:
`lib/ops/github.ts` (GITHUB_OPS_TOKEN; reads through `api()` in `checks/discover.ts`,
writes through a local helper, secrets sealed with `libsodium-wrappers`) and
`lib/ops/vercel.ts` (VERCEL_API_TOKEN, VERCEL_TEAM_ID). Env read by name only:
`ANTHROPIC_API_KEY_BUILDS` and `OPS_CALLBACK_SECRET` become the repo secrets
`ANTHROPIC_API_KEY` and `OPS_CALLBACK_SECRET`. **Every GitHub or Vercel write has a
dry mode** (`dry` defaults to true in every route) that returns the plan and writes
nothing; the UI always shows the dry result before a confirmed live call.

- **Provision** `POST /api/admin/ops/engagements/[id]/provision` `{ repoName?, dry }`
  (`provision.ts`). Blocked (409) without a website service and deliverable, a linked
  Business, or the two env vars, or when `evidence.repoUrl` exists or the repo name is
  already taken (an existing repo is **never** reused). Live, in order, stopping at
  the first failure (502 with the steps so far): private repo
  `jacobholtzer22-droid/<repoName>` from AA-Template (default branch only); the two
  secrets (plus `PEXELS_API_KEY` and `PIXABAY_API_KEY` when the platform has them); a Vercel
  project named the lowercased repo name, git-linked, framework `nextjs` with build and
  output left to the framework, like the hand-made projects (with the framework unset,
  Vercel served the export's raw files: `/contact` 404, `/contact.html` 200), and Vercel
  Authentication turned off for preview and production (`ssoProtection: null`; the team
  default hid every `*.vercel.app` URL behind a Vercel login, so a client could not open
  the preview; custom domains are never behind it); evidence `repoUrl`, `repoDefaultBranch`,
  `vercelProjectId`, `vercelProjectName`, `vercelGitLinked: true`, `productionUrl`
  (`https://<project>.vercel.app`); website step `build` (waiting on Jacob); an
  activity. Default repo name: `AA-` + the PascalCased display name
  (`defaultRepoName`, `lib/ops/agents/names.ts`).
- **Dispatch** `POST /api/admin/ops/engagements/[id]/runs` `{ kind, brief?, instructions?, dry }`
  (`dispatch.ts`). Kinds `site_build` (needs `brief`), `site_update` (needs
  `instructions`), `go_live`. Needs `evidence.repoUrl` and a linked Business (the
  workflow requires `business_slug`). Live: AgentRun `queued` (input `{ kind, repo,
  brief|instructions }`), then `repository_dispatch` event `aa-build` with
  `client_payload` `{ kind, run_id, brief (base64), instructions (base64),
  business_slug, callback_url }`; 204 ⇒ `dispatched` + `startedAt`, anything else ⇒
  `failed`. Both write an activity. Dry shows the payload with brief/instructions as
  character counts. `callback_url` is always
  `https://www.alignandacquire.com/api/ops/build-callback` (GitHub cannot reach dev).
- **Callback** `POST /api/ops/build-callback`, public (middleware does not cover
  `/api/ops`). Header `X-AA-Signature` = hex HMAC-SHA256 of the raw body keyed with
  `OPS_CALLBACK_SECRET` (`sha256=` prefix tolerated), compared in constant time before
  parsing; unset secret or bad signature ⇒ 401. Body `{ run_id, kind, status
  (success|failure|cancelled), branch, pr_url, verify_passed, failing_checks,
  report_excerpt, run_url? }`. 400 bad body, 404 unknown run. Idempotent: a finished
  run answers 200 `duplicate: true`; the update claims the run with
  `finishedAt IS NULL`. Sets status `succeeded`/`failed`, `output` (`prUrl`, `branch`,
  `verifyPassed`, `failingChecks`, `reportExcerpt`, `runUrl`), `externalId` = run URL;
  merges `previewBranch` into the website evidence; on success of `site_build` or
  `site_update` sets the website step to **`review`** (waiting on Jacob: "Review the
  agent's PR and preview", between `build` and `send_preview`). `go_live` leaves the step.
  **When `pr_url` is null on a successful run, the callback opens the PR itself** (`openPrForRun`, GITHUB_OPS_TOKEN) from the pushed branch into the default branch, and records `prOpenedBy: 'platform'` or `prError` on the run's output. Repos default to "GitHub Actions may not create pull requests", so this is the normal path; the workflow's PR step is `continue-on-error`.
- **Workflow requirements learned on the first live run (Oct 25 2026, Prestige):** the Claude step must pass `github_token: ${{ secrets.GITHUB_TOKEN }}` (otherwise claude-code-action tries an OIDC exchange and fails) and allow Bash (AGENT.md runs npm build/verify and commits); `git push` stays denied. Node comes from `.nvmrc` when present, else 20. `sync-workflow` only adds a missing workflow; it does not update an outdated copy, so a template workflow fix must be copied into already-synced repos by hand (Prestige is current as of AA-Template 5aee24d).
- **Sync workflow** `POST /api/admin/ops/agents/sync-workflow` `{ mode: 'pr'|'direct', only?, dry }`
  (`sync-workflow.ts`, maxDuration 120). For website deliverables with `repoUrl` and
  `repoHasWorkflow === false` (unrecorded ⇒ skipped: run web checks first): adds
  `.github/workflows/aa-build.yml` and AGENT.md's "Non-interactive (CI) mode" section,
  both copied from AA-Template at `TEMPLATE_REF` (pinned, see below), on branch `ci/aa-build` + a
  PR, or straight to the default branch (then `repoHasWorkflow: true`); sets the two
  secrets either way. Blocked when the template ref lacks either file. 3 repos at a time.
- **`TEMPLATE_REF` is pinned to AA-Template 961cd0f** (`lib/ops/agents/shared.ts`), for both
  sync-workflow and the template-owned file sync (`chore/template-sync` PRs). 6b2c39e (diverse
  sites) does not build on an unmigrated client repo: its `config-schema.ts` makes `tagline`
  nullable, which old pages do not type-check against, and its `verify.ts` imports
  `optionalRoutes` from a `lib/routes.ts` that old repos lack. Move the pin only after a template
  commit is shown to build and verify on an unmigrated repo. New repos are generated from
  AA-Template's default branch and never read this ref.
- **`evidence.handBuilt: true`** on a website deliverable makes the template-owned file sync
  skip it (reason "hand-built"), before any repo read. For repos whose template-owned files
  were extended by hand, where a wholesale copy breaks the build: template changes are ported
  in by hand instead. Set directly in the DB (not in `EVIDENCE_KEYS`). Titan Home Exteriors
  (Oct 30 2026: its schema has `coverage`, its `lib/hero-scrim.ts` exports `pageHeroScrimCss`).
- **UI**: the website deliverable card shows Provision site (no `repoUrl`), Run agent
  (kind, brief or instructions, dry preview, Dispatch) and Sync workflow (PR mode, when
  `repoHasWorkflow === false`). The Agents tab reads `GET /api/admin/ops/agents`:
  runs newest first with PR / preview / run links, rows expand to the input and report
  excerpt, and "Sync workflow to all repos" runs dry, then takes a mode and confirms.

### Ops HQ (`?tab=hq`, `lib/ops/hq/`, branch `ops-hq`, Oct 26 2026)

Jacob talks to a chief agent; the chief hands work to specialists (ads, web); every
step streams into a live feed; each job ends with a report and approvals Jacob
pushes or rejects. Built checkpoint by checkpoint; this section grows with each.

**Tables** (`scripts/sql/2026-10-26_add_ops_hq.sql`, applied Oct 26 2026):

| Model | Purpose |
|---|---|
| `OpsJob` | One request from Jacob: `prompt`, `status` (planning, running, awaiting_approval, done, failed, cancelled), the chief's final `summary`, `engagementIds` in scope. |
| `OpsMessage` | The HQ chat log, `role` jacob or chief. `jobId` is optional so plain chat works. |
| `AgentEvent` | The live feed: one row per completed content block or status change of a run. `kind` status, thinking, tool_call, tool_result, text, error; `label` is one line (~140 chars); `detail` the payload, never a secret. Index (runId, createdAt). |
| `OpsApproval` | A proposed change waiting for Push: `kind` ads_change or web_push, the exact action list or PR info in `detail`, `expected`, `status` pending, approved, rejected, applied, failed. |

`AgentRun` gained three nullable columns: `jobId`, `agent` (chief, ads, web; null on
rows from before HQ, which are web) and `mode` (work, apply).
`scripts/sql/2026-10-26_ops_hq_chief_runs.sql` (applied Oct 26 2026) makes
`AgentRun.engagementId` nullable: a chief run spans the whole board. Only chief runs
have no client. The board and the Agents tab list client runs only
(`engagementId not null`); the build callback answers 400 for a run with no client.

**Runtime** (`lib/ops/hq/`):

- `anthropic.ts`: raw `fetch` to `/v1/messages` with `stream: true`, SSE parsed by
  hand. Do **not** swap in `@anthropic-ai/sdk`: the repo pins 0.52 for the SMS webhook.
  Each content block is rebuilt from its start + deltas and handed to `onBlock` when it
  stops. Every request: adaptive thinking with `display: "summarized"` (the feed shows
  the summaries), `output_config.effort`, the system prompt cached. `claude-opus-5-5` and
  `claude-sonnet-5-5` also send `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`): on a policy decline the API re-runs the request on
  a fallback model and the feed shows "Switched to …". No MCP connector: every agent
  works through client tools. 429, 529 and 5xx are retried with backoff. Key
  `ANTHROPIC_API_KEY_BUILDS`, never logged.
- `loop.ts` `runAgentLoop`: at most 60 model turns per run. Client `tool_use` blocks run
  here (inputs strictly parsed and checked against the tool's schema; a bad or cut-off
  input goes back as an error result and is never run); `pause_turn` re-sends the
  conversation as is; `refusal` fails the run. History is append-only (assistant blocks
  go back exactly as received). The run row is read before every turn; `cancelled`
  stops it.
- `events.ts`: one `AgentEvent` per completed block (thinking summary, text, tool call,
  tool result, fallback switch) plus status rows. A tool that writes its own event
  (an ads write) returns `label: null` so the loop does not add a second line. Labels are one
  line, at most 140 chars; details are capped at 20k chars. `noEmDash` strips em dashes
  from every label, chat message and report.
- `runs.ts`: `createRun` (status running, a Started event), `finishRun` (a cancelled
  run stays cancelled), `failRun` (status failed plus an error event).

**The chief** (`lib/ops/hq/chief.ts`, `OPS_CHIEF_MODEL`, default `claude-opus-5-5`,
effort medium). Its context is the last 40 HQ messages (jacob → user, chief →
assistant) and today's date in America/Detroit. Tools:

| Tool | What it does |
|---|---|
| `get_board` | Compact rows from `getOpsBoard()` (ignored rows left out): stage, services, each deliverable's step, waitingOn, note and status, ads customer id, repo URL, alerts, decisions; plus `waitingTotals` per owner (computed, so the chief never counts by hand) and follow-ups due. |
| `get_client` | One client in full, its valid step keys per deliverable, decisions, last 10 activities, last 5 agent runs. |
| `log_update` | An `OpsActivity` (note) in Jacob's words, an optional step change (validated like the deliverables PATCH; sets `stepUpdatedAt` and the default `waitingOn`), an optional next follow-up (Detroit time; a date alone is 9:00, `lib/ops/dates.ts`), an optional `statusLine` (a `status` activity: the client card's status line). One transaction. |
| `get_needs_you` | `rankNeedsYou` over the board and pending approvals: the same ranked list as Home's Needs you. "What should I do" is answered from it, in order. |
| `get_timeline(engagementId?, days?, kinds?)` | `getTimeline` (last 7 days by default, ≤ 100 rows): approvals with who decided and when they applied, jobs, runs, activities. "What did I approve this week" is answered from it. |
| `set_client_amounts(engagementId, monthlyAmount?, upfrontAmount?, clear?)` | Writes `monthlyAmount` / `upfrontAmount` through the PATCH's `nullableNumber` check and logs a `system` activity with old and new values. |
| `record_decision` | An `OpsActivity` kind `system`, body `DECISION: …`. Every decision for the clients in scope is handed to specialists. |
| `start_ads_task` | One ads specialist run per account under the current job (`'all_ads_clients'` = every client with `ads` in services and a customer id). Never-touch clients and clients without a customer id are skipped with a reason; missing Google Ads credentials stop the call ("offline: Google Ads credentials not set") and the chief tells Jacob. |
| `start_web_task` | Offline for now (returns an error the chief relays); wired at checkpoint 5. |
| `finish_job` | `OpsJob.summary` = JSON `{ text, sections[], pendingApprovals }`; status `awaiting_approval` when approvals are pending, else `done`. |

The chief's last text becomes an `OpsMessage` (role chief). A thrown error fails the
run and posts "I hit an error and stopped: …" in the chat.

**The ads specialist** (`lib/ops/hq/ads.ts` + `ads-tools.ts`, `OPS_AGENT_MODEL`, default
`claude-sonnet-5-5`, effort high; checkpoint 3 landed Oct 27 2026). One `AgentRun` per
account (agent ads, kind ads_task, mode work or apply). A plain tool_use loop over the
**platform's own Google Ads API credentials** through `getGoogleAdsClient()` in
`lib/google-ads.ts`: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
`GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_MCC_ID` (read by
name; any missing ⇒ offline). Every call takes `customerId`, must equal the run's
account, and logs in with `login_customer_id = GOOGLE_ADS_MCC_ID`. Explorer access:
2,880 operations a day across everything, so one run is capped at 150 Google calls.
No Sapt, no MCP. System prompt `lib/ops/hq/prompts/ads.md` (Jacob's playbook; its
"Known limits" section replaced the Sapt one Oct 27 2026).

| Tools | Mode |
|---|---|
| `list_campaigns`, `campaign_performance(days)`, `search_terms(days, minCost, campaignId?)`, `keyword_performance(days)`, `conversion_actions_and_goals`, `campaign_settings(campaignId?)` (budget and whether shared, bidding and its limits, location option, networks, dates, locations, ad groups with bids, campaign negatives), `change_history(days ≤ 30)` | both |
| `add_campaign_negatives` (PHRASE, ≤ 50), `pause_campaign`, `exclude_conversion_goal(category, origin)` (account goal `biddable: false`), `set_ad_group_cpc` (lower only), `set_location_option(PRESENCE)`, `create_search_campaign(spec)` (always PAUSED, one atomic mutate; `languageIds` add language criteria), `create_conversion_action` (AD_CALL, WEBPAGE, WEBSITE_CALL, CLICK_TO_CALL; never send `include_in_conversions_metric`, Google rejects it as immutable), `add_call_asset` (asset + campaign link, optional AD_CALL action), `set_network_settings`, `create_ad_group`, `add_keywords` (≤ 100), `upsert_rsa`, `pause_ad_group` / `enable_ad_group(campaignId, adGroupId)` (checks the group is in that campaign), `set_ads_step(step, note)` (the client's ads deliverable step, waitingOn, waitingNote and a note activity) | work |
| `find_client_account(query)`, `bind_account(customerId)` | work, only in a run that started with no customer id on the board |
| `set_campaign_budget` (refuses a shared budget), `enable_campaign`, `set_campaign_end_date`, `set_ad_group_cpc` (any direction), `set_location_option`, `set_bidding_strategy` (MAXIMIZE_CLICKS + ceiling, MANUAL_CPC, MAXIMIZE_CONVERSIONS), `remove_campaign_criterion` | apply: only the approved proposal's tool, only with its exact args (anything else is refused) |

Every write goes through `mutate()`: `validate_only` when the tool is called with
`validateOnly: true` or the run is `dry`, and one `AgentEvent` with the exact
operations and Google's response ("Changed: …" / "Checked, no change made: …"; on a
rejection an error event with Google's error list). Work runs make the AUTO changes;
anything else comes back in the closing JSON as a proposal whose `action` is the apply
tool and `args` its arguments, and becomes an `OpsApproval` (ads_change, pending).
`parseAdsReport` reads the last json fence (or the last `{"done"` object).

**Runs with no account yet.** `startAdsRun` accepts a client with no Google Ads customer
id (work mode only). The run starts with `find_client_account` (customer_client
under the MCC, level 1, not managers, matched on name words) and `bind_account`, which
checks the account is under the MCC, enabled and not on the never-touch list, then
binds the run (`input.customerId` is updated), sets `Business.googleAdsCustomerId`
when it is empty (the single HQ write to `Business`; a different id already there is
refused for Jacob to fix by hand) and `evidence.adsCustomerId` on the ads
deliverable. Every other tool refuses until the run is bound.

**Job report** (`lib/ops/hq/jobs.ts`). When an ads (or web) run ends, `onSpecialistRunEnded`
checks its job: if no specialist run in it is still active, it claims the job
(`running` → `reporting`, conditional) and `runChiefReport` re-invokes the chief once
with each run's parsed report, links (Google Ads account) and approvals. The chief
calls `finish_job` (sections per agent: did, expect, links, waitingForPush) and posts
a short chat message. If it does not, a report built from the runs is written. A job
already at `awaiting_approval` becomes `done` once no approval in it is pending or being
applied. `finish_job` refuses while a specialist run in the job is active.

**Specs.** The chief's `read_spec(path)` reads `.md` files under `docs/ads-specs/` only
(realpath checked) and passes the full text into `start_ads_task`. `next.config.js`
traces `docs/ads-specs/**/*.md` into the message route for Vercel.

**Report check (work runs).** Before approvals are made, every proposal must name an
apply tool with args that pass that tool's schema (`checkProposal`), and no
`ui_step` may describe a change a tool can make (bidding strategy, location option,
end date, budget, enabling a campaign, an ad group bid: the `API_DOABLE` patterns in
`ads.ts`). `ui_steps` are only for UI-only work (conversion setup, call assets,
sitelinks, billing, verification, keyword-level bids); advice goes in `expected`. On a
failure the model gets one turn to resend the JSON; proposals still invalid after
that get no approval and the feed shows an error.

**Approvals and apply mode** (checkpoint 4, Oct 27 2026). `decideApproval()` in
`lib/ops/hq/approvals.ts`, called by `POST /api/admin/ops/hq/approvals/[id]`
`{ decision: 'approve' | 'reject' }`. Only a pending approval can be decided (the flip
is conditional; 404 / 409 otherwise). Reject: status rejected. Approve (ads_change):
status approved, then an apply-mode ads run under the same job with
`input.approval = { id, action, args }`; the route runs it under `waitUntil` and
answers `{ applyRunId }` at once; `detail.applyRunId` links them. The run gets the
reads plus that one tool, and the tool wrapper refuses any call whose args differ
from the approved ones. When it ends the approval becomes `applied` (`appliedAt`) only
if that tool changed the account, else `failed` with the reason; a run that cannot
start fails the approval at once. web_push answers 400 until checkpoint 5. First
apply: OC Water Pros campaign 24328356850, Maximize Conversions → Maximize Clicks
with an $8 ceiling (approval cmvquz7hk000wri0jto5hhxca, applied Oct 27 2026).

Notes:
enums come back from the library as numbers (`en()` maps them to names); the library
builds update masks from the resource's fields, so an empty sub-object (e.g.
`manual_cpc: {}`) would mask nothing, which is why bidding sets a field inside it;
`change_event` refuses a start more than 30 days back.

**The HQ pieces** (Oct 27 2026; since Oct 28 they live on Home, see "Ops command
center" below). One poll, `GET /hq/feed?since=` (`app/admin/ops/useHqFeed.ts`, held by
the Ops shell), every 2 s while Home is open and visible, 15 s otherwise, and at once
after a send, Push, Reject or Stop.

| File | What it is |
|---|---|
| `lib/ops/hq/personas.ts` | `{ key, name, role, color, avatarLetter, idleLine }` per agent (Chief, Ads, Web). Rename or recolour an agent here only. |
| `app/admin/ops/HqOffice.tsx` | One desk per persona. State: Working (an active run; green pill with a slow pulse) beats Waiting for you (pending approvals for that agent; amber) beats Failed (last run failed; red) beats Idle (idleLine and time since the last run). Working shows the client, elapsed time, the latest event label typed in (CSS clip-path steps, one line, ellipsis) and a 44px Stop (cancel route). A click opens `RunDrawer`: every event with its offset from the start, tool calls mono, results muted, errors red, details expandable, live events appended from the poll, auto-scroll while running and pinned to the bottom. |
| `app/admin/ops/HqChat.tsx` | Jacob right, chief left with `Markdown` (bold, italics, code, links, lists, headings; React nodes, no HTML). "Chief is thinking" while a chief run is active. The job report renders as a card (per agent: Did, Expect, Waiting for Push, links) under the job's last chief message. Composer pinned at the bottom: Enter sends, Shift+Enter is a new line. Empty state: "Tell the chief what happened or what you need." |
| `app/admin/ops/HqApprovals.tsx` | `ApprovalCard`: agent, client, title, the exact change (action in mono and its args), why, expected, the cost line from `monthlyCostChange`, links (Google Ads account, PR, preview), Push and Reject (44px). `compact` (Home) puts the change behind Details. A proposal with `detail.hold` shows the reason in amber and Push turns into an amber "Push anyway" that needs a second click. After Push: Applying… (approved), then Applied or Failed with the error. |
| `app/admin/ops/hqShared.tsx` | Feed types, formatters, `Avatar`, `Markdown`, and the two keyframes (typing, pulse; both off under `prefers-reduced-motion`). |
| `lib/ops/hq/links.ts` | `adsAccountUrl(customerId)` (`ads.google.com/aw/overview?__e=`). |

**Routes** (all `requireAdmin()`):

| Route | What it does |
|---|---|
| `POST /api/admin/ops/hq/message` | `{ body?, attachments? }` (`parseChatMessage`; one of the two required) → saves the message, starts a chief run, returns `{ messageId, runId }` at once; the run continues under `waitUntil` (`maxDuration` 800). |
| `GET /api/admin/ops/hq/feed?since=` | New messages and events since `since` (events max 200; without `since`, the last 50 / 200), active runs plus runs finished in the last 30 min with their latest event, `lastRuns` (each HQ agent's most recent run, any age), approvals pending or decided in the last 30 min, the last 20 jobs with parsed reports, and `cursor` for the next poll. |
| `POST /api/admin/ops/hq/approvals/[id]` | `{ decision }` → `decideApproval()`; an approved ads_change starts the apply run under `waitUntil` and answers `{ applyRunId }`. |
| `GET /api/admin/ops/hq/jobs?engagementId=&before=&limit=` | Job history: jobs newest first with their runs and approvals, `nextBefore` for the next page. With `engagementId`, jobs whose `engagementIds` or runs include that client. No screen uses it since the Timeline (below); kept for scripts. |
| `GET /api/admin/ops/hq/runs/[id]/events` | One run and every event it wrote (up to 2,000), for the desk drawer. |
| `POST /api/admin/ops/hq/runs/[id]/cancel` | queued, running or dispatched → cancelled; the loop stops before its next turn. 409 when already finished. |

### Ops command center (branch `ops-command-center`, Oct 28 2026)

One dashboard for agents, clients, what to do and what happened. Tabs: **Home**
(default), **Clients**, **Money**, **Timeline**, **Agents**. `?tab=hq` and `?tab=today`
redirect to Home; nothing those tabs did was dropped. No schema change.

**Home** (`HomeTab.tsx`). A fleet line (active clients, Verified and Projected MRR
behind the `adminShowRevenue` cookie, agents working, waiting for Push, clients with
red alerts), then three columns on xl (lg: two, clients below; mobile: Needs you,
office, chat, clients):
- **Needs you** (`NeedsYou.tsx`): `rankNeedsYou(board, approvals)` in `lib/ops/needs-you.ts`,
  pure, also the chief's `get_needs_you`. Rank: 1 pending approvals (compact cards,
  oldest first), 2 red alerts (one row per client), 3 steps with `waitingOn = jacob`
  (oldest `stepUpdatedAt` first), 4 follow-ups due (client and prospect), 5 today's
  calls (counted only while unmarked), 6 yellow alerts (`follow_up_due` left out).
  Each row has its one action (Push/Reject, Open, Log contact + 1d/3d/7d, Showed/No-show).
  Approvals decided in the last 30 min sit on top as one line each, uncounted. Steps
  waiting on clients and vendors are a collapsed list at the bottom. The count is on
  the Home tab label.
- The office and the chat (unchanged components), the job report in the chat.
- Clients as cards (`ClientCard.tsx`), health then latest activity, 12 then Show all.

**Client card.** Health dot, name, stage, the status line, what waits on whom
(`waitingLine`), services, the ads state (`adsState`: Running $X/day from
`evidence.dailyBudget`, Built paused, Account needed, or the step), last contact, next
follow-up, the monthly amount (revenue shown), and the desks' green pulse with
"Ads is working" while an HQ run for that client is active. Helpers in
`lib/ops/client-status.ts`.

**Status line convention.** A client's current status is the newest `OpsActivity` with
`kind = 'status'` (added to `OPS_ACTIVITY_KINDS`). The board carries it as `statusLine`
and `statusAt` (one `distinct` query). The chief sets it with `log_update`'s
`statusLine`; Jacob sets it in the panel's Status input (the activities POST with
`kind: 'status'`). Without one, `derivedStatusLine` phrases the oldest open step
("Website: Review the agent's PR and preview"), or what is live when nothing is open;
the card shows a derived line dimmer.

**Clients tab** (`ClientsTab.tsx`). Counts by stage (each filters), Verified MRR and
Projected MRR large (`headlineMrr` in `lib/ops/money.ts`: verified = active verified +
pending verified; projected = verified + active projected + pending projected, the
same buckets as the Money cards, so they agree to the dollar), the pending clients
itemised with monthly and upfront editable in place (`AmountInput`, the engagement
PATCH; the panel's Stripe block edits them too), the unmatched Stripe strip, then the
card grid with search, stage, service, health, sort and Show ignored, each card adding
the deliverable chips and Stripe status.

**Timeline** (`Timeline.tsx`, `lib/ops/timeline.ts`). `getTimeline({ before, from,
engagementId, agent, kinds, limit })`: four findMany with one cursor, merged and sorted
in code. Rows: approvals (at = applied, else decided, else created; who decided, when
applied, cost, error), jobs (prompt, report, run count), runs (agent, client, status,
duration), activities (`decision` for `DECISION:` rows). Kinds filter: approvals, jobs,
runs, notes, decisions. The tab adds client, agent and a Detroit date range; grouped by
day; 50 a page. The client panel shows it fixed to that client.
`GET /api/admin/ops/timeline?before=&client=&agent=&kinds=&from=&limit=`.

**Who pushed.** `decideApproval(id, decision, by = { decidedBy: 'jacob', decidedVia: 'hq' })`
writes both into the approval's `detail`; apply runs carry `approvalId` in their input.
Approvals decided before Oct 28 2026 have neither; the chief reports them as Jacob's
(only Jacob can decide).

**Chief prompt.** Jacob reports what he did in plain language; the chief records it
(`log_update` with step and `statusLine`, `record_decision`, `set_client_amounts`) and
reflects it back in one line. "What should I do" comes from `get_needs_you` in rank
order; "what did I approve" from `get_timeline`.

**Fixes from Oct 27.**
- Follow-ups from `log_update` are Detroit time; a date alone is 9:00 (they were
  midnight UTC, 8 pm the evening before).
- After an apply run's `enable_campaign` changes the account, the ads step moves to
  `running` with `evidence.dailyBudget` (sum of enabled campaigns). After a work run's
  `pause_campaign` with no campaign left enabled, it moves to `paused_by_client`, unless
  the agent set the step itself. `syncAdsStep` in `lib/ops/hq/ads.ts`; write records
  now carry their args.
- Proposals may carry `hold: "<reason>"` (playbook, report parser); the card holds Push
  behind "Push anyway".
- `pause_ad_group` / `enable_ad_group` (work mode).
- `adsError` adds the field path and Google's request id, and names the case where
  Google answers `request_error=UNKNOWN`, "The error code is not in this version": the
  real reason is a code newer than the library's API (google-ads-api 23.0.0), so it is
  hidden; try the same change in the Ads UI. That is what CM Home Services'
  (2035901601) AD_CALL conversion action hit on Oct 27; the raw error was already
  logged with the event.

### Client photos: the intake page and the HQ chat (Oct 30 2026)

Two ways in, one pipeline. Every file goes from the browser straight to Vercel Blob
(`@vercel/blob/client` `upload()` with a token route); no file passes through a
function body.

- **Shared queue** (`app/admin/ops/UploadQueue.tsx`): `useUploadQueue` + `QueueList`.
  Checks type and the 40 MB cap (`rejectReason`, `lib/ops/intake.ts`), prepares in
  the browser (`lib/ops/intake-upload.ts`: HEIC/HEIF to JPEG via `heic-to`, any
  raster over 2400 px shrunk to JPEG 0.85, filename kept with the new extension),
  3 uploads at a time, a row per file ending in Saved or a red reason with Retry.
  **Use `heic-to`, not `heic2any`:** heic2any's libheif cannot read iOS 18 photos
  (iPhone 16, `tmap` HDR gain map brand); it failed on a real one.
- **Intake page** (`/admin/ops/intake/[id]`, `Uploader.tsx`): token
  `POST .../engagements/[id]/assets/token` (path `ops-intake/{id}/{uuid}-{name}`),
  then `POST .../assets` writes the record only after `head()` confirms the blob,
  with width and height; a filename already used by the client gets ` (2)`.
- **HQ chat** (`HqChat.tsx`): drop on the panel, paste, or the paperclip. Token
  `POST /api/admin/ops/hq/attachments/token` (path `ops-inbox/{uuid}-{name}`). The
  message carries `attachments: [{ url, filename, width, height, bytes }]` on the new
  nullable `OpsMessage.attachments` (`scripts/sql/2026-10-30_add_opsMessage_attachments.sql`,
  applied to production Oct 30 2026); text is optional. Thumbnails render in the
  bubble, with a check once filed.
- **The chief sees them**: `chatHistory` turns a message's unfiled attachments
  (under 7 days old, not SVG, 30 newest across the history) into image blocks
  (`source: { type: 'url' }`, the public Blob URL) plus a list of url and filename.
  Prompt: know whose they are or ask "Who are these for?" and wait, never guess or
  choose between two clients, caption only what is in the frame, never touch the brief.
- **`file_photos(engagementId, photos[])`** (`lib/ops/photo-filing.ts` rules +
  `photo-filing-server.ts`): only unfiled photos from this chat; service must match one
  of the client's intake services (case-insensitive, stored as written there) or be
  left out; one hero per call; one logo per call (it replaces the logo on file). Copies
  each blob to `ops-intake/{id}/` with `copy()`, appends to `intake.assets` under the
  intake row lock (suffixes recomputed there), marks the attachments `filedTo`, deletes
  the inbox blobs, writes one OpsActivity note "Filed N photos from chat".
- Unfiled inbox blobs older than 7 days are deleted by the ops sync.

### Photo batches: the inbox and the Photo desk (Oct 31 2026)

A drop can be up to **200 photos** (`MAX_ATTACHMENTS`, enforced in the composer
with a reason and again by `parseChatMessage`). Big drops never go into the
chief's context whole.

- **Composer**: a drop over 200 (counting what is already queued) adds nothing and
  says why. Send while uploads run queues the send ("Sends when the uploads finish";
  press again to cancel); the summary reads "32 of 50 saved. Uploading…". Failed rows
  stay in the list with Retry and go out on the next message. A bubble shows 12
  thumbnails and "+N more".
- **Inbox** (`lib/ops/hq/inbox.ts`, rules in `collectInbox`): every unfiled photo
  across Jacob's messages (newest message wins a url on two), plus **unsent** blobs
  under `ops-inbox/` that no message mentions (a drop whose send failed). Unsent ones
  carry no width/height and their filename is the path minus the 36-character uuid.
  `adoptUnsent` puts them on one jacob message dated at the first upload before they
  are captioned (captions live on message attachments). Writes to a message's
  attachments go through `updateAttachments` under a row lock, so captions and
  `filedTo` never overwrite each other.
- **The 6-photo threshold** (`BATCH_THRESHOLD`, `isBatch`): 6 or fewer behave as
  before. More: the message route creates an OpsJob for the message, starts a photo
  run on its urls, and the chief's run joins that job. The chief sees a count and the
  first 6 unfiled photos only (`lib/ops/hq/photo-view.ts`).
- **Photo desk** (`lib/ops/hq/photo.ts`, agent `photo`, kind `photo_caption`,
  model `OPS_PHOTO_MODEL`, default `claude-sonnet-5-5`): 10 photos per model turn as
  image blocks, one forced-shape tool `record_captions`. Writes onto each entry:
  `caption` (one sentence, 12 to 18 words asked, trimmed at a clause past 20; no town or job), `suggestedService`, `heroScore` 0 to 5,
  `beforeAfter`, `isLogo`, `hasFaceOrPlate`, `captionedAt`. Each turn is saved
  before the next (`captionInChunks`), progress goes to the run's `output` and a
  feed line "Captioning 50 photos, 30 done". One photo run at a time; one still running
  after 20 minutes is failed so a new one can start and pick up the uncaptioned rest.
- **Waking the chief**: `onSpecialistRunEnded` counts photo runs with ads and web. When
  the job's runs are done, `runChiefAfterPhotos` runs the chief once with the chat plus
  a note (tools: get_board, get_client, list_inbox, file_photos): it files when Jacob
  has said whose, else asks "Who are these for?". A photo-only job then closes as done;
  a job with ads or web runs goes on to the usual report.
- **Chief tools**: `list_inbox(limit)` returns counts and the first N entries as text,
  never images. `caption_photos(urls?, messageId?)` starts the Photo desk on uncaptioned
  photos (adopting unsent ones). `file_photos({ engagementId, all: true, messageIds? })`
  (`fileAllPhotos` + `planAll`): every unfiled **captioned** photo in scope, refused
  while a photo run is still captioning in scope. `suggestedService` is mapped by
  `matchService` (exact, else the one service every word of whose name is in the
  suggestion, else the one service holding every word of a short suggestion; two
  candidates or none stay blank: "Lawn care" is not Lawn Mowing). Hero: the single highest `heroScore` above 0 that
  has no face or plate, and none when the client already has a hero. The first logo is
  filed as kind logo, other logos stay in the inbox. Photos with a face or plate never
  get a service. Order: after photos, then the rest in drop order, then before photos.
  The explicit `photos[]` form is unchanged (20 per call).
- Read-only check of what list_inbox would see: `listInbox()` + `inboxText()`.

