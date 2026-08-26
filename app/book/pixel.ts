// ===========================================
// /book PIXEL WRAPPER
// ===========================================
// Thin layer over lib/meta-pixel.ts that adds ?debug=1 console logging.
// Kept local to /book so the shared helper stays untouched.
//
// Event contract for this page, deliberately narrow:
//   ViewContent      page load
//   Lead             qualified gate submit (real trade + name + phone)
//   UnqualifiedLead  gate submit from someone who does not own a business
//   Schedule         booking completed
//
// Lead must fire from exactly ONE path on this page. It is the ad optimization
// target, so it has to mean exactly one thing account-wide.

import { fbTrack, fbTrackCustom } from '@/lib/meta-pixel'

export function isPixelDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1'
  } catch {
    return false
  }
}

function log(kind: 'track' | 'trackCustom', event: string, params?: Record<string, unknown>) {
  if (!isPixelDebug()) return
  // eslint-disable-next-line no-console
  console.log(
    `%c[pixel] ${kind} ${event}`,
    'color:#EE6B1A;font-weight:bold',
    params ?? {}
  )
}

export function trackStandard(event: string, params?: Record<string, unknown>) {
  log('track', event, params)
  fbTrack(event, params)
}

export function trackCustomEvent(event: string, params?: Record<string, unknown>) {
  log('trackCustom', event, params)
  fbTrackCustom(event, params)
}
