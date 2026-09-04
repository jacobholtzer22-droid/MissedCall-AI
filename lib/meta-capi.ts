// ===========================================
// META CONVERSIONS API (server-side events)
// ===========================================
// The browser pixel is blocked by ad blockers, iOS content blockers and some
// corporate networks — routinely 20-40% of real traffic. CAPI sends the same
// event from the server, where none of that applies.
//
// DEDUPLICATION IS THE WHOLE GAME. Both sides send the SAME `event_id` and the
// same `event_name`; Meta then counts one conversion, not two. Get the id wrong
// and every verified lead is counted twice, which quietly doubles reported
// conversions and wrecks the optimisation signal. The id is minted ONCE on the
// client and handed to the server, never generated independently on both sides.
//
// Fails open, always: a CAPI outage must never block a lead from being written.

import { createHash } from 'crypto'

const GRAPH_VERSION = 'v21.0'

/** Meta requires PII to be SHA-256 of a normalised, lowercased, trimmed value. */
function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/** Phone is hashed digits-only with country code and no punctuation or plus. */
function hashPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  return digits ? createHash('sha256').update(digits).digest('hex') : ''
}

export type CapiEventName = 'Lead' | 'Schedule'

export type CapiLead = {
  /** Which standard event. Defaults to Lead. */
  eventName?: CapiEventName
  /** MUST match the event_id the browser pixel fired. */
  eventId: string
  phone?: string | null
  firstName?: string | null
  /** Custom params Meta will show against the event. */
  trade?: string | null
  businessName?: string | null
  funnelArm?: string | null
  /**
   * Where they actually came from, as classified on the landing view.
   * Sent so Meta's reporting can separate paid clicks from the organic and
   * referral traffic the pixel would otherwise lump into one bucket.
   */
  referrerClass?: string | null
  /** First touch, not last: the touch that earned the lead. */
  firstTouchSource?: string | null
  firstTouchCampaign?: string | null
  /** From the incoming request, so Meta can match the browser session. */
  clientIp?: string | null
  userAgent?: string | null
  /** _fbp / _fbc cookies. Materially improve match quality when present. */
  fbp?: string | null
  fbc?: string | null
  eventSourceUrl?: string | null
}

export type CapiResult =
  | { sent: true; eventsReceived: number; fbTraceId?: string }
  | { sent: false; reason: string }

export function capiConfigured(): boolean {
  return Boolean(process.env.META_CAPI_ACCESS_TOKEN && process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID)
}

/**
 * Send one Lead event server-side.
 *
 * Never throws and never rejects: callers treat this as best-effort telemetry
 * running alongside a lead write that has already succeeded.
 */
export async function sendCapiLead(input: CapiLead): Promise<CapiResult> {
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID
  const token = process.env.META_CAPI_ACCESS_TOKEN
  if (!pixelId || !token) {
    // Expected until the token is created. Logged at debug so it does not read
    // as an error in normal operation.
    console.debug(
      `[capi] SKIP reason=not_configured pixelId=${pixelId ? 'set' : 'MISSING'} token=${token ? 'set' : 'MISSING'}`
    )
    return { sent: false, reason: 'not_configured' }
  }

  const userData: Record<string, unknown> = {}
  if (input.phone) userData.ph = [hashPhone(input.phone)]
  if (input.firstName?.trim()) userData.fn = [hash(input.firstName)]
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.userAgent) userData.client_user_agent = input.userAgent
  if (input.fbp) userData.fbp = input.fbp
  if (input.fbc) userData.fbc = input.fbc

  const payload = {
    data: [
      {
        event_name: input.eventName ?? 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        // Same id the pixel used. This is what makes Meta dedupe the pair.
        event_id: input.eventId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          ...(input.trade ? { trade: input.trade } : {}),
          ...(input.businessName ? { business_name: input.businessName } : {}),
          ...(input.funnelArm ? { funnel_arm: input.funnelArm } : {}),
          ...(input.referrerClass ? { referrer_class: input.referrerClass } : {}),
          ...(input.firstTouchSource ? { first_touch_source: input.firstTouchSource } : {}),
          ...(input.firstTouchCampaign ? { first_touch_campaign: input.firstTouchCampaign } : {}),
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number
      fbtrace_id?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      console.error(`[capi] FAILED status=${res.status} error=${json.error?.message ?? 'unknown'} eventId=${input.eventId}`)
      return { sent: false, reason: json.error?.message ?? `http_${res.status}` }
    }
    console.log(
      `[capi] SENT event=${input.eventName ?? 'Lead'} eventId=${input.eventId} received=${json.events_received ?? 0} trace=${json.fbtrace_id ?? 'n/a'}`
    )
    return { sent: true, eventsReceived: json.events_received ?? 0, fbTraceId: json.fbtrace_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[capi] FAILED eventId=${input.eventId} error=${message}`)
    return { sent: false, reason: message }
  }
}
