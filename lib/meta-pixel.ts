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
 * Fire a Meta standard event. Safe to call before fbevents.js has loaded —
 * the call queues and flushes on load.
 */
export function fbTrack(eventName: string, params?: Record<string, unknown>): void {
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
  const fbq = ensureFbq()
  if (!fbq) return
  if (params) {
    fbq('trackCustom', eventName, params)
  } else {
    fbq('trackCustom', eventName)
  }
}
