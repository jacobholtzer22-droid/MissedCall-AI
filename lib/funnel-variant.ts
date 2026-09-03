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
// WHAT A AND B MEAN CHANGED (Aug 31 2026). This was "which MP4 plays". It is
// now two different FUNNEL STRUCTURES at the same /book URL:
//
//   A  video-first. The six-screen gate unlocks the founder video, then the
//      booking wizard underneath it.
//   B  form-first. Headline, handshake photo, plain-language offer, one lead
//      form. Verified submits land on /book/thanks, which is where the video
//      and the booking wizard live.
//
// The assignment plumbing is unchanged and deliberately reused: same middleware
// coin flip, same aa_funnel_variant cookie, same ?variant= override, same
// funnelVariant stamping on WebsiteLead and Appointment. Only the meaning of
// the letter changed, so historical rows from the video test are NOT comparable
// to rows written after this date. Filter reports by date.

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

// The ?variant= override is gone. /book/a and /book/b ARE the override now:
// an arm you can link to, bookmark and read off an ad URL beats a query
// parameter that silently rewrote a cookie.

/**
 * The demo video. ONE film, both arms: arm A gates it, arm B shows it on the
 * thank-you page.
 *
 * This is the pt.3 cut. Its blob is still named "founder-video-b" for the
 * historical reason that pt.3 was uploaded as variant B's video back when the
 * A/B was two videos rather than two structures — the name is stale, the file
 * is the canonical demo. The old "-v2" cut is no longer referenced anywhere.
 *
 * NEXT_PUBLIC_DEMO_VIDEO_URL_B and _POSTER_URL_B are gone: nothing reads a
 * per-arm video any more.
 */
export function demoVideo(): { src: string; poster: string } {
  return {
    src: process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim() || '/founder-video.mp4',
    poster: process.env.NEXT_PUBLIC_DEMO_POSTER_URL?.trim() || '',
  }
}
