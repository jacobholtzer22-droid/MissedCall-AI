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
//
// ENCODING: exactly one encode, exactly one decode, on every path.
//   write   serializeAttributionPair  encodeURIComponent(JSON)   (browser)
//   read    Next's request.cookies    decodeURIComponent          (server)
//   read    readCookie + decodeOnce   decodeURIComponent          (browser)
// parseAttributionCookie takes an ALREADY-DECODED value. It used to decode a
// second time, which threw on any stored value containing a literal "%" (a
// percent-encoded path or UTM, once decoded) and the silent catch turned that
// into "no attribution" for the booking.

import {
  buildTouch,
  mergeTouch,
  sanitizePair,
  type AttributionPair,
  type AttributionTouch,
} from './attribution'

export const ATTRIBUTION_COOKIE = 'aa_attr'
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

/** Who was reading the cookie, for the failure log. */
export type AttributionReadContext = { route: string; visitorId?: string | null }

/**
 * Parse an already-decoded cookie value. Never throws: a corrupt cookie is just
 * no history, but it is logged, because a silent {} here is exactly how
 * bookings lost their attribution.
 */
export function parseAttributionCookie(
  value: string | null | undefined,
  context?: AttributionReadContext
): AttributionPair {
  if (!value) return {}
  try {
    return sanitizePair(JSON.parse(value))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (typeof window === 'undefined') {
      console.error(
        `[attribution] cookie parse FAILED route=${context?.route ?? 'unknown'} ` +
          `visitor=${context?.visitorId || 'none'} len=${value.length} ` +
          `head=${JSON.stringify(value.slice(0, 24))} error=${message}`
      )
    } else {
      reportClientError('parse', message)
    }
    return {}
  }
}

export function serializeAttributionPair(pair: AttributionPair): string {
  return encodeURIComponent(JSON.stringify(pair))
}

/**
 * Browser-side failures cannot reach Vercel logs on their own, so they are sent
 * to the first-party event log, where the server stamps the visitor cookie on
 * the row. Best effort: this must never throw into the page.
 */
function reportClientError(stage: string, message: string) {
  try {
    console.warn(`[attribution] ${stage} failed: ${message}`)
    void fetch('/api/funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'attribution_error',
        metadata: { stage, error: message.slice(0, 200), path: window.location.pathname },
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting the failure failed. Nothing further is safe to do from here.
  }
}

/** The raw, still-encoded value exactly as document.cookie holds it. */
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
    } catch (err) {
      reportClientError('referrer', err instanceof Error ? err.message : String(err))
      effectiveReferrer = referrer
    }

    const next: AttributionTouch = buildTouch({
      search: window.location.search,
      referrer: effectiveReferrer,
      arm: arm ?? null,
      path: window.location.pathname,
    })

    // The single decode on the browser side. A value that will not decode is
    // treated as no history (and replaced by this write), never re-decoded.
    let existing: AttributionPair = {}
    const raw = readCookie(ATTRIBUTION_COOKIE)
    if (raw) {
      try {
        existing = parseAttributionCookie(decodeURIComponent(raw))
      } catch (err) {
        reportClientError('decode', err instanceof Error ? err.message : String(err))
      }
    }

    const merged = mergeTouch(existing, next)
    document.cookie =
      `${ATTRIBUTION_COOKIE}=${serializeAttributionPair(merged)}; path=/; max-age=${ATTRIBUTION_MAX_AGE}; SameSite=Lax` +
      (window.location.protocol === 'https:' ? '; Secure' : '')
    return merged
  } catch (err) {
    // Attribution is telemetry. It must never take a funnel page down with it.
    reportClientError('capture', err instanceof Error ? err.message : String(err))
    return {}
  }
}
