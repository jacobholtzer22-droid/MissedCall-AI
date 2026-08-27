# CLAUDE.md — MissedCall AI: Complete Codebase Reference

This document is the single source of truth for understanding, debugging, and modifying this codebase. Read before touching anything.

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
│   │       │   ├── page.tsx      # FeatureGate(missedCallAiEnabled) → LeadsClient
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
│   │   ├── marketing-bookings/   # POST: /book page discovery call booking
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
│   │   │   ├── website-leads/             # GET: website leads, owner-group-aware (403 if !missedCallAiEnabled)
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
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile secret key for `/api/contact` verification. Without it, Turnstile checks are skipped |
| `TURNSTILE_ENFORCE` | No | `'true'` to reject submissions with missing or failed Turnstile tokens. Default: `false` (log only, process normally). Roll out by setting to `'true'` after confirming Turnstile widget is live on all forms |

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
status      String   @default("new")  // new, contacted, converted, closed
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

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
| `/api/marketing-bookings` | POST | Same as above but for /book marketing page | Creates appointment with `createMarketingCalendarEvent()` |

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
| `/api/dashboard/website-leads` | GET | WebsiteLead records, newest first. 403 if primary's `!missedCallAiEnabled` (sibling flags never gate). Owner groups: leads for ALL group businesses, each lead carries `businessName`, response adds `isGroup: true`. Ungrouped: today's exact `{ leads }` shape, no new fields. The PATCH (lead status) lookup is also group-scoped. |
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
| `/api/admin/view-as` | GET | Set `adminViewAs` cookie (24-hour maxAge) to view dashboard as a client |
| `/api/admin/google-ads/sync` | POST | Sync Google Ads data. Body: `{ businessId? }`. Syncs one or all enabled businesses. Returns `{ synced, errors }` |

### Dashboard Google Ads

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/google-ads` | GET | Google Ads data. 403 if primary's `!googleAdsEnabled`. Query: `startDate`, `endDate`, `groupBy` (day\|campaign). Returns `{ totals, daily, campaigns, lastSyncedAt }`; owner groups add `isGroup: true` + `perSite` and tag campaign rows with `businessName`. Default last 30 days. |
| `/api/dashboard/google-ads/sync` | POST | Trigger Google Ads sync. 403 if primary's `!googleAdsEnabled`. Ungrouped: 400 if no `googleAdsCustomerId`. Owner groups: loops members with `googleAdsEnabled && googleAdsCustomerId` (others skipped, not errors), aggregates `rowsSynced`/`errors` (errors prefixed with business name). Returns `{ success, rowsSynced, errors, lastSyncedAt }`. |

### Contact / Book Demo

| Route | Method | Purpose |
|---|---|---|
| `/api/contact` | POST | Website contact form. Body: `{ name, phone?, message?, smsConsent, businessId?, businessSlug?, email?, website?, turnstileToken? }`. **Spam hardening:** `website` is a honeypot (non-empty = spam); `turnstileToken` is verified against Cloudflare Turnstile siteverify (4s timeout, fails open on network error). `TURNSTILE_ENFORCE=true` rejects missing/failed tokens; default false (log only). Spam path: marketing submissions are logged with `[SPAM]` prefix and return 200 (no email, no DB write); tenant submissions create a `WebsiteLead(status='spam')` and return 200 (no Contact, no owner notification). Bots see an identical success response. **Normal path:** when no `businessId`/`businessSlug` (marketing page): sends Resend email to `YOUR_EMAIL`. When either is present (client tenant site): awaits `findOrCreateContact(source='website_form')` + `db.websiteLead.create(status='new')` sequentially in-path, then calls `notifyOwnerOnWebsiteLead()` (owner SMS + email). All DB writes are fully awaited before responding. All user input in the email body is HTML-escaped via a local `escapeHtml()` helper. No auth, no rate limiting — open endpoint. |
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
- `DashboardShellClient`: sidebar navigation, user menu, "View as Client" admin toggle
- Nav items built via `getBusinessFeatures(business)` — current structure:
  - Always: Overview, Conversations, Outreach, Analytics, Contacts, Jobs, Settings
  - `hasMissedCallAi`: Website Leads, Scheduled Quotes
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
- FeatureGate `locked` (mode='locked', `enabled = business.missedCallAiEnabled !== false`, feature "Leads")
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

33. **No alerting on webhook delivery failure** — The July 2026 outage was discovered by a client complaint, not monitoring. A dead-man's-switch check (daily "was any Conversation created in the last 24h?" → alert Jacob if not) is planned but not built.

### Owner Groups

34. **The grouped Google Ads GET displays snapshots by group membership, NOT by member flags** — `/api/dashboard/google-ads` queries `GoogleAdsSnapshot` for every business in the owner group regardless of each sibling's `googleAdsEnabled` flag (only the primary's flag gates the 403). Toggling a sibling's `googleAdsEnabled` off stops the *sync loop* from refreshing its data but does NOT remove its existing snapshots from the group view. To remove a site from a group view, clear its `ownerGroupId` (or delete its snapshots) — do not expect the flag toggle to do it.

35. **Ungrouped responses are byte-for-byte unchanged** — For a business with `ownerGroupId = null` (or a singleton group), the website-leads and google-ads responses contain NO new fields (`isGroup`, `perSite`, `businessName` are all absent, campaign map keys unchanged) and the clients render today's exact JSX. The new fields appear only when group size > 1. Preserve this when touching these routes: it's the compatibility guarantee for every existing client.

### Spam Hardening

36. **`WebsiteLead(status='spam')` is excluded from all dashboard queries** — `/api/dashboard/website-leads` and `/api/dashboard/analytics` both filter `status: { not: 'spam' }`. Admin/Neon access is intentionally unfiltered so Jacob can audit spam volume. If you add a new query on `WebsiteLead` for client-facing surfaces, add the same filter.

37. **Turnstile enforcement is opt-in via `TURNSTILE_ENFORCE`** — Default `false` means missing or failed Turnstile tokens are logged but the lead is processed normally. Set to `'true'` only after confirming the Turnstile widget is live on all forms that POST to `/api/contact`. Siteverify network failures always fail open (lead allowed) regardless of enforce mode — never lose a real lead to a Cloudflare outage.

### Client-Side Tags

38. **Never verify a client-side tag by grepping the served HTML.** `MetaPixel` renders a `next/script` with `strategy="afterInteractive"` from inside a client component, so the snippet lands in the layout JS chunk (`/_next/static/chunks/app/layout-*.js`), never in the HTML document. A clean HTML grep is the expected result for a perfectly healthy pixel. `.env.local` is equally useless as evidence: it is gitignored and never deployed. To verify, grep the layout chunk, run `vercel env ls production`, and check an older deployment before declaring an outage. A 2026-08-21 audit declared a full pixel outage on exactly these two invalid tests when the pixel had been live since 2026-05-30. See `docs/pixel-record-correction.md`.

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

**Mobile:** The admin dashboard is designed to be used on a phone. All components are responsive — see mobile notes below.

### Files

| File | Purpose |
|---|---|
| `app/admin/page.tsx` | Lean server shell: auth check, fetch all businesses, render `<AdminClient />` |
| `app/admin/AdminClient.tsx` | Main client component: `<HeaderKPIs>` + `<ClientTable>` + `<ClientDetailPanel>` slide-out. Header is `flex-wrap`; search input grows on mobile. |
| `app/admin/ClientTable.tsx` | **Mobile:** card list (`md:hidden divide-y`) per business. **Desktop:** dense table (`hidden md:table`). `FeatureIcons` defined at module scope. Columns: Name, Status, MRR, Features, Convos (this month / all-time stacked), Leads (this month / all-time stacked), Actions |
| `app/admin/ClientDetailPanel.tsx` | Slide-out panel triggered by row click. `w-full sm:w-[520px] lg:w-[600px]` — full-width on phones. Three tabs: Toggles, Settings, Tools |
| `app/admin/HeaderKPIs.tsx` | Top KPI strip: `grid-cols-1 sm:grid-cols-3` — stacks on mobile |
| `app/admin/AdminTools.tsx` | Admin-level tools (Telnyx usage sync, Excel export) |
| `app/admin/types.ts` | `AdminBusiness` interface — includes all Business fields plus `_count` (conversations, appointments, users, screenedCalls, blockedCalls30d) and computed `conversationsThisMonth`, `conversationsLastMonth`, `leadsThisMonth`, `conversationsAllTime`, `leadsAllTime` |
| `app/admin/ClientDetailPanel/TogglesTab.tsx` | Toggle rows for all feature flags: MissedCall AI, Call Screener, Spam Filter, Online Booking, Google Calendar (read-only status), Google Ads, Notify by SMS/Email, Mass Outreach (massMessagingEnabled). `px-4 sm:px-6` padding. |
| `app/admin/ClientDetailPanel/SettingsTab.tsx` | Editable fields: fees, Telnyx number, forwarding number, AI config, timezone, `ownerGroupId` (Admin Only section — blank clears the group). All `grid-cols-2` form rows are `grid-cols-1 sm:grid-cols-2`. `px-4 sm:px-6` padding. |
| `app/admin/ClientDetailPanel/ToolsTab.tsx` | Per-business tools: bulk import contacts, view conversations, etc. `px-4 sm:px-6` padding. |

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

*This document reflects the codebase as of July 14, 2026 (SMS booking-link handoff). Update after any significant architectural changes.*

---

### Mobile Responsiveness Summary (as of May 2026)

The following dashboards are fully mobile-optimized (tested at < 640px):

| Area | Pattern |
|---|---|
| `/admin` main table | Mobile card list (`md:hidden`) + desktop table (`hidden md:table`) |
| `/admin` slide-out panel | `w-full sm:w-[520px] lg:w-[600px]` |
| `/admin` KPI strip | `grid-cols-1 sm:grid-cols-3` |
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
