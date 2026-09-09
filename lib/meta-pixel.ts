// ===========================================
// META PIXEL CLIENT HELPER
// ===========================================
// Every Meta Pixel event in the app goes through fbTrack().
//
// Why this exists: the old call sites used `if (window.fbq) { ... }`. The pixel
// loader runs with strategy="afterInteractive", so `window.fbq` is undefined for
// a short window after hydration. Any event fired in that window hit the falsy
// guard and was dropped silently — no error, no console warning, no event.
//
// ensureFbq() installs the standard Meta stub (the same one the loader snippet
// installs) if it is not there yet, so calls are pushed onto fbq.queue and get
// flushed by fbevents.js when it finishes loading. The loader snippet in
// MetaPixel.tsx is written to reuse an existing stub instead of bailing out,
// so the two can install it in either order without losing the queue.

type Fbq = {
  (...args: unknown[]): void
  queue: unknown[]
  callMethod?: (...args: unknown[]) => void
  loaded?: boolean
  version?: string
  push?: unknown
}

/**
 * Return window.fbq, installing the standard queueing stub first if needed.
 * Returns null during SSR. Never throws.
 */
export function ensureFbq(): Fbq | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq }

  if (!w.fbq) {
    // Same stub the official Meta snippet installs: queue calls until
    // fbevents.js loads and replaces callMethod.
    const n = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      n.callMethod ? n.callMethod.apply(n, arguments as unknown as unknown[]) : n.queue.push(arguments)
    } as unknown as Fbq
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    w.fbq = n
    if (!w._fbq) w._fbq = n
  }

  return w.fbq
}


/**
 * Suppress every pixel event on this page view.
 *
 * `?test=1` on any funnel URL. It exists so Jacob can walk his own funnel
 * without the walk landing in Events Manager and teaching the ad set that his
 * own testing is a conversion — the same failure mode, at a smaller scale, as
 * the agency leads this flag was added alongside.
 *
 * Read per call rather than cached: the flag has to survive a client-side route
 * change from /book/a to /book/a/watch, where the query string is re-evaluated
 * but no module is re-imported.
 *
 * Deliberately does NOT suppress the SERVER event. CAPI is fired from the API
 * route, which has its own test handling, and silently dropping half a deduped
 * pair is how you end up debugging a phantom.
 */
export function pixelSuppressed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('test') === '1'
  } catch {
    return false
  }
}

/**
 * Fire a Meta standard event. Safe to call before fbevents.js has loaded —
 * the call queues and flushes on load.
 */
export function fbTrack(eventName: string, params?: Record<string, unknown>): void {
  if (pixelSuppressed()) return
  const fbq = ensureFbq()
  if (!fbq) return
  if (params) {
    fbq('track', eventName, params)
  } else {
    fbq('track', eventName)
  }
}

/**
 * Fire a Meta custom event. Used for per-step funnel analytics so drop-off is
 * measurable without adding another vendor. Same queueing guarantees as fbTrack.
 */
export function fbTrackCustom(eventName: string, params?: Record<string, unknown>): void {
  if (pixelSuppressed()) return
  const fbq = ensureFbq()
  if (!fbq) return
  if (params) {
    fbq('trackCustom', eventName, params)
  } else {
    fbq('trackCustom', eventName)
  }
}

/**
 * Fire a standard event with an explicit event_id for CAPI deduplication.
 *
 * fbq's 4th argument is an options object whose `eventID` key (that exact
 * casing) is what Meta matches against the server event's `event_id`. Spelling
 * it `event_id` here silently disables dedup and double-counts every
 * conversion, which is why it is written once, here, and never at a call site.
 */
export function fbTrackWithId(
  eventName: string,
  eventId: string,
  params?: Record<string, unknown>
): void {
  if (pixelSuppressed()) return
  const fbq = ensureFbq()
  if (!fbq) return
  fbq('track', eventName, params ?? {}, { eventID: eventId })
}
