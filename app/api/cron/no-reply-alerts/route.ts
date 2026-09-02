// ===========================================
// CRON: NO-REPLY OWNER ALERTS
// ===========================================
// Runs every 10 minutes (vercel.json). For businesses with noReplyAlertEnabled:
// find conversations where the missed-call text-back went out, the customer never
// replied within the business's noReplyAlertMinutes window, and the owner hasn't
// been alerted yet — then nudge the owner by SMS/email so they can call back while
// the lead is warm. Each conversation alerts at most once (noReplyAlertSentAt).
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// the CRON_SECRET env var is set. The logged-in super-admin can also trigger it
// manually (GET or POST) for testing.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { notifyOwnerOnNoReply } from '@/lib/notify-owner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Don't alert for conversations older than this — prevents a flood of stale alerts
// the moment the feature is switched on for a business with existing history.
const MAX_LOOKBACK_HOURS = 24

// Only silent conversations qualify. Anything that progressed (booking link sent,
// lead captured, appointment booked, human needed, closed...) means the customer
// engaged or the owner is already in the loop.
const ALERTABLE_STATUSES = ['active', 'no_response']

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  // Manual-trigger fallback: the super-admin hitting the URL while logged in
  try {
    const { userId } = await auth()
    if (userId && process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true
  } catch {
    // No Clerk context (e.g. cron request without a session) — fall through
  }
  return false
}

export async function GET(request: NextRequest) {
  return runNoReplyAlerts(request)
}

export async function POST(request: NextRequest) {
  return runNoReplyAlerts(request)
}

async function runNoReplyAlerts(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const businesses = await db.business.findMany({
    where: { noReplyAlertEnabled: true, missedCallAiEnabled: { not: false } },
  })

  let checked = 0
  let alerted = 0
  const errors: string[] = []

  for (const business of businesses) {
    const minutes =
      business.noReplyAlertMinutes && business.noReplyAlertMinutes > 0 ? business.noReplyAlertMinutes : 60
    const cutoff = new Date(now - minutes * 60_000)
    const oldest = new Date(now - MAX_LOOKBACK_HOURS * 3_600_000)

    const candidates = await db.conversation.findMany({
      where: {
        businessId: business.id,
        status: { in: ALERTABLE_STATUSES },
        noReplyAlertSentAt: null,
        callConnected: false,
        createdAt: { gte: oldest, lte: cutoff },
        // Only conversations created BY A CALL are eligible.
        //
        // A manual dashboard send and a campaign send both create a
        // Conversation with status 'active', callConnected false, one outbound
        // message and no inbound — indistinguishable from an unanswered
        // text-back under the old filter, so every manual text to a contact
        // raised a "they never replied" alert at the owner an hour later.
        // callSid is set only by the voice webhook, so it is the one field that
        // separates a real missed call from an outbound-initiated thread.
        callSid: { not: null },
        // Belt and braces: the manual send path also sets this.
        manualMode: false,
      },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { direction: true, createdAt: true } } },
    })

    for (const convo of candidates) {
      checked++
      const outbound = convo.messages.filter((m) => m.direction === 'outbound')
      const hasInbound = convo.messages.some((m) => m.direction === 'inbound')
      // Must have actually received the text-back, and never replied to it
      if (outbound.length === 0 || hasInbound) continue
      // Measure the window from when the text-back actually went out
      if (outbound[0].createdAt.getTime() > cutoff.getTime()) continue

      // Claim before sending so overlapping cron runs can't double-alert
      const claim = await db.conversation.updateMany({
        where: { id: convo.id, noReplyAlertSentAt: null },
        data: { noReplyAlertSentAt: new Date() },
      })
      if (claim.count === 0) continue

      try {
        const result = await notifyOwnerOnNoReply(business, {
          customerPhone: convo.callerPhone,
          customerName: convo.callerName,
          minutes,
          missedCallAt: convo.createdAt,
          conversationId: convo.id,
        })
        alerted++
        console.log('[NO-REPLY CRON] Alerted owner', {
          businessId: business.id,
          conversationId: convo.id,
          smsSent: result.smsSent,
          emailSent: result.emailSent,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${business.name} / ${convo.id}: ${msg}`)
        console.error('[NO-REPLY CRON] Alert failed:', { businessId: business.id, conversationId: convo.id, msg })
      }
    }
  }

  return NextResponse.json({ ok: true, businesses: businesses.length, checked, alerted, errors })
}
