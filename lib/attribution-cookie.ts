// ===========================================
// ATTRIBUTION COOKIE
// ===========================================
// One cookie carries the first/last touch pair for 90 days. Written by the
// browser on every funnel landing, read by the server at OTP and at booking.
//
// Deliberately NOT httpOnly: the browser is the only thing that can see
// document.referrer, so the browser has to be the writer. Nothing security-
// sensitive lives in here — worst case someone forges their own attribution,
// which costs a wrong row in Jacob's own report and nothing else. Everything
// read out of it is re-sanitised server-side (sanitizePair) before it is
// stored, so a hand-edited cookie cannot inject fields or unbounded strings.

import {
  buildTouch,
  mergeTouch,
  sanitizePair,
  type AttributionPair,
  type AttributionTouch,
} from './attribution'

export const ATTRIBUTION_COOKIE = 'aa_attr'
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

/** Parse the cookie value. Never throws: a corrupt cookie is just no history. */
export function parseAttributionCookie(value: string | null | undefined): AttributionPair {
  if (!value) return {}
  try {
    return sanitizePair(JSON.parse(decodeURIComponent(value)))
  } catch {
    return {}
  }
}

export function serializeAttributionPair(pair: AttributionPair): string {
  return encodeURIComponent(JSON.stringify(pair))
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : null
}

/** _fbp / _fbc as the pixel left them. Read here so the lead row can keep them. */
export function readMetaCookies(): { fbp: string | null; fbc: string | null } {
  return { fbp: readCookie('_fbp'), fbc: readCookie('_fbc') }
}

/**
 * Record this landing and return the merged pair.
 *
 * Called on every funnel page load. The last touch is always replaced — a
 * direct return visit IS the last touch. The first is written only once, and
 * only for a visit that actually carried a signal, which is what makes an ad
 * click survive the visitor coming back by typing the URL a day later.
 */
export function captureAttribution(arm?: string | null): AttributionPair {
  if (typeof window === 'undefined') return {}
  try {
    const referrer = document.referrer || ''
    const selfHost = window.location.hostname
    let effectiveReferrer = referrer
    try {
      // A hop inside our own site is not a channel. Without this, walking
      // /book/a -> /book/a/watch would overwrite the ad with "alignandacquire.com".
      if (referrer && new URL(referrer).hostname === selfHost) effectiveReferrer = ''
    } catch {
      effectiveReferrer = referrer
    }

    const next: AttributionTouch = buildTouch({
      search: window.location.search,
      referrer: effectiveReferrer,
      arm: arm ?? null,
      path: window.location.pathname,
    })
    const merged = mergeTouch(parseAttributionCookie(readCookie(ATTRIBUTION_COOKIE)), next)
    document.cookie =
      `${ATTRIBUTION_COOKIE}=${serializeAttributionPair(merged)}; path=/; max-age=${ATTRIBUTION_MAX_AGE}; SameSite=Lax` +
      (window.location.protocol === 'https:' ? '; Secure' : '')
    return merged
  } catch {
    // Attribution is telemetry. It must never take a funnel page down with it.
    return {}
  }
}
