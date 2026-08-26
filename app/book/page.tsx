// ===========================================
// /book — GATED DEMO VIDEO FUNNEL
// ===========================================
// Server component. Reads the httpOnly gate cookie and resolves the lead so the
// booking step can show the captured name and phone without ever trusting
// client-side state.
//
// Replaced the previous six-screen wizard. The wizard's qualification questions
// now live on the booking form (Step 2) rather than in front of the video,
// because the wizard converted at 0.23% across 433 cold landing page views.

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import BookFunnelClient, { type InitialGate } from './BookFunnelClient'
import { GATE_COOKIE } from './constants'

export const dynamic = 'force-dynamic'

async function resolveGate(): Promise<InitialGate> {
  try {
    const cookieStore = await cookies()
    const leadId = cookieStore.get(GATE_COOKIE)?.value
    if (!leadId) return null

    const lead = await db.websiteLead.findUnique({
      where: { id: leadId },
      select: { id: true, name: true, phone: true, message: true },
    })
    if (!lead?.phone) return null

    // Trade was written into the lead body at gate time.
    const trade = lead.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? ''
    return { leadId: lead.id, name: lead.name, phone: lead.phone, trade }
  } catch (err) {
    // A cookie or database hiccup must never take the funnel down. Fall back to
    // the ungated path, which asks for everything.
    console.error('[book] gate resolve failed:', err)
    return null
  }
}

export default async function BookPage() {
  const initialGate = await resolveGate()
  return <BookFunnelClient initialGate={initialGate} />
}
