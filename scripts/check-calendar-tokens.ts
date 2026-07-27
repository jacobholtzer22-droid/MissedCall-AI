/**
 * Calendar token audit — check every business with googleCalendarConnected=true.
 *
 * For each: attempt a token refresh, then a freebusy query against the primary calendar.
 * Prints PASS or FAIL per business with the error detail.
 *
 * STRICTLY READ-ONLY: zero DB writes. Builds the OAuth2 client manually instead
 * of using getValidAccessToken. Does not save refreshed tokens or flip flags.
 *
 * Usage:
 *   npx tsx scripts/check-calendar-tokens.ts
 *
 * Requires: DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'

const EXPECTED_CLIENT_ID_PREFIX = '787593763422-64i5'

// Hard guard: verify we're using the correct Google OAuth client
const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
const prefix = clientId.slice(0, 20)
if (!clientId.startsWith(EXPECTED_CLIENT_ID_PREFIX)) {
  console.error(`\n  ENV GUARD FAILED`)
  console.error(`  Expected GOOGLE_CLIENT_ID to start with: ${EXPECTED_CLIENT_ID_PREFIX}`)
  console.error(`  Got first 20 chars: "${prefix}"`)
  console.error(`  Full length: ${clientId.length} chars`)
  console.error(`\n  STOPPING. Do not work around this guard.\n`)
  process.exit(1)
}

const prisma = new PrismaClient()

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

async function checkBusiness(business: {
  id: string
  name: string
  googleAccessToken: string | null
  googleRefreshToken: string | null
}): Promise<{ pass: boolean; error?: string }> {
  if (!business.googleRefreshToken) {
    return { pass: false, error: 'No refresh token stored' }
  }

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials({
    access_token: business.googleAccessToken,
    refresh_token: business.googleRefreshToken,
  })

  // Step 1: Token refresh (read-only — we use the refreshed token in memory but don't save it)
  let accessToken: string
  try {
    type RefreshResult = { credentials: { access_token?: string | null } }
    const result = await oauth2.refreshAccessToken() as unknown as RefreshResult
    if (!result.credentials.access_token) {
      return { pass: false, error: 'Token refresh returned no access_token' }
    }
    accessToken = result.credentials.access_token
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { pass: false, error: `Token refresh failed: ${msg}` }
  }

  // Step 2: Freebusy query (read-only calendar probe)
  try {
    const oauth2Fresh = getOAuth2Client()
    oauth2Fresh.setCredentials({ access_token: accessToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2Fresh })

    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: tomorrow.toISOString(),
        items: [{ id: 'primary' }],
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { pass: false, error: `Freebusy query failed: ${msg}` }
  }

  return { pass: true }
}

async function main() {
  console.log(`\n  ENV guard passed: GOOGLE_CLIENT_ID starts with ${EXPECTED_CLIENT_ID_PREFIX}`)

  const businesses = await prisma.business.findMany({
    where: { googleCalendarConnected: true },
    select: {
      id: true,
      name: true,
      googleAccessToken: true,
      googleRefreshToken: true,
    },
    orderBy: { name: 'asc' },
  })

  console.log(`  Calendar token audit — ${businesses.length} businesses with googleCalendarConnected=true`)
  console.log(`  Mode: READ-ONLY (no DB writes)\n`)
  console.log('─'.repeat(80))

  let passCount = 0
  let failCount = 0

  for (const biz of businesses) {
    const result = await checkBusiness(biz)
    if (result.pass) {
      passCount++
      console.log(`  PASS  ${biz.name} (${biz.id})`)
    } else {
      failCount++
      console.log(`  FAIL  ${biz.name} (${biz.id})`)
      console.log(`        ${result.error}`)
    }
  }

  console.log('─'.repeat(80))
  console.log(`\n  ${passCount} passed, ${failCount} failed out of ${businesses.length} total\n`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
