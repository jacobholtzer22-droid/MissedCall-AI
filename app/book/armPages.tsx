// ===========================================
// SHARED ARM PAGE BODIES
// ===========================================
// /book/a and /book/b render THE SAME components through these two factories.
// The arm is a parameter, not a fork: there is no second copy of either page to
// drift, so "identical except the video" is guaranteed by construction rather
// than by remembering to edit both.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { GATE_COOKIE } from './constants'
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

/**
 * The lead this browser verified, from the httpOnly gate cookie the OTP route
 * sets in the same response that sends the visitor here. Only a lead that
 * actually passed OTP counts: the legacy no-OTP route sets the same cookie.
 */
async function verifiedLeadFromGateCookie(): Promise<string | null> {
  const leadId = cookies().get(GATE_COOKIE)?.value
  if (!leadId) return null
  const lead = await db.websiteLead
    .findUnique({ where: { id: leadId }, select: { id: true, otpVerifiedAt: true } })
    .catch(() => null)
  return lead?.otpVerifiedAt ? lead.id : null
}

export async function armWatchPage(arm: FunnelVariant, token: string | undefined) {
  const tokenClaim = verifyWatchToken(token)
  let claim: { leadId: string; arm: FunnelVariant }
  if (tokenClaim.ok) {
    // A token minted for the other arm must not unlock this one, or a single
    // link would let a visitor see whichever video they guessed at.
    if (tokenClaim.arm !== arm) {
      redirect(`/book/${tokenClaim.arm.toLowerCase()}/watch?t=${encodeURIComponent(token ?? '')}`)
    }
    claim = tokenClaim
  } else {
    // The unlock right after OTP must not depend on the token being mintable.
    // When OTP_SECRET is missing (it is Production-only in Vercel, so every
    // preview deploy) the wizard cannot sign a link, and the visitor used to
    // sit on a 100% modal forever. The gate cookie from that same response
    // proves the same thing for this browser.
    const leadId = await verifiedLeadFromGateCookie()
    if (!leadId) {
      console.warn(`[book/${arm.toLowerCase()}/watch] token rejected reason=${tokenClaim.reason}, no verified gate cookie`)
      redirect(`/book/${arm.toLowerCase()}`)
    }
    console.warn(`[book/${arm.toLowerCase()}/watch] token ${tokenClaim.reason}; unlocked by gate cookie leadId=${leadId}`)
    claim = { leadId, arm }
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
