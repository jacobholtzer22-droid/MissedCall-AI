# MissedCall AI

Turn missed calls into booked appointments with AI-powered SMS conversations.

## What This Does

When a business misses a call:
1. **Detects the missed call** via Twilio
2. **Sends an immediate text** to the caller
3. **Has an AI conversation** to understand what they need
4. **Books appointments** directly into the calendar
5. **Logs everything** in a dashboard for the business to review

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL (via Neon)
- **Auth**: Clerk
- **SMS/Voice**: Twilio
- **AI**: Claude (Anthropic)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel

## Quick Start

### 1. Install Dependencies

```bash
cd missedcall-ai
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and fill in your credentials:

```env
# Clerk (from https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# Neon Database (from https://console.neon.tech)
DATABASE_URL=postgresql://xxxxx

# Anthropic (from https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Twilio (from https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

### 3. Set Up the Database

Push the schema to your database:

```bash
npm run db:push
```

This creates all the tables defined in `prisma/schema.prisma`.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

### 5. Set Up Twilio Webhooks (for testing)

For local development, you'll need a tunnel so Twilio can reach your computer.
Install ngrok (or use a similar tool):

```bash
# Install ngrok (one-time)
brew install ngrok  # on Mac

# Start the tunnel
ngrok http 3000
```

Then configure your Twilio phone number's webhooks:
- **Voice webhook**: `https://your-ngrok-url.ngrok.io/api/webhooks/twilio/voice`
- **SMS webhook**: `https://your-ngrok-url.ngrok.io/api/webhooks/twilio/sms`

## Project Structure

```
missedcall-ai/
├── app/
│   ├── (auth)/              # Auth pages (sign-in, sign-up)
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── dashboard/       # Main dashboard
│   │   ├── conversations/   # View conversations
│   │   ├── appointments/    # View appointments
│   │   └── settings/        # Business settings
│   ├── api/
│   │   └── webhooks/
│   │       └── twilio/      # Twilio webhook handlers
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing page
├── lib/
│   ├── db.ts                # Database client
│   └── utils.ts             # Helper functions
├── prisma/
│   └── schema.prisma        # Database schema
└── middleware.ts            # Auth middleware
```

## Key Files Explained

### `prisma/schema.prisma`
Defines all database tables: businesses, users, conversations, messages, appointments.

### `app/api/webhooks/twilio/voice/route.ts`
Receives incoming call notifications from Twilio. Detects missed calls and triggers the initial SMS.

### `app/api/webhooks/twilio/sms/route.ts`
Receives incoming text messages. Sends them to Claude AI for a response and sends the reply back.

### `middleware.ts`
Protects dashboard routes - only logged-in users can access them.

## Database Commands

```bash
# Push schema changes to database
npm run db:push

# Open Prisma Studio (visual database editor)
npm run db:studio

# Regenerate Prisma client after schema changes
npm run db:generate
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add all environment variables in Vercel's dashboard
4. Deploy!

### Post-Deployment

1. Update your Twilio webhooks to use your Vercel URL
2. Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables

## Next Steps (What We'll Build)

- [ ] Phone number provisioning per business
- [ ] Google Calendar integration
- [ ] Real-time conversation updates
- [ ] Appointment confirmation/reminder texts
- [ ] Stripe billing integration
- [ ] Analytics dashboard

## Support

This is a custom-built SaaS. If you need help, refer back to the build guide.
