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
  // Arm B: placeholder until a file is dropped in. Falls back to A's video so a
  // B visitor never sees a broken player before the real cut exists.
  B: {
    src:
      process.env.NEXT_PUBLIC_FUNNEL_VIDEO_B?.trim() ||
      process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim() ||
      '/videos/funnel-b.mp4',
    poster: poster(),
  },
}

export function videoFor(arm: FunnelVariant): FunnelVideo {
  return FUNNEL_VIDEOS[arm] ?? FUNNEL_VIDEOS.A
}
