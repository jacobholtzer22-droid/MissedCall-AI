# MissedCall AI — System Layout

Reference document for use as context in separate AI sessions. Reflects codebase state as of May 2026 including Batch 2 changes.

---

## 1. Stack Summary

**Framework:** Next.js 14.2.21 (App Router), React 18.3.1, TypeScript strict mode

**Database:** Neon PostgreSQL via Prisma 6.2.1 ORM
- Runtime queries: `DATABASE_URL` (pooled connection)
- Migrations: `DIRECT_URL` (direct connection)

**Auth:** Clerk 6.12.0 (`@clerk/nextjs`)

**Telephony:** Telnyx v5.37.1 — Call Control API v2 + Messaging API

**AI:** Anthropic SDK 0.52.0 — claude-3-5-haiku for SMS conversation responses and intent detection

**Calendar:** googleapis 171.4.0 — per-business OAuth2 tokens stored in DB (not service account)

**Email:**
- nodemailer (SMTP/Gmail) for owner booking/lead/AI-failure alerts
- Resend (`resend`) for voicemail email notifications only

**File Storage:** `@vercel/blob` — voicemail mp3s + email campaign images (always `access: 'public'`)

**Charts:** recharts — Google Ads daily trend line chart

**UI:** Tailwind CSS, Radix UI primitives, clsx + tailwind-merge, lucide-react icons

**Date handling:** date-fns + `@date-fns/tz` (TZDate) — all business-local timezone math uses TZDate, never raw UTC offsets

**File parsing:** xlsx + papaparse — bulk contact imports from Excel/CSV

**Google Ads:** `google-ads-api` Node.js client

**Path alias:** `@/*` → project root

---

## 2. Directory Map

Top two levels of key directories. Entries marked `[?]` warrant verification of whether they are still active.

```
app/
├── layout.tsx                    # Root: ClerkProvider, ConditionalNavBar, dark bg
├── page.tsx                      # Marketing homepage
├── pricing/page.tsx
├── spam-screening/page.tsx
├── ads-management/page.tsx       # Marketing page for ads offering
├── campaigns/page.tsx            # Marketing page for campaigns offering
├── config/nav-services.ts        # Nav service config (not in CLAUDE.md)
├── (auth)/                       # Clerk sign-in/sign-up (no nav)
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
├── onboarding/page.tsx           # OnboardingForm — first business setup
├── book/[businessSlug]/          # Public booking pages (no auth, iframe-safe)
│   ├── page.tsx
│   └── embed/page.tsx
├── admin/                        # Admin UI pages (Jacob only, not API)
│   └── [businessId]/conversations/page.tsx
├── (dashboard)/
│   ├── layout.tsx                # Sidebar nav + DashboardShellClient
│   ├── DashboardShellClient.tsx  # Client component: sidebar, user menu, view-as toggle
│   └── dashboard/
│       ├── page.tsx              # Overview (server: resolves voicemails, passes features)
│       ├── OverviewClient.tsx    # Feature-aware overview — handles all business modes
│       ├── SpamOnlyDashboard.tsx # [?] May be dead code — OverviewClient covers all modes
│       ├── messages/page.tsx     # MessagesClient — conversations + SMS threads
│       ├── appointments/page.tsx # AppointmentsClient
│       ├── contacts/             # List, [id] detail, import
│       ├── conversations/        # [?] Separate from messages/ — purpose unclear
│       ├── jobs/                 # List, [id] detail (not in original CLAUDE.md)
│       ├── voicemails/page.tsx   # VoicemailsClient — audio player + delete
│       ├── blocked-calls/page.tsx
│       ├── website-leads/page.tsx
│       ├── ads/page.tsx          # AdsClient — Google Ads dashboard
│       ├── analytics/page.tsx    # AnalyticsClient — feature-gated metric cards
│       ├── emails/               # EmailsClient (list) + new/EmailComposeClient
│       └── settings/page.tsx     # SettingsFormWithIndustry
└── api/
    ├── webhooks/
    │   ├── voice/route.ts        # ALL Telnyx Call Control events (main handler)
    │   ├── sms/route.ts          # Telnyx SMS events (inbound + delivery status)
    │   ├── voice-dial-status/    # Dial outcome → SMS trigger (legacy/parallel)
    │   └── voice-after-dial/     # XML response for after-dial callback mode
    ├── bookings/                 # available-slots, create, [id], [id]/cancel, delete-past
    ├── contact/route.ts          # Website contact form
    ├── marketing-bookings/
    ├── book-demo/
    ├── auth/google/              # OAuth2 start + callback (calendar)
    ├── campaigns/upload-image/   # Vercel Blob image upload
    ├── appointments/route.ts     # List appointments (dashboard)
    └── dashboard/
        ├── messages/             # List, [id], send, contacts, campaign, campaign/preview
        ├── contacts/             # List/create, [id] detail/update, [id]/activities, import
        ├── voicemails/           # List + [id] DELETE (soft delete)
        ├── screened-calls/
        ├── website-leads/
        ├── analytics/            # Usage stats; uses getBusinessFeatures for totalCallsMode
        ├── tags/
        ├── jobs/
        ├── emails/               # List + [id] (single campaign for template reuse)
        └── google-ads/           # Aggregated metrics + sync trigger
    └── admin/
        ├── businesses/           # List all, PATCH any, sub-routes per resource type
        ├── usage/                # sync (MDR/CDR), export (Excel), sheets-sync
        ├── google-ads/sync
        ├── google-calendar-backfill/ # Backfill events for unsynced appointments
        ├── telnyx-test/
        └── view-as/              # Set adminViewAs cookie

lib/
├── db.ts                         # Prisma singleton (globalThis in dev for HMR)
├── auth.ts                       # getCurrentBusiness, getCurrentUser, needsOnboarding
├── dashboard-auth.ts             # requireDashboardBusiness() — use in every dashboard route
├── get-business-for-dashboard.ts # Admin view-as: checks adminViewAs cookie
├── business-features.ts          # getBusinessFeatures(business) → BusinessFeatures
├── phone-utils.ts                # normalizePhoneNumber, normalizeToE164, phonesMatch
├── utils.ts                      # cn(), formatPhoneNumber, formatRelativeTime, slugify
├── business-hours.ts             # DEFAULT_BUSINESS_HOURS constant (M-F 9-5, Sat-Sun closed)
├── google-calendar.ts            # OAuth flow, getAvailableSlots, createCalendarEvent
├── google-ads.ts                 # Google Ads API client + sync
├── google-sheets-sync.ts         # [?] Usage export to Sheets — not in CLAUDE.md
├── create-booking.ts             # Full booking pipeline (validate, dupe check, DB, notify)
├── notify-owner.ts               # 4 owner notification scenarios (SMS + email)
├── sms-cooldown.ts               # checkCooldown, recordMessageSent, bypass logic
├── contacts-check.ts             # isExistingContact (source IS NULL guard)
├── crm-utils.ts                  # findOrCreateContact — use for all contact creation
├── import-contacts.ts            # parseContactFile (Excel/CSV → contacts array)
├── telnyx-usage-sync.ts          # syncTelnyxUsage: MDR + CDR → TelnyxUsageRecord
├── usage-export.ts               # Aggregate usage for Excel/Sheets export
├── email-format.ts               # plainTextToEmailHtml, bodyContainsHtml
└── industry-defaults.ts          # Onboarding industry defaults (not in CLAUDE.md)

prisma/
└── schema.prisma                 # 19 models — see Section 3
```

---

## 3. Database Model

All models use `cuid()` PKs. All tenant data scoped by `businessId`. All relations from Business use `onDelete: Cascade`.

### Business — tenant root

Core: `id`, `name`, `slug` (unique, used in booking URLs), `businessType`, `timezone` (default: America/New_York)

Phone routing: `telnyxPhoneNumber` (unique), `forwardingNumber` (owner's real phone)

Feature flags (all Boolean):
- `missedCallAiEnabled` — default **true**; false = no missed-call SMS, spam screen + voicemail only
- `spamFilterEnabled` — auto-reject toll-free and invalid area code calls
- `callScreenerEnabled` — IVR "press 1" gate before connecting
- `calendarEnabled` — booking state machine activation gate
- `googleCalendarConnected` — set true after successful OAuth callback
- `googleAdsEnabled` — show Google Ads nav item and dashboard

Calendar: `googleAccessToken`, `googleRefreshToken` (stored in DB per business), `slotDurationMinutes` (default 30), `bufferMinutes` (default 0)

AI config: `aiGreeting`, `aiInstructions` (personality/rules), `aiContext` (business background)

Notifications: `ownerEmail`, `ownerPhone`, `notifyBySms`, `notifyByEmail`

SMS: `smsCooldownDays` (null = use env or 7 days), `cooldownBypassNumbers` (JSON array of phone strings), `maxMessagesPerConversation` (default 23)

Billing: `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` (trialing/active/past_due/canceled)

Google Ads: `googleAdsCustomerId` (no dashes), `googleAdsTabLabel`

Admin-only: `adminNotes`, `setupFee`, `monthlyFee`

Booking page: `bookingPageTitle`, `bookingPageServiceLabel`, `bookingPageConfirmation`, `bookingRequiresAddress`, `servicesOffered` (JSON array)

Call screener: `callScreenerMessage`, `missedCallVoiceMessage`

### User — dashboard login

`id`, `clerkId` (unique), `email`, `firstName`, `lastName`, `imageUrl`, `role` (owner/admin/staff), `businessId`

### Conversation — one per missed-call session

`id`, `businessId`, `callerPhone` (E.164: +1XXXXXXXXXX), `callSid` (unique — Telnyx A-leg call_control_id)

Status values: `active`, `booking_in_progress`, `appointment_booked`, `lead_captured`, `closed`, `human_needed`, `needs_review`, `completed`, `no_response`, `screening`, `screening_blocked`, `forwarding`

Call outcome: `callConnected` (bool), `dialCallStatus` (completed/no-answer/busy/failed/canceled), `answeredBy` (human/machine/fax/unknown), `durationSeconds`, `callEndedAt`

AI/booking: `manualMode` (bool — disables AI responses), `bookingFlowState` (JSON — 12 possible step values), `intent`, `serviceRequested`, `summary`

Lead capture: `customerEmail`, `customerAddress`, `customerTimeframe`

Voicemail: `recordingUrl` (Vercel Blob URL), `voicemailTranscription`

Timestamps: `createdAt`, `updatedAt`, `lastMessageAt`

### Message — individual SMS texts

`id`, `conversationId`, `direction` (inbound/outbound), `content`, `telnyxSid`, `telnyxStatus` (sent/delivered/failed), `cost` (populated by MDR sync)

### Appointment — booked quote visits

`id`, `businessId`, `conversationId?` (null = web booking)
`customerName`, `customerPhone`, `customerEmail?`, `serviceType`, `scheduledAt`, `duration` (minutes), `notes`, `customerAddress`
`source`: website | sms
`status`: confirmed, cancelled, completed, no_show
`googleCalendarEventId?`, `calendarSyncFailed` (bool — non-fatal; appointment still created)

### Contact — CRM address book

`id`, `businessId`, `phoneNumber` (normalized), unique per `[businessId, phoneNumber]`
`name?`, `email?`, `address?`, `city?`, `state?`, `zip?`
`source?`: missed_call, website_form, manual, referral, google_ad, or **NULL**
`status?`: new, contacted, quoted, booked, completed, lost
`totalRevenue`, `lastContactedAt`, `notes`

**CRITICAL:** `source IS NULL` means `isExistingContact()` returns true → blocks all automated missed-call SMS for that number permanently. Bulk-imported contacts without a source are silently excluded from automation.

### BlockedNumber — hard block list

`id`, `businessId`, `phoneNumber`. Unique `[businessId, phoneNumber]`. Checked before cooldown in SMS guard chain.

### ContactCooldown — SMS rate limiting

`id`, `businessId`, `phoneNumber`, `lastMessageSent`. Unique `[businessId, phoneNumber]`. Upserted after every sent SMS.

### CooldownSkipLog — analytics for skipped SMS

`id`, `businessId`, `phoneNumber`, `reason` (cooldown/blocked/existing_contact), `attemptedAt`, `lastMessageSent`, `messageType?`

### ScreenedCall — IVR/spam filter log

`id`, `businessId`, `callerPhone`, `callSid?`, `result` (blocked/passed), `createdAt`

Only populated when `spamFilterEnabled` or `callScreenerEnabled`. Used as `totalCallsQuery` source when `totalCallsMode='screened'`.

### Tag / ContactTag — contact labels

Tag: `id`, `businessId`, `name`, `color`. Unique `[businessId, name]`.
ContactTag: composite PK `[contactId, tagId]`.

### Job — services performed per contact

`id`, `businessId`, `contactId`, `serviceName`, `description`, `scheduledDate`, `completedDate`, `amount`, `status` (scheduled/in_progress/completed/cancelled/invoiced), `notes`

### EmailCampaign — bulk email sends

`id`, `businessId`, `senderName`, `subject`, `body`, `images` (JSON: `[{ url, filename, order }]`), `status` (draft/sending/sent/failed), `recipientCount`, `sentAt`

### EmailRecipient — per-contact delivery tracking

`id`, `campaignId`, `contactId`, `email`, `status` (pending/sent/delivered/bounced/failed), `sentAt`

### Activity — contact timeline

`id`, `businessId`, `contactId`, `type` (missed_call/sms_conversation/voicemail/website_form/email_sent/job_created/job_completed/note_added/status_changed), `description`, `metadata` (JSON), `createdAt`

### WebsiteLead — contact form submissions

`id`, `businessId`, `name`, `phone?`, `email?`, `message?`, `status` (new/contacted/converted/closed)

### TelnyxUsageRecord — cached MDR/CDR cost data

`id`, `businessId`, `recordType` (sms/call/call_forwarding), `telnyxRecordId` (unique — prevents double-counting), `cost`, `occurredAt`, `metadata` (JSON)

### PhoneNumber — available Telnyx number pool

`id`, `phoneNumber` (unique), `telnyxSid` (unique), `assignedToBusinessId?`, `status` (available/assigned/released)

### GoogleAdsSnapshot — daily campaign metrics

`id`, `businessId`, `date`, `campaignId`, `campaignName`, `impressions`, `clicks`, `cost` (USD from cost_micros / 1,000,000), `conversions`, `ctr`, `costPerConversion?`

Unique `[businessId, campaignId, date]` — upsert key. Indexed on `[businessId, date]`.

---

## 4. API Route Map

### Unauthenticated Webhooks (no Clerk, no signature verification)

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/voice` | POST | All Telnyx Call Control events — single handler for full call lifecycle |
| `/api/webhooks/sms` | POST | Telnyx SMS events: inbound messages + delivery status updates |
| `/api/webhooks/voice-dial-status` | POST | Dial outcome callback — triggers missed-call SMS independently |
| `/api/webhooks/voice-after-dial` | POST | XML response for after-dial callback mode (no DB writes) |

### Public Booking

| Route | Method | Notes |
|---|---|---|
| `/api/bookings/available-slots` | GET | By `businessId` or `businessSlug`; returns slots + business config |
| `/api/bookings/create` | POST | Web form booking; calls full `createBooking()` pipeline |
| `/api/bookings/[id]` | GET | Appointment detail |
| `/api/bookings/[id]/cancel` | POST | Cancel + delete Google Calendar event |
| `/api/bookings/delete-past` | DELETE | Cleanup appointments older than 90 days |
| `/api/marketing-bookings` | POST | /book page discovery call booking (uses `createMarketingCalendarEvent`) |
| `/api/contact` | POST | Website contact form → Resend email + Contact + WebsiteLead |
| `/api/book-demo` | POST | Demo request form submission |

### Auth

| Route | Method | Notes |
|---|---|---|
| `/api/auth/google` | GET | Start Google Calendar OAuth2; requires Clerk auth; verifies ownership or admin |
| `/api/auth/google/callback` | GET | Exchange code, save tokens, set `googleCalendarConnected=true`, redirect to settings |

### Dashboard (all require `requireDashboardBusiness()`)

| Route | Method | Notes |
|---|---|---|
| `/api/dashboard/messages` | GET | Conversations; params: page, search, status, limit |
| `/api/dashboard/messages/[id]` | GET | Single conversation + all messages |
| `/api/dashboard/messages/send` | POST | Manual SMS; creates Message record |
| `/api/dashboard/messages/contacts` | GET | Contacts list for compose UI |
| `/api/dashboard/messages/campaign` | POST | Create EmailCampaign + EmailRecipients, trigger send |
| `/api/dashboard/messages/campaign/preview` | POST | Rendered email HTML preview |
| `/api/dashboard/contacts` | GET/POST | List with search/status filter; create single contact |
| `/api/dashboard/contacts/[id]` | GET/PATCH | Detail with tags + activities + jobs; update fields |
| `/api/dashboard/contacts/[id]/activities` | GET | Activity timeline |
| `/api/dashboard/contacts/import` | POST | Bulk import — `parseContactFile()` → `findOrCreateContact()` |
| `/api/dashboard/voicemails` | GET | Conversations where `recordingUrl != null` |
| `/api/dashboard/voicemails/[id]` | DELETE | Clear `recordingUrl` + `voicemailTranscription` (soft delete) |
| `/api/dashboard/screened-calls` | GET | ScreenedCall records; `days=1` = since midnight, not rolling 24h |
| `/api/dashboard/website-leads` | GET | WebsiteLead records |
| `/api/dashboard/analytics` | GET | Feature-aware analytics; period: today/week/month/all |
| `/api/dashboard/tags` | GET/POST | List / create tags |
| `/api/dashboard/jobs` | GET/POST | List / create jobs |
| `/api/dashboard/jobs/[id]` | PATCH/DELETE | Update / delete job |
| `/api/dashboard/emails` | GET | Sent campaigns list |
| `/api/dashboard/emails/[id]` | GET | Single campaign — used by "Reuse as Template" flow |
| `/api/appointments` | GET | List appointments for dashboard |
| `/api/campaigns/upload-image` | POST | Upload to Vercel Blob; max 5MB PNG/JPG/GIF/WebP |
| `/api/dashboard/google-ads` | GET | Aggregated ad data; params: startDate, endDate, groupBy |
| `/api/dashboard/google-ads/sync` | POST | Trigger Google Ads sync for business |

### Admin (handler-level `userId == ADMIN_USER_ID` check)

| Route | Method | Notes |
|---|---|---|
| `/api/admin/businesses` | GET | List all businesses |
| `/api/admin/businesses/[id]` | PATCH | Update any business settings |
| `/api/admin/businesses/[id]/contacts` | GET | Contacts for any business |
| `/api/admin/businesses/[id]/contacts/bulk` | POST | Bulk import for any business |
| `/api/admin/businesses/[id]/conversations` | GET | Conversations for any business |
| `/api/admin/businesses/[id]/screened-calls` | GET | Screened calls |
| `/api/admin/businesses/[id]/blocked-numbers` | GET | Blocked numbers |
| `/api/admin/businesses/[id]/voicemails` | GET | Voicemails |
| `/api/admin/businesses/[id]/usage` | GET | Usage data |
| `/api/admin/usage/sync` | POST | Trigger `syncTelnyxUsage()` — MDR + CDR from Telnyx API |
| `/api/admin/usage/export` | GET | Export aggregated usage to Excel |
| `/api/admin/usage/sheets-sync` | POST | Sync usage to Google Sheets |
| `/api/admin/telnyx-test` | GET | Debug MDR/CDR fetch |
| `/api/admin/view-as` | POST | Set `adminViewAs` cookie |
| `/api/admin/google-ads/sync` | POST | Sync Google Ads for one or all enabled businesses |
| `/api/admin/google-calendar-backfill` | POST | Backfill Calendar events for appointments with `calendarSyncFailed=true` |

---

## 5. Core Data Flows

### 5.1 Inbound Call (Full Forwarding Path)

Entry: `POST /api/webhooks/voice` (`app/api/webhooks/voice/route.ts:~80`)

Telnyx does not use XML responses — respond 200 immediately, then make separate API calls to control the call. State persists between events via `client_state` (base64-encoded JSON).

1. `call.initiated`: decode payload, find Business by `telnyxPhoneNumber`. Loop prevention: if `from == business.telnyxPhoneNumber` → answer, speak, hangup (no SMS, no DB write).
2. If `spamFilterEnabled && isSpamCall(from)` → `telnyx.calls.actions.reject()`, create `ScreenedCall(result='blocked')`, return.
3. `telnyx.calls.actions.answer()` with `client_state={businessId, callerPhone, connectionId}`
4. If `callScreenerEnabled`: `gatherUsingSpeak("press 1", timeout=8000ms, maximum_tries=1)`, create `Conversation(status='screening')`
5. `call.gather.ended`:
   - digit='1': `ScreenedCall(result='passed')`, Conversation → 'forwarding'
   - digit='' (timeout): `ScreenedCall(result='blocked')`, Conversation → 'screening_blocked', `hangup()` immediately
   - wrong digit: `ScreenedCall(result='blocked')`, speak "Thanks, goodbye", `hangup()`
6. Post-screener (or no screener): parallel `speak(HOLD_MESSAGE, {forwardingPending:true, dialAlreadyStarted:true})` + `dial(forwardingNumber, timeout=25s)` with `{isForwardingLeg:true, aLegCallControlId}`
7. B-leg `call.answered`: look up Contact by callerPhone → speak "Connecting to [name/number]"
8. B-leg `call.speak.ended` (announceCallerPending): `bridge(bLeg → aLeg)`, set `Conversation.callConnected=true`, status='completed'
9. B-leg `call.hangup` or `call.bridging.failed` (no answer): `handleForwardingFallback()`

`handleForwardingFallback()` (`voice/route.ts:~380`):
- Update Conversation: status='active', `dialCallStatus='no-answer'`, `callEndedAt=now`
- If `missedCallAiEnabled`: `sendMissedCallSMS()` + speak voiceMessage on A-leg
- Else: speak voicemail greeting, `client_state.voicemailPending=true`

Constants: `FORWARDING_TIMEOUT_SECS=25` (`voice/route.ts:52`), `FORWARDING_TIMEOUT_VOICEMAIL_SECS=20` (`voice/route.ts:53`)

### 5.2 `sendMissedCallSMS()` Guard Chain

Each check short-circuits. Skips are logged to `CooldownSkipLog`:

1. `BlockedNumber` lookup → skip (reason='blocked')
2. `isExistingContact()`: `Contact WHERE source IS NULL` → skip (reason='existing_contact') — `contacts-check.ts:~15`
3. `isCooldownBypassNumber()`: if match, skip remaining cooldown check
4. `checkCooldown()`: `ContactCooldown.lastMessageSent` within window → skip (reason='cooldown')
5. Find or create Conversation
6. `conversation.callConnected && durationSeconds > 5` → skip (owner actually talked to them)
7. Outbound message already exists for conversation → skip (idempotency)
8. `telnyx.messages.send()` (synchronous)
9. Deferred `void promise`: create `Message`, `recordMessageSent()` — intentionally non-blocking

### 5.3 Inbound SMS Pipeline

Entry: `POST /api/webhooks/sms` (`app/api/webhooks/sms/route.ts:~1`)

1. Find Business by `telnyxPhoneNumber == payload.to`
2. STOP/UNSUBSCRIBE/CANCEL/QUIT → send opt-out acknowledgment, return (TCPA required)
3. "never mind"/"not interested" → goodbye SMS + `notifyOwnerOnHumanNeeded()`
4. Find Conversation: last 90 days, newest by `lastMessageAt`. Create if not found + background `findOrCreateContact(source='missed_call')`
5. Duplicate guard: same text within 30s → ignore
6. Message limit: `messages.length >= maxMessagesPerConversation` AND not in booking flow → close + "please call us"
7. Save inbound `Message`, update `Conversation.lastMessageAt`
8. Route:
   - `!calendarEnabled` → `handleSmsLeadFlow()` (Claude AI lead capture)
   - else → `handleSmsBookingFlow()` (state machine on `bookingFlowState.step`)
   - booking flow returned false → `generateAIResponse()` (general AI)

AI response post-processing (strip tags, then check):
- `[READY_TO_CAPTURE]` → extract fields from conversation, status='lead_captured', `notifyOwnerOnLeadCaptured()`
- `[HUMAN_NEEDED:]` → status='human_needed', `notifyOwnerOnHumanNeeded()`
- `[APPOINTMENT_BOOKED:]` → only active when `canAiBook = !calendarEnabled || !googleCalendarConnected` (`sms/route.ts:~538`); silently ignored when calendar is fully connected

### 5.4 Calendar Booking State Machine

`handleSmsBookingFlow()` runs when `calendarEnabled=true`. State persisted in `Conversation.bookingFlowState` JSON. Steps include: detect-intent, `ask_service`, `ask_date`, `show_slots`, `awaiting_name_and_preference`, `awaiting_confirmation`, `confirmed`.

`show_slots` step: calls `getAvailableSlots(businessId, today, +14 days)`, formats up to 3 options as human-readable text (e.g. "Friday March 6th at 10:00 AM, 2:00 PM, or 4:00 PM").

`confirmed` step → `createBooking()` (`lib/create-booking.ts`):
1. Validate: name, phone, service required; slot must be in future
2. Dupe check: same phone + service within `±slotDurationMinutes` ms
3. Slot verification (skipped when `skipSlotVerification=true`)
4. `createCalendarEvent()` — if throws: `calendarSyncFailed=true`, continue (non-fatal)
5. Create `Appointment` in DB
6. Confirmation SMS (wording: SMS source = "You're all set [Name]!"; web source = "Confirmed! Your quote visit...")
7. `notifyOwnerOnBookingCreated()`

60-second slot tolerance: `Math.abs(slotStart - available.start) < 60_000` (`create-booking.ts:~85`) — handles ISO string parsing edge cases.

### 5.5 Analytics Data Flow

Entry: `GET /api/dashboard/analytics` (`app/api/dashboard/analytics/route.ts`)

1. `requireDashboardBusiness()` → business with all feature flags
2. `getBusinessFeatures(business)` → `totalCallsMode: 'screened' | 'forwarded' | 'none'`
3. Build `totalCallsQuery`:
   - `'screened'` → `db.screenedCall.count()`
   - `'forwarded'` → `db.conversation.count({ callSid: { not: null } })`
   - `'none'` → `Promise.resolve(0)`
4. `Promise.all([...10 queries...])` — parallel: totalCalls, callsBlocked, callsPassed, leadsCaptured, websiteLeads, messagesSent, previousTotals, leadSources (groupBy), recentActivity
5. Response includes `features` and `totalCallsMode` — client uses these to show/hide metric cards

`AnalyticsClient` card visibility (`analytics/AnalyticsClient.tsx`):
- Total Calls: shown when `(loading || totalCallsMode !== 'none')`
- Calls Blocked/Passed: shown when `(loading || features.hasAnyScreening)`
- Leads Captured, Website Leads, Messages Sent: shown when `(loading || features.hasMissedCallAi)`

### 5.6 Voicemail Flow (missedCallAiEnabled=false)

Triggered from `handleForwardingFallback()` when `missedCallAiEnabled=false`:

1. Speak voicemail greeting, `client_state.voicemailPending=true`
2. `call.speak.ended` (voicemailPending): `startRecording(format='mp3', max_length=120s, timeout_secs=5, play_beep=true)`
3. `call.recording.saved`: fetch mp3 binary from Telnyx URL → `put(blob, { access: 'public' })` to Vercel Blob at `voicemails/{callControlId}.mp3`
4. `db.conversation.update({ recordingUrl: blobUrl })`
5. Send voicemail email via Resend from `notifications@alignandacquire.com`
6. `telnyx.calls.actions.hangup()`
7. `call.transcription` (async, if Telnyx transcription enabled): `db.conversation.update({ voicemailTranscription })`

---

## 6. Multi-tenant Architecture

**Data scoping:** Every table except `User` and `PhoneNumber` has `businessId`. All dashboard API queries include `where: { businessId }` sourced from `requireDashboardBusiness()`.

**Auth resolution chain for dashboard routes:**
1. Clerk `auth()` → `userId`
2. `db.user.findUnique({ where: { clerkId: userId } })` → `user.businessId`
3. `getBusinessForDashboard(userId, user.business)` — if `userId == ADMIN_USER_ID` and `adminViewAs` cookie set, returns that business instead
4. Route handler receives fully resolved `business` object with all fields

**Admin "view as":**
- `POST /api/admin/view-as` sets `adminViewAs` cookie (session-scoped, expires on browser close)
- `getBusinessForDashboard()` checks cookie only for admin userId
- All subsequent dashboard API calls transparently use the client's `businessId`
- Stale cookie can cause Jacob to see a client's data unexpectedly

**Webhook isolation:**
- Voice webhook finds business via `payload.data.payload.to == telnyxPhoneNumber` (DB unique constraint)
- SMS webhook finds business via `payload.data.payload.to[0].phone_number == telnyxPhoneNumber`
- No cross-contamination possible between businesses

**Feature flags via `lib/business-features.ts`** (added Batch 2):
```typescript
// getBusinessFeatures(business) returns:
{
  hasSpamFilter: boolean       // spamFilterEnabled
  hasIvrScreener: boolean      // callScreenerEnabled
  hasAnyScreening: boolean     // either of above
  hasMissedCallAi: boolean     // missedCallAiEnabled !== false
  hasForwarding: boolean       // Boolean(forwardingNumber)
  hasCalendar: boolean         // calendarEnabled && googleCalendarConnected
  showScreeningCards: boolean  // === hasAnyScreening
  showAiCards: boolean         // === hasMissedCallAi
  totalCallsMode: 'screened' | 'forwarded' | 'none'
}
```

Used by: `layout.tsx` (nav items), `dashboard/page.tsx` (voicemail section), `OverviewClient.tsx` (card visibility), `AnalyticsClient.tsx` (card visibility), `analytics/route.ts` (query strategy).

**Phone number pool:** `PhoneNumber` table tracks available/assigned/released numbers. Assignment links `assignedToBusinessId`.

---

## 7. External Integrations

### Telnyx — Telephony & SMS
- SDK: `new Telnyx({ apiKey: TELNYX_API_KEY })` — instantiated per handler (no singleton)
- Call Control v2: webhook → respond 200 → make API calls. Never use XML responses.
- State between events: `client_state` as `Buffer.from(JSON.stringify(obj)).toString('base64')`; decoded as `JSON.parse(Buffer.from(b64, 'base64').toString())`
- SMS: `telnyx.messages.send({ from: business.telnyxPhoneNumber, to, text })`
- Dial: `telnyx.calls.dial({ connection_id, to, from, timeout_secs, client_state, ringback_tone })`
- Call actions: answer, speak, gatherUsingSpeak, hangup, bridge, startRecording, reject
- Usage sync: `lib/telnyx-usage-sync.ts` — fetches MDR (messaging) + CDR (calls) via Telnyx API. CDR fallback chain: call → call-control → sip-trunking → Usage Reports API. Upserts to `TelnyxUsageRecord` via `telnyxRecordId` unique constraint.

### Anthropic / Claude — AI responses
- SDK: `new Anthropic({ apiKey: ANTHROPIC_API_KEY })` — used in SMS webhook
- Model: claude-3-5-haiku for SMS conversation responses and booking intent detection
- System prompt per-conversation: business name/type/services, `aiContext`, `aiInstructions`, current datetime in business timezone, calendar availability note, special tag instructions
- All prior messages in conversation passed as user/assistant turns
- Error path (503/overload): send fallback SMS + `notifyOwnerOnAIFailed()`

### Google Calendar — Booking
- Per-business OAuth2: tokens in `Business.googleAccessToken` + `googleRefreshToken`
- `getValidAccessToken()` auto-refreshes on expiry (`lib/google-calendar.ts:~60`)
- `getAvailableSlotsInternal()`: freebusy query → subtract busy from business hours → filter past slots → return TimeSlot array
- **Silently returns `[]` when `!googleCalendarConnected`** (`google-calendar.ts:~269`) — slot verification can silently pass
- TZDate (`@date-fns/tz`) used for all business-local date math; never raw UTC offset arithmetic
- `createCalendarEvent()`: throws on failure → caught in `createBooking()` as non-fatal

### Resend — Voicemail email only
- Only used in `call.recording.saved` handler when `missedCallAiEnabled=false`
- Sends from: `notifications@alignandacquire.com`
- Requires `RESEND_API_KEY`

### nodemailer / SMTP — Owner notifications
- Singleton transport in `lib/notify-owner.ts` (module-scope cache)
- 4 scenarios: booking created, lead captured, human needed, AI failed
- Requires Gmail App Password (16-char), not regular account password
- Missing env vars → silent failure: `try/catch` swallows error, no log, no user-visible signal

### Google Ads
- `google-ads-api` package; singleton client in `lib/google-ads.ts`
- GAQL query for campaign-level metrics → upsert `GoogleAdsSnapshot` via `[businessId, campaignId, date]` constraint
- Uses `GOOGLE_ADS_MCC_ID` as `login_customer_id` to access client accounts
- Sync triggered: dashboard "Refresh Data" button, admin API, or cron (if configured)

### Vercel Blob — File storage
- All uploads use `access: 'public'` — cannot be changed post-creation
- Voicemail mp3s: `voicemails/{callControlId}.mp3`
- Campaign images: `campaign-images/{campaignId}/{filename}` or `campaign-images/draft/{filename}`
- Max campaign image: 5MB (PNG/JPG/GIF/WebP)

---

## 8. Known Issues & Quirks

**1. `source IS NULL` silently blocks automated SMS for imported contacts**
`isExistingContact()` (`lib/contacts-check.ts:~15`) queries `Contact WHERE source IS NULL`. Any contact imported without a source tag is treated as an existing customer and permanently blocked from automated missed-call SMS. There is no UI indicator. The only signal is a `CooldownSkipLog(reason='existing_contact')` entry. A business that bulk-imports their full customer list gets zero automated SMS for those callers.

**2. Calendar booking is silently broken when `calendarEnabled=true`**
`sms/route.ts:~538`: `canAiBook = !business.calendarEnabled || !business.googleCalendarConnected`. When both flags are true (calendar fully connected), the AI `[APPOINTMENT_BOOKED:]` tag path is disabled — the tag is silently ignored after being stripped. The system relies entirely on `handleSmsBookingFlow()`. If that state machine returns false or encounters a bug, `generateAIResponse()` runs instead and produces an AI response that cannot complete a booking. This is the likely root cause of the known "calendar booking broken for Mike" issue.

**3. Slot verification silently passes when calendar disconnected**
`getAvailableSlots()` returns `[]` when `!googleCalendarConnected` (`google-calendar.ts:~269`). `createBooking()` called from the web booking page (with `skipSlotVerification=false`) will find no matching slot and error. But the SMS booking path uses `skipSlotVerification=true` and proceeds without validation. A booking can be created at an unvalidated time if the calendar is disconnected mid-flow.

**4. `days=1` screened-calls filter uses midnight, not rolling 24 hours**
`app/api/dashboard/screened-calls/route.ts`: the `days=1` filter sets `since = startOfToday` (midnight in local time), not "24 hours ago". A call at 11:55 PM last night is excluded from "today's" list until midnight. Affects screened-calls dashboard recency.

**5. Email notification failures are fully silent**
`lib/notify-owner.ts` wraps `getTransporter()` in try/catch. Missing or invalid SMTP credentials cause the function to return without sending, without logging, without any error surfaced to the caller or user. Businesses can go hours without booking notifications with no visible indication anything failed.

**6. No webhook signature verification on Telnyx endpoints**
`/api/webhooks/voice` and `/api/webhooks/sms` accept any POST without verifying `TELNYX_PUBLIC_KEY`. An attacker who knows the URL can trigger real call control actions (hangup calls, send SMS) and create DB records. `TELNYX_PUBLIC_KEY` env var is defined but unused in any verification code.

**7. Deferred DB writes create silent dashboard discrepancies**
Both `sendMissedCallSMS()` and `sendSMSAndLog()` call `telnyx.messages.send()` first, then defer `Message.create()` and `recordMessageSent()` via `void promise.then().catch()`. If the deferred write fails, the SMS was delivered but will not appear in the dashboard conversation thread.

**8. `customerEmail` field is sparsely populated on Conversation**
`Conversation.customerEmail` is only set when the `[READY_TO_CAPTURE]` tag fires in the lead flow. In the calendar booking flow, email is collected in `Appointment.customerEmail` but not synced back to `Conversation`. Many conversations show `customerEmail: null` even for customers with confirmed appointments.

**9. `callConnected=false` after successful call is possible**
`callConnected` is set to `true` only after the B-leg bridge succeeds and `call.speak.ended` fires. A call where the owner answered but the bridge command failed would leave `callConnected=false`, potentially triggering a missed-call SMS to a customer who just spoke with the owner.

**10. `SpamOnlyDashboard.tsx` appears to be dead code**
`app/(dashboard)/dashboard/SpamOnlyDashboard.tsx` exists but `OverviewClient.tsx` (Batch 2) now handles all business modes via feature flags, including spam-screening-only businesses. This file may no longer be imported anywhere.

**11. `conversations/` dashboard route vs `messages/`**
`app/(dashboard)/dashboard/conversations/` exists alongside `messages/`. Their distinct purposes are unclear from filenames alone. This may be a legacy directory or a separate access point to the same data.

---

## 9. In-flight Work

### Batch 1 — Shipped
Server-side `contactName` resolution on voicemail rows. `dashboard/page.tsx` now fetches contact names using a `normalizePhoneNumber` map lookup, eliminating the client-side loading flash and missing-name issue on the overview voicemail section.

### Batch 2 — Implemented, awaiting review (do NOT commit/push yet)

All five changes passed `npx tsc --noEmit` clean.

| File | Change |
|---|---|
| `lib/business-features.ts` | New file — centralized `getBusinessFeatures()` helper |
| `app/api/dashboard/analytics/route.ts` | `totalCalls` now uses `totalCallsMode`-aware query strategy |
| `app/(dashboard)/dashboard/analytics/AnalyticsClient.tsx` | Metric cards feature-gated via API response |
| `app/(dashboard)/dashboard/OverviewClient.tsx` | Feature flag updates + "Recent Voicemails" section |
| `app/(dashboard)/dashboard/page.tsx` | Server-side voicemail fetch + `initialVoicemails` prop |
| `app/(dashboard)/layout.tsx` | Nav items built via `getBusinessFeatures(business)` |

### Known Open Issue
Calendar booking failure for one client. Root cause: `canAiBook=false` when calendar is connected, combined with `handleSmsBookingFlow()` returning false in an edge case, leaves the customer in a `generateAIResponse()` loop that cannot complete a booking. The `[APPOINTMENT_BOOKED:]` path that would have handled this is intentionally disabled when `googleCalendarConnected=true`.

---

## 10. Open TODOs

A grep for `TODO`, `FIXME`, and `HACK` across the full codebase returned only 3 hits — all comment strings in UI copy and a single phone-utils annotation. There are no code-level TODO annotations in the project.

Architectural gaps identified by code review (not explicitly marked in code):

- **Webhook signature verification** — `TELNYX_PUBLIC_KEY` defined but unused; any POST to `/api/webhooks/voice` or `/api/webhooks/sms` is accepted
- **SMTP error visibility** — `lib/notify-owner.ts` swallows email errors silently; no alerting, no retry
- **`SpamOnlyDashboard.tsx`** — verify if still imported anywhere; likely safe to delete
- **`app/(dashboard)/dashboard/conversations/`** — clarify purpose vs `messages/` or remove if legacy
- **`lib/google-sheets-sync.ts`** — not documented in CLAUDE.md; confirm still in use
- **`canAiBook` flag** — disabling `[APPOINTMENT_BOOKED:]` when calendar is connected is the right design, but the booking state machine must be reliable; the current failure mode is silent
- **`getAvailableSlots()` returning `[]` silently** — consider surfacing an explicit error when calendar is disconnected rather than returning an empty slot list that passes verification
- **`conversations/` vs `messages/` directory** — consolidate or document distinction
