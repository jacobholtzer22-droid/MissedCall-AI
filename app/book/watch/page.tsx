// ===========================================
// /book/watch — video + booking, identical for both arms
// ===========================================
// Requires a valid signed token. Without one, back to /book: this page is the
// reward for verifying a number, and serving it cold would make the gate
// pointless.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import WatchClient from './WatchClient'
import { verifyWatchToken } from '@/lib/watch-token'
import { videoFor } from '@/lib/funnel-videos'
import { logArmWatchView } from '@/lib/arm-log'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Watch the Demo',
  robots: { index: false, follow: false },
}

export default async function WatchPage({ searchParams }: { searchParams: { t?: string } }) {
  const claim = verifyWatchToken(searchParams?.t)
  if (!claim.ok) {
    console.warn(`[book/watch] token rejected reason=${claim.reason}`)
    redirect('/book')
  }

  let prefill = { firstName: '', phone: '', email: '', trade: '' }
  try {
    const lead = await db.websiteLead.findUnique({
      where: { id: claim.leadId },
      select: { name: true, phone: true, email: true, message: true },
    })
    if (lead) {
      prefill = {
        firstName: (lead.message?.match(/^First name: (.+)$/m)?.[1] ?? lead.name ?? '').trim(),
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        trade: lead.message?.match(/^Trade: (.+)$/m)?.[1]?.trim() ?? '',
      }
    }
  } catch (err) {
    // A prefill miss costs them retyping, not the page. Never redirect on it.
    console.error('[book/watch] prefill failed:', err)
  }

  // Server-side so it counts real page loads, with the arm and the lead.
  void logArmWatchView({ arm: claim.arm, leadId: claim.leadId })

  return <WatchClient arm={claim.arm} video={videoFor(claim.arm)} prefill={prefill} />
}
