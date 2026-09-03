// ===========================================
// FUNNEL VIDEO CONFIG
// ===========================================
// The ONLY thing that differs between arm A and arm B. Both arms render the
// same two pages with the same copy; the coin flip decides which file plays.
//
// Keeping both sources in one object is the point: when the arms differ by a
// single value, that value should be readable in one place rather than inferred
// from two branches.

import type { FunnelVariant } from '@/lib/funnel-variant'

export type FunnelVideo = { src: string; poster: string }

/** Shared still. Both arms use the existing poster frame. */
function poster(): string {
  return (
    process.env.NEXT_PUBLIC_DEMO_POSTER_URL?.trim() ||
    '/images/demo-poster.jpg'
  )
}

export const FUNNEL_VIDEOS: Record<FunnelVariant, FunnelVideo> = {
  // Arm A: the demo video already live (pt.3), served from Vercel Blob.
  A: {
    src: process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim() || '/videos/funnel-a.mp4',
    poster: poster(),
  },
  // Arm B: pt.2. NO FALLBACK TO A, deliberately.
  //
  // Serving A's file under the B label would not break anything visibly — it
  // would quietly make both arms identical and produce a clean-looking result
  // for a test that never ran. An empty src is a fault someone notices; a
  // silently duplicated arm is one nobody does. /admin/arms flags it in red.
  B: {
    src: process.env.NEXT_PUBLIC_FUNNEL_VIDEO_B?.trim() || '',
    poster: poster(),
  },
}

export function videoFor(arm: FunnelVariant): FunnelVideo {
  const video = FUNNEL_VIDEOS[arm] ?? FUNNEL_VIDEOS.A
  if (!video.src) {
    // Loud on the server so it shows up in logs as well as the readout.
    console.error(
      `[funnel-videos] arm ${arm} has NO VIDEO configured. ` +
        'Set NEXT_PUBLIC_FUNNEL_VIDEO_B. Not falling back to arm A: that would ' +
        'silently collapse the A/B test into one arm.'
    )
  }
  return video
}

/** Arms with no video configured. Drives the warning on /admin/arms. */
export function armsMissingVideo(): FunnelVariant[] {
  return (Object.keys(FUNNEL_VIDEOS) as FunnelVariant[]).filter((a) => !FUNNEL_VIDEOS[a].src)
}
