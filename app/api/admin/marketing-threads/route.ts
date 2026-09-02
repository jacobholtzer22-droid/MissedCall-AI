// ===========================================
// /api/admin/marketing-threads
// ===========================================
// Read and reply to conversations on the /book funnel's own number.
//
// These were invisible until now: they are not tenant traffic, so they never
// appeared in any client dashboard, and Jacob had no way to read what leads
// texted back — including a lead asking to book.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Telnyx from 'telnyx'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { normalizeToE164 } from '@/lib/phone-utils'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const { userId } = await auth()
  return Boolean(userId && userId === process.env.ADMIN_USER_ID)
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const business = await getMarketingBusiness()
  if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

  const conversations = await db.conversation.findMany({
    where: { businessId: business.id },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    select: {
      id: true,
      callerPhone: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, direction: true, content: true, createdAt: true, telnyxStatus: true },
      },
    },
  })

  // Who each thread belongs to, and whether they have opted out. Both are
  // resolved in bulk rather than per-thread so the page stays one round trip.
  const phones = conversations.map((c) => c.callerPhone)
  const [leads, blocked] = await Promise.all([
    db.websiteLead.findMany({
      where: { businessId: business.id, phone: { in: phones } },
      orderBy: { createdAt: 'desc' },
      select: { phone: true, name: true, message: true, funnelVariant: true },
    }),
    db.blockedNumber.findMany({
      where: { businessId: business.id, phoneNumber: { in: phones }, label: 'sms-opt-out' },
      select: { phoneNumber: true },
    }),
  ])
  const optedOut = new Set(blocked.map((b) => b.phoneNumber))
  const leadByPhone = new Map<string, (typeof leads)[number]>()
  for (const l of leads) if (l.phone && !leadByPhone.has(l.phone)) leadByPhone.set(l.phone, l)

  return NextResponse.json({
    threads: conversations.map((c) => {
      const lead = leadByPhone.get(c.callerPhone)
      return {
        id: c.id,
        phone: c.callerPhone,
        status: c.status,
        lastMessageAt: c.lastMessageAt.toISOString(),
        optedOut: optedOut.has(c.callerPhone),
        firstName: lead?.message?.match(/^First name: (.+)$/m)?.[1]?.trim() ?? lead?.name ?? '',
        businessName: lead?.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
        trade: lead?.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? '',
        arm: lead?.funnelVariant ?? null,
        messages: c.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          status: m.telnyxStatus,
        })),
      }
    }),
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const business = await getMarketingBusiness()
  if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

  const body = (await request.json()) as { conversationId?: string; text?: string }
  const text = body.text?.trim() ?? ''
  if (!body.conversationId || !text) {
    return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 })
  }

  const convo = await db.conversation.findFirst({
    where: { id: body.conversationId, businessId: business.id },
    select: { id: true, callerPhone: true },
  })
  if (!convo) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  // Opt-out is legally binding and is checked HERE, not just in the UI: a stale
  // page must not be able to text someone who sent STOP.
  const blocked = await db.blockedNumber.findFirst({
    where: { businessId: business.id, phoneNumber: convo.callerPhone, label: 'sms-opt-out' },
  })
  if (blocked) {
    return NextResponse.json({ error: 'This number opted out. You cannot text them.' }, { status: 409 })
  }

  const from = process.env.MARKETING_TELNYX_NUMBER?.trim()
  if (!from || !process.env.TELNYX_API_KEY) {
    return NextResponse.json({ error: 'Marketing sender is not configured.' }, { status: 503 })
  }

  const to = normalizeToE164(convo.callerPhone)
  try {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY })
    const res = await telnyx.messages.send({ from, to, text })
    const providerId = (res as { data?: { id?: string } })?.data?.id ?? null
    const message = await db.message.create({
      data: { conversationId: convo.id, direction: 'outbound', content: text, telnyxSid: providerId },
      select: { id: true, direction: true, content: true, createdAt: true },
    })
    await db.conversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: new Date(), manualMode: true },
    })
    console.log(`[admin/marketing-threads] REPLY SENT to=${to} from=${from} providerId=${providerId}`)
    return NextResponse.json({
      success: true,
      message: { ...message, createdAt: message.createdAt.toISOString() },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[admin/marketing-threads] REPLY FAILED to=${to}: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
