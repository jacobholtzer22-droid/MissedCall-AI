// ===========================================
// /book PIXEL WRAPPER
// ===========================================
// Thin layer over lib/meta-pixel.ts that adds ?debug=1 console logging and
// stamps every event with the A/B variant, so the two arms are comparable in
// the same reports.
//
// Event contract for this page, deliberately narrow:
//   ViewContent      page load
//   Lead             qualified trade + name + phone captured, ONCE per visitor
//   UnqualifiedLead  someone who does not own a service business
//   Schedule         booking completed
//
// Lead is the ad optimization target, so it has to mean exactly one thing.
// In `gate` it fires at the gate submit. In `nogate` it fires at the point in
// the booking wizard where trade, name and phone have all been given. Same
// definition, different moment.

import { fbTrack, fbTrackCustom, fbTrackWithId } from '@/lib/meta-pixel'

let currentVariant: string | null = null
let currentFunnelVariant: string | null = null

/** Called once on mount with the server-assigned gate arm. */
export function setPixelVariant(variant: string | null) {
  currentVariant = variant
}

/** Called once on mount with the server-assigned funnel-structure arm (A or B). */
export function setPixelFunnelVariant(variant: string | null) {
  currentFunnelVariant = variant
}

export function isPixelDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1'
  } catch {
    return false
  }
}

function withVariant(params?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(params ?? {}),
    ...(currentVariant ? { variant: currentVariant } : {}),
    ...(currentFunnelVariant
      ? {
          funnel_variant: currentFunnelVariant,
          // funnel_arm is the name the ad account reports on. funnel_variant is
          // kept alongside it so historical breakdowns do not go blank.
          funnel_arm: currentFunnelVariant,
        }
      : {}),
  }
}

function log(kind: 'track' | 'trackCustom', event: string, params: Record<string, unknown>) {
  if (!isPixelDebug()) return
  // eslint-disable-next-line no-console
  console.log(`%c[pixel] ${kind} ${event}`, 'color:#EE6B1A;font-weight:bold', params)
}

export function trackStandard(event: string, params?: Record<string, unknown>) {
  const merged = withVariant(params)
  log('track', event, merged)
  fbTrack(event, merged)
}

/**
 * Fire a standard event carrying an explicit event_id.
 *
 * Meta dedupes a browser event against a server (CAPI) event only when BOTH
 * carry the same event_name AND the same event_id. Every Lead on this funnel
 * goes through here so that pairing is never left to chance — without it the
 * same conversion is counted twice.
 */
export function trackStandardWithId(
  event: string,
  eventId: string,
  params?: Record<string, unknown>
) {
  const merged = withVariant(params)
  log('track', event, { ...merged, eventID: eventId })
  fbTrackWithId(event, eventId, merged)
}

export function trackCustomEvent(event: string, params?: Record<string, unknown>) {
  const merged = withVariant(params)
  log('trackCustom', event, merged)
  fbTrackCustom(event, merged)
}
