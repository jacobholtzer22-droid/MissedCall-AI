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

import { fbTrack, fbTrackCustom } from '@/lib/meta-pixel'

let currentVariant: string | null = null

/** Called once on mount with the server-assigned arm. */
export function setPixelVariant(variant: string | null) {
  currentVariant = variant
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
  return currentVariant ? { ...(params ?? {}), variant: currentVariant } : { ...(params ?? {}) }
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

export function trackCustomEvent(event: string, params?: Record<string, unknown>) {
  const merged = withVariant(params)
  log('trackCustom', event, merged)
  fbTrackCustom(event, merged)
}
