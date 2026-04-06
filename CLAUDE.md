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

---

## 1. Stack & Dependencies

- **Framework:** Next.js 14.2.21 (App Router), React 18.3.1, TypeScript strict mode
- **Database:** Neon PostgreSQL via Prisma ORM
  - `DATABASE_URL` = pooled connection (runtime)
  - `DIRECT_URL` = direct connection (migrations only)
- **Authentication:** Clerk (`@clerk/nextjs`)
- **Telephony & SMS:** Telnyx (`telnyx` v5.37.1) — Call Control API + Messaging API
- **AI:** Anthropic Claude (`@anthropic-ai/sdk` v0.52.0)
- **Calendar:** Google Calendar API (`googleapis`) — OAuth2, service account not used; per-business OAuth tokens stored in DB
- **Email:** nodemailer (SMTP/Gmail) for owner notifications; Resend (`resend`) for voicemail alerts
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
│   ├── layout.tsx                # Root layout: ClerkProvider, ConditionalNavBar, dark bg
│   ├── page.tsx                  # Marketing homepage
│   ├── pricing/page.tsx          # Pricing page
│   ├── spam-screening/page.tsx   # Feature page for spam filtering
│   │
│   ├── (auth)/                   # Clerk auth pages (no nav)
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── onboarding/               # Post-signup business setup
│   │   └── page.tsx              # OnboardingForm.tsx client component
│   │
│   ├── book/                     # Public booking pages (no auth, iframe-embeddable)
│   │   └── [businessSlug]/
│   │       ├── page.tsx          # Full booking page
│   │       └── embed/page.tsx    # Stripped-down iframe version
│   │
│   ├── (dashboard)/              # Authenticated dashboard (Clerk-protected)
│   │   ├── layout.tsx            # Sidebar + DashboardShellClient
│   │   └── dashboard/
│   │       ├── page.tsx          # Dashboard home / overview
│   │       ├── messages/         # Conversations + SMS threads
│   │       │   └── page.tsx      # MessagesClient.tsx
│   │       ├── appointments/     # Booked quote visits
│   │       │   └── page.tsx      # AppointmentsClient.tsx
│   │       ├── contacts/         # CRM contact list
│   │       │   ├── page.tsx      # ContactsClient.tsx
│   │       │   ├── [id]/page.tsx # ContactDetailClient.tsx
│   │       │   └── import/page.tsx # ImportContactsClient.tsx
│   │       ├── voicemails/       # Voicemail recordings
│   │       │   └── page.tsx      # VoicemailsClient.tsx
│   │       ├── blocked-calls/    # Spam-screened call list
│   │       │   └── page.tsx
│   │       ├── website-leads/    # Contact form submissions
│   │       │   └── page.tsx      # WebsiteLeadsClient.tsx
│   │       ├── ads/              # Google Ads dashboard
│   │       │   └── page.tsx      # AdsClient.tsx (recharts line chart + campaign table)
│   │       ├── analytics/        # Usage + cost analytics
│   │       │   └── page.tsx      # AnalyticsClient.tsx
│   │       ├── emails/           # Email campaigns
│   │       │   ├── page.tsx      # EmailsClient.tsx
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
│   │   │   ├── messages/route.ts          # GET: list conversations
│   │   │   ├── messages/[conversationId]/ # GET: single conversation + messages
│   │   │   ├── messages/send/             # POST: manual SMS send
│   │   │   ├── messages/contacts/         # GET: contacts for message compose
│   │   │   ├── messages/campaign/         # POST: create email campaign
│   │   │   ├── messages/campaign/preview/ # POST: preview campaign
│   │   │   ├── contacts/route.ts          # GET/POST: list/create contacts
│   │   │   ├── contacts/[id]/route.ts     # GET/PATCH: contact detail/update
│   │   │   ├── contacts/[id]/activities/  # GET: contact activity timeline
│   │   │   ├── contacts/import/           # POST: bulk import from Excel/CSV
│   │   │   ├── voicemails/                # GET: list voicemails
│   │   │   ├── screened-calls/            # GET: list blocked spam calls
│   │   │   ├── website-leads/             # GET: list website lead submissions
│   │   │   ├── analytics/                 # GET: usage analytics data
│   │   │   ├── tags/                      # GET/POST: contact tags
│   │   │   ├── jobs/route.ts              # GET/POST: jobs for contacts
│   │   │   ├── jobs/[id]/route.ts         # PATCH/DELETE: update/delete job
│   │   │   └── emails/route.ts            # GET: email campaign list
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
│   │       └── view-as/                   # POST: set adminViewAs cookie
│   │
│   └── components/               # Shared UI components
│       ├── NavBar.tsx
│       ├── ConditionalNavBar.tsx  # Hides NavBar on /dashboard routes
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
│   ├── phone-utils.ts            # normalizePhoneNumber, normalizeToE164, phonesMatch
│   ├── utils.ts                  # cn(), formatPhoneNumber, formatRelativeTime, slugify
│   ├── business-hours.ts         # DEFAULT_BUSINESS_HOURS constant
│   ├── google-calendar.ts        # Full Google Calendar OAuth + slot logic
│   ├── create-booking.ts         # Shared booking creation (DB + calendar + SMS + notify)
│   ├── notify-owner.ts           # Owner SMS + email notifications (4 scenarios)
│   ├── sms-cooldown.ts           # Cooldown check/record/bypass/log
│   ├── contacts-check.ts         # isExistingContact, logContactSkip
│   ├── crm-utils.ts              # findExistingContact, findOrCreateContact
│   ├── import-contacts.ts        # parseContactFile (Excel/CSV → contacts array)
│   ├── telnyx-usage-sync.ts      # syncTelnyxUsage (MDR + CDR → TelnyxUsageRecord)
│   └── usage-export.ts           # getUsageForExport (aggregate for Excel export)
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
| `DIRECT_URL` | Yes | Neon direct (non-pooled) URL (used for `prisma migrate`) |

### AI
| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for SMS conversation AI |

### Telephony (Telnyx)
| Variable | Required | Purpose |
|---|---|---|
| `TELNYX_API_KEY` | Yes | Telnyx API key for all voice/SMS operations |
| `TELNYX_PUBLIC_KEY` | No | Webhook signature verification (not currently enforced) |
| `TELNYX_PHONE_NUMBER` | Fallback | Default Telnyx number if business has none provisioned |
| `TELNYX_CONNECTION_ID` | Yes (forwarding) | Used when dialing B-leg for call forwarding. Falls back to `connectionId` from call payload |

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

telnyxPhoneNumber       String?   @unique               // The number Telnyx routes calls/SMS through
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

smsCooldownDays         Int?                            // null = use SMS_COOLDOWN_DAYS env or 7 days
cooldownBypassNumbers   Json?     @default("[]")        // Phone numbers that skip cooldown (for testing)

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
- `calendarEnabled + googleCalendarConnected` must both be `true` for the SMS booking state machine to activate
- `callScreenerEnabled` without `forwardingNumber` = IVR gate → speak → hangup (no actual forwarding)
- `callScreenerEnabled` with `forwardingNumber` = IVR gate → "please hold" → dial B-leg → bridge

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
// Status values: active, booking_in_progress, appointment_booked, lead_captured,
//                closed, human_needed, needs_review, completed, no_response,
//                screening, screening_blocked, forwarding

manualMode            Boolean   @default(false)       // When true: inbound SMS saves to DB but AI does NOT respond
summary               String?   @db.Text              // AI-generated summary (not auto-generated; set by flow logic)
bookingFlowState      Json?                           // { step, slotsSent?, selectedSlot?, proposedDate?, ... }
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
status      String?   @default("new")  // new, contacted, quoted, booked, completed, lost
notes       String?   @db.Text
lastContactedAt DateTime?
updatedAt   DateTime @default(now()) @updatedAt
totalRevenue Float?   @default(0)

// Relations: contactTags[], jobs[], emailRecipients[], activities[]

@@unique([businessId, phoneNumber])
```

**CRITICAL:** `isExistingContact()` in `lib/contacts-check.ts` queries `Contact` where `source IS NULL`. Only contacts imported without a source (e.g. from a bulk CSV of existing customers) block automated SMS. Contacts created from missed calls (source='missed_call') do NOT block SMS.

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

Order of checks (all must pass):
1. Check `BlockedNumber` table → skip if found
2. `isExistingContact()` → skip if caller is in address book (source IS NULL)
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
   a. if !calendarEnabled → handleSmsLeadFlow()
   b. handleSmsBookingFlow()
   c. if booking flow returned false → generateAIResponse() (general AI)
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

### `handleSmsBookingFlow()` — Calendar booking state machine

Only runs when `business.calendarEnabled == true`. Uses `Conversation.bookingFlowState` (JSON) to persist state between SMS messages.

**Booking state machine steps:**

| `bookingFlowState.step` | What happens |
|---|---|
| (no state / detect intent) | Detect booking keywords in message. If intent detected, ask for preferred date. |
| `'ask_service'` | Ask what service they need |
| `'ask_date'` | Ask for preferred date/time |
| `'show_slots'` | Fetch available slots from Google Calendar, send 2-3 options |
| `'confirm_slot'` | User picked a slot, send confirmation message with "reply yes to confirm" |
| `'confirmed'` | User replied "yes" → call `createBooking()` |

**Booking intent detection:** Uses `BOOKING_INTENT_WORDS` array (book, appointment, schedule, quote, estimate, come out, come by, available, etc.) OR Claude AI for ambiguous cases.

**Slot fetching:** Calls `getAvailableSlots(businessId, todayStr, 14-days-ahead)`, formats slots as "Friday March 6th at 10:00 AM, 2:00 PM, or 4:00 PM".

**After `createBooking()` succeeds:**
- Send confirmation SMS to customer
- Update Conversation(status='appointment_booked')
- Notify owner via `notifyOwnerOnBookingCreated()`

### `generateAIResponse()` — Claude API call

**System prompt includes:**
- Business name, type, services offered
- Custom `aiContext` (business background)
- Custom `aiInstructions` (personality/rules)
- Current date/time in business timezone
- Calendar availability note (if calendar enabled)
- Instructions for special tags:
  - `[APPOINTMENT_BOOKED: datetime="YYYY-MM-DD HH:mm" service="..." name="..." address="..."]` — legacy AI-side booking
  - `[LEAD_CAPTURED: name="..." service="..." email="..." address="..." timeframe="..."]`
  - `[READY_TO_CAPTURE]` — signals lead info collected
  - `[HUMAN_NEEDED: reason="..."]` — flags need for human follow-up

**Conversation history:** All previous messages in the conversation are passed as `user`/`assistant` turns.

**Model:** Uses `claude-3-5-haiku-20241022` or similar (check current anthropic SDK default).

**Error handling:** If Claude API fails (503, overload), sends fallback "Let me have someone get back to you" message and calls `notifyOwnerOnAIFailed()`.

### AI response post-processing

After `generateAIResponse()`:
1. Strip all special tags from response before sending SMS
2. Check for `[READY_TO_CAPTURE]` → lead capture flow
3. Check for `[HUMAN_NEEDED]` → flag conversation, notify owner
4. Check for `[APPOINTMENT_BOOKED:]` → legacy path: parse datetime, call `createBooking(allowWithoutCalendar=true)`
5. Send cleaned SMS to customer via `sendSMSAndLog()`
6. Update conversation status

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
| `/api/dashboard/messages` | GET | List conversations. Query: `page`, `search`, `status`, `limit` |
| `/api/dashboard/messages/[conversationId]` | GET | Single conversation + all messages |
| `/api/dashboard/messages/send` | POST | Manual SMS. Body: `{ conversationId, text }`. Sends via Telnyx, creates Message record. |
| `/api/dashboard/messages/contacts` | GET | Contacts for compose UI |
| `/api/dashboard/messages/campaign` | POST | Create EmailCampaign + EmailRecipients |
| `/api/dashboard/messages/campaign/preview` | POST | Preview rendered email template |
| `/api/dashboard/contacts` | GET | List contacts. Query: `search?`, `status?` |
| `/api/dashboard/contacts` | POST | Create contact. Body: `{ phoneNumber?, name?, email?, source?, ... }` |
| `/api/dashboard/contacts/[id]` | GET | Contact detail with tags, activities, jobs |
| `/api/dashboard/contacts/[id]` | PATCH | Update contact fields |
| `/api/dashboard/contacts/[id]/activities` | GET | Activity timeline |
| `/api/dashboard/contacts/import` | POST | Bulk import. Form data: `file` (Excel/CSV). Calls `parseContactFile()` → `findOrCreateContact()` |
| `/api/dashboard/voicemails` | GET | Conversations with `recordingUrl != null` |
| `/api/dashboard/screened-calls` | GET | ScreenedCall records |
| `/api/dashboard/website-leads` | GET | WebsiteLead records |
| `/api/dashboard/analytics` | GET | TelnyxUsageRecord aggregated by day |
| `/api/dashboard/tags` | GET/POST | List / create tags |
| `/api/dashboard/jobs` | GET/POST | List / create jobs |
| `/api/dashboard/jobs/[id]` | PATCH/DELETE | Update / delete job |
| `/api/dashboard/emails` | GET | EmailCampaign list |
| `/api/appointments` | GET | List appointments |
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
| `/api/admin/view-as` | POST | Set `adminViewAs` cookie to view dashboard as a client |
| `/api/admin/google-ads/sync` | POST | Sync Google Ads data. Body: `{ businessId? }`. Syncs one or all enabled businesses. Returns `{ synced, errors }` |

### Dashboard Google Ads

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/google-ads` | GET | Google Ads data for business. Query: `startDate`, `endDate`, `groupBy` (day\|campaign). Returns `{ totals, daily, campaigns }`. Default last 30 days. |

### Contact / Book Demo

| Route | Method | Purpose |
|---|---|---|
| `/api/contact` | POST | Website contact form. Body: `{ name, phone?, message?, smsConsent, businessId?, businessSlug?, email? }`. Sends email via Resend, creates Contact + WebsiteLead in background. |
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

All four functions send SMS (Telnyx from business.telnyxPhoneNumber to ownerPhone||forwardingNumber) and email (SMTP via nodemailer, `from` = SMTP_FROM or SMTP_USER).

```typescript
notifyOwnerOnBookingCreated(business, appointment): Promise<{ smsSent, emailSent }>
// SMS: "📅 New Quote Request! [Name] wants [service] on [date] at [time]."
// Email: Subject "New Quote Visit - [Name] - [service] - [date]"
// Includes customer details, address, notes, link to dashboard/appointments

notifyOwnerOnBookingRequestNoCalendar(business, params): Promise<void>
// When AI detected booking intent but calendar is off. Owner must confirm manually.
// Email includes full conversation transcript.

notifyOwnerOnLeadCaptured(business, params): Promise<void>
// When [READY_TO_CAPTURE] tag received in lead flow.
// Email includes full conversation transcript.

notifyOwnerOnHumanNeeded(business, params): Promise<void>
// When AI returns [HUMAN_NEEDED]. 
// SMS: "⚠️ A customer needs your help! [Name] needs a personal follow-up."
// Email includes reason + full conversation transcript.

notifyOwnerOnAIFailed(business, params): Promise<void>
// When Claude API is unavailable (503 etc.).
// Customer received: "Thanks for reaching out! Let me have someone get back to you shortly."
```

**SMTP transport:** Singleton `nodemailer.createTransport`. Requires `SMTP_USER` and `SMTP_PASS`. Throws on missing env vars (so email notifications silently fail if misconfigured).

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

---

## 9. Frontend Pages & Components

### Marketing Pages (no auth)

**`app/page.tsx`** — Marketing homepage
- Hero, features, ROI calculator, demo form, testimonials

**`app/pricing/page.tsx`** — Pricing page

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

**`app/(dashboard)/dashboard/page.tsx`** — Overview
- Summary stats: recent conversations, upcoming appointments

**`app/(dashboard)/dashboard/messages/page.tsx`** — `MessagesClient`
- Conversation list with search, status filter
- Click conversation → full SMS thread view
- Manual reply compose box → POST `/api/dashboard/messages/send`
- Toggle `manualMode` (disables AI for that conversation)
- Conversation status badges

**`app/(dashboard)/dashboard/appointments/page.tsx`** — `AppointmentsClient`
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

**`app/(dashboard)/dashboard/blocked-calls/page.tsx`**
- ScreenedCall records (spam-filtered calls)
- Shows caller phone, date, result

**`app/(dashboard)/dashboard/website-leads/page.tsx`** — `WebsiteLeadsClient`
- WebsiteLead records from contact forms
- Name, phone, email, message, status

**`app/(dashboard)/dashboard/analytics/page.tsx`** — `AnalyticsClient`
- Usage stats from TelnyxUsageRecord
- SMS count + cost, call count + cost
- Date range picker, per-business breakdown

**`app/(dashboard)/dashboard/emails/page.tsx`** — `EmailsClient`
- EmailCampaign list with status, recipient count, sent date

**`app/(dashboard)/dashboard/emails/new/page.tsx`** — `EmailComposeClient`
- Subject line input
- Rich HTML editor for email body
- Image upload → POST `/api/campaigns/upload-image`
- Recipient selection from contact list
- Preview → POST `/api/dashboard/messages/campaign/preview`
- Send → POST `/api/dashboard/messages/campaign`

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
- **Admin "view as":** Admin sets `adminViewAs` cookie (via `/api/admin/view-as`). `getBusinessForDashboard()` checks this cookie if `userId == ADMIN_USER_ID`. Allows Jacob to view any client's dashboard without separate login.
- **Webhook isolation:** Voice and SMS webhooks find business by `telnyxPhoneNumber`. Each business has a unique Telnyx number → no cross-contamination.
- **Phone number pool:** `PhoneNumber` table tracks available/assigned numbers. Assigning to a business sets `assignedToBusinessId` and `status='assigned'`.
- **Data deletion:** All models use `onDelete: Cascade` from Business, so deleting a business cleans up all related data.

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

### Resend (Email — voicemail notifications)

- Used in voice webhook `call.recording.saved` handler for voicemail email notifications
- `new Resend(process.env.RESEND_API_KEY)`
- Sends from `notifications@alignandacquire.com`
- Only used when `missedCallAiEnabled == false` (spam-screening-only mode)

### nodemailer / SMTP (Email — owner notifications)

- Used for all booking/lead/human-needed/AI-failed owner notifications
- `lib/notify-owner.ts` → `sendEmail()` → nodemailer singleton transport
- SMTP via Gmail (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
- Singleton transport cached in module scope (not recreated per request)

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

8. **Contact `source IS NULL` = blocks SMS** — `isExistingContact()` queries for contacts where `source IS NULL`. This is intentional: if you import existing customers without a source tag, they won't get automated SMS. If you create contacts from missed calls (source='missed_call'), they WILL receive SMS on future calls. This means: if a business uploads their full customer list via CSV without setting source, all those customers are blocked from automated SMS.

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

16. **Admin "view as" via cookie** — When Jacob is logged in and sets `adminViewAs` cookie (via POST `/api/admin/view-as`), `getBusinessForDashboard()` returns that business instead of Jacob's own business. This means all dashboard API calls use the client's `businessId`. The cookie is session-scoped — it expires when the browser closes. If Jacob sees unexpected data, check for a stale `adminViewAs` cookie.

17. **No webhook signature verification** — The Telnyx webhooks at `/api/webhooks/voice` and `/api/webhooks/sms` do NOT verify the `TELNYX_PUBLIC_KEY` signature. They are currently open to any POST request. This is a security risk — anyone who knows the URL can trigger conversation creation or SMS sends. The `TELNYX_PUBLIC_KEY` env var is defined but not used in verification code. Do not add verification without testing that the signature format matches Telnyx's current implementation.

### Data Model

18. **`maxMessagesPerConversation` is NOT enforced during active booking flow** — The message limit guard checks `inBookingFlow = Boolean(conversation.bookingFlowState?.step)`. If the customer is mid-booking-flow (has a step in progress), the limit is skipped. This prevents cutting off a booking at the worst moment.

19. **Conversation status `appointment_booked` vs `lead_captured`** — After booking, status is `appointment_booked`. In lead flow (no calendar), status is `lead_captured`. Both statuses receive limited AI responses: only appointment-related questions get answered; other messages get "You're welcome! Call us if you need anything."

20. **`callConnected` prevents duplicate SMS** — When a forwarding call connects (`callConnected=true`), `sendMissedCallSMS()` skips SMS. The check is: `if (conversation.callConnected && durationSeconds > 5)`. The >5s guard prevents triggering on connections that immediately dropped.

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
| `/api/dashboard/google-ads` | GET | `requireDashboardBusiness()` | Returns aggregated ad data. Query: `startDate`, `endDate`, `groupBy` (day\|campaign). Returns `{ totals, daily, campaigns }`. Default: last 30 days. |

### Dashboard Page: `/dashboard/ads`

**Files:**
- `app/(dashboard)/dashboard/ads/page.tsx` — server component wrapper
- `app/(dashboard)/dashboard/ads/AdsClient.tsx` — client component with all UI

**Features:**
- Date range picker: Last 7 Days, Last 30 Days, Last 90 Days, Custom
- 6 summary cards: Total Spend, Total Clicks, Impressions, Avg CTR, Conversions, Cost/Conversion
- Daily trend line chart (recharts): dual-axis with Spend (left, $) and Clicks (right)
- Campaign breakdown table: campaign name, impressions, clicks, CTR, spend, conversions, cost/conversion
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

*This document reflects the codebase as of April 2026. Update after any significant architectural changes.*
