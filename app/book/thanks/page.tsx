// ===========================================
// /book/thanks — arm B reward page
// ===========================================
// Reached only after a VERIFIED submit on the form-first arm. The video lives
// here rather than on the landing page on purpose: if it were free on /book,
// arm B would be testing "video without a form" instead of "form first", and
// the comparison against arm A would mean nothing.
//
// Server component so the gate cookie resolves before paint and the booking
// wizard opens already knowing who they are.

import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import ThanksClient from './ThanksClient'
import { GATE_COOKIE } from '../constants'
import { VISITOR_COOKIE } from '@/lib/variant'
import { getClaimForVisitor, toState, type CouponState } from '@/lib/coupon'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Thanks — your demo is ready',
  // A confirmation page has nothing to rank for and should never be a landing
  // page from search: it would show the reward without the form.
  robots: { index: false, follow: false },
}

export default async function ThanksPage() {
  const cookieStore = await cookies()
  const leadId = cookieStore.get(GATE_COOKIE)?.value

  let prefill = { name: '', phone: '', email: '', trade: '', company: '' }
  if (leadId) {
    try {
      const lead = await db.websiteLead.findUnique({
        where: { id: leadId },
        select: { name: true, phone: true, email: true, message: true },
      })
      if (lead) {
        prefill = {
          name: lead.name ?? '',
          phone: lead.phone ?? '',
          email: lead.email ?? '',
          trade: lead.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? '',
          company: lead.message?.match(/^Company: (.+)$/m)?.[1]?.trim() ?? '',
        }
      }
    } catch (err) {
      // Never let a cookie or DB hiccup take the reward page down. Worst case
      // the wizard asks for details they already gave.
      console.error('[book/thanks] prefill failed:', err)
    }
  }

  let coupon: CouponState = { status: 'none' }
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
  if (visitorId) {
    try {
      coupon = toState(await getClaimForVisitor(visitorId))
    } catch (err) {
      console.error('[book/thanks] coupon read failed:', err)
    }
  }

  return <ThanksClient prefill={prefill} coupon={coupon} />
}
