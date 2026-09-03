// ===========================================
// SHARED ARM PAGE BODIES
// ===========================================
// /book/a and /book/b render THE SAME components through these two factories.
// The arm is a parameter, not a fork: there is no second copy of either page to
// drift, so "identical except the video" is guaranteed by construction rather
// than by remembering to edit both.

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import VslLanding from './VslLanding'
import WatchClient from './watch/WatchClient'
import { verifyWatchToken } from '@/lib/watch-token'
import { videoFor } from '@/lib/funnel-videos'
import { logArmWatchView } from '@/lib/arm-log'
import type { FunnelVariant } from '@/lib/funnel-variant'

export function armLandingPage(arm: FunnelVariant) {
  // Poster only. The landing page never plays the video, so handing it the one
  // variable under test would leave the two arms' payloads differing for no
  // reason.
  return <VslLanding arm={arm} poster={videoFor(arm).poster} />
}

export async function armWatchPage(arm: FunnelVariant, token: string | undefined) {
  const claim = verifyWatchToken(token)
  if (!claim.ok) {
    console.warn(`[book/${arm.toLowerCase()}/watch] token rejected reason=${claim.reason}`)
    redirect(`/book/${arm.toLowerCase()}`)
  }
  // A token minted for the other arm must not unlock this one, or a single
  // link would let a visitor see whichever video they guessed at.
  if (claim.arm !== arm) {
    redirect(`/book/${claim.arm.toLowerCase()}/watch?t=${encodeURIComponent(token ?? '')}`)
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
    // A prefill miss costs retyping, not the page.
    console.error(`[book/${arm.toLowerCase()}/watch] prefill failed:`, err)
  }

  const video = videoFor(arm)
  void logArmWatchView({ arm, leadId: claim.leadId, videoUrl: video.src || null })

  return <WatchClient arm={arm} video={video} prefill={prefill} />
}
