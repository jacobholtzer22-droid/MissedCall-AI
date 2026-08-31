// ===========================================
// FUNNEL VIDEO A/B
// ===========================================
// A second, independent experiment from lib/variant.ts.
//
//   lib/variant.ts       gate vs nogate  (cookie aa_variant,        retired)
//   lib/funnel-variant.ts video A vs B   (cookie aa_funnel_variant, live)
//
// Kept separate on purpose. They answer different questions, they can run at
// the same time, and collapsing them into one cookie would make both reports
// unreadable.
//
// The ONLY difference between A and B is which MP4 plays. Same gate, same price
// card, same coupon timer, same reviews, same booking wizard.

export const FUNNEL_VARIANT_COOKIE = 'aa_funnel_variant'
export const FUNNEL_VARIANT_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export type FunnelVariant = 'A' | 'B'
export const FUNNEL_VARIANTS: FunnelVariant[] = ['A', 'B']

export function isFunnelVariant(value: string | null | undefined): value is FunnelVariant {
  return value === 'A' || value === 'B'
}

/** Fair coin flip. */
export function assignFunnelVariant(): FunnelVariant {
  return Math.random() < 0.5 ? 'A' : 'B'
}

/** `?variant=B` forces an arm for QA. Case-insensitive, so ?variant=b works. */
export function funnelVariantFromQuery(value: string | null | undefined): FunnelVariant | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return isFunnelVariant(upper) ? upper : null
}

/**
 * Video and poster for an arm. A is whatever is already live, so an unset
 * B env var falls back to A rather than rendering a broken player.
 */
export function videoForVariant(variant: FunnelVariant): { src: string; poster: string } {
  const aSrc = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim() || '/founder-video.mp4'
  const aPoster = process.env.NEXT_PUBLIC_DEMO_POSTER_URL?.trim() || ''
  if (variant === 'A') return { src: aSrc, poster: aPoster }
  return {
    src: process.env.NEXT_PUBLIC_DEMO_VIDEO_URL_B?.trim() || aSrc,
    poster: process.env.NEXT_PUBLIC_DEMO_POSTER_URL_B?.trim() || aPoster,
  }
}
