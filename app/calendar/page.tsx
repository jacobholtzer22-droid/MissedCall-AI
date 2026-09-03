// ===========================================
// /calendar — standalone booking page
// ===========================================
// No gate, no OTP, no video. Two modes, decided entirely by the ?l= token:
//
//   direct    nobody knows who this is. Slots first, then four fields. No pixel,
//             no Meta events — this traffic is cold and unattributed, and
//             counting it as an ad conversion would poison the optimisation.
//   prefilled a lead we texted. Name, business and cell come from the row; we
//             ask only for the email. Schedule fires with their event_id.
//
// EVERY token failure lands in direct mode. A stale link must never show an
// error to someone trying to give us money.

import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import CalendarClient, { type CalendarPrefill } from './CalendarClient'
import { resolveCalendarToken } from '@/lib/lead-token'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { VISITOR_COOKIE } from '@/lib/variant'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Book a Time',
  description: 'Pick a 15 minute slot with Jacob from Align and Acquire.',
  robots: { index: false, follow: false },
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { l?: string; slot?: string }
}) {
  let prefill: CalendarPrefill = { mode: 'direct', firstName: '', businessName: '', phone: '', email: '' }

  // One lookup: resolving the token already proves the lead exists, so the
  // page reads the row it just found rather than querying twice.
  try {
    const business = await getMarketingBusiness()
    if (business && searchParams?.l) {
      const verdict = await resolveCalendarToken(searchParams.l, business.id)
      if (verdict.ok) {
        const lead = await db.websiteLead.findUnique({
          where: { id: verdict.leadId },
          select: { name: true, phone: true, email: true, message: true },
        })
        if (lead) {
          prefill = {
            mode: 'prefilled',
            leadToken: searchParams.l,
            firstName: (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim(),
            businessName: lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
            phone: lead.phone ?? '',
            email: lead.email ?? '',
          }
        }
      } else {
        console.warn(`[calendar] token rejected reason=${verdict.reason}, serving direct mode`)
      }
    }
  } catch (err) {
    // Never an error page. Direct mode still books them.
    console.error('[calendar] token resolution failed, falling back to direct:', err)
  }

  return <CalendarClient prefill={prefill} preselectIso={searchParams?.slot ?? null} />
}
