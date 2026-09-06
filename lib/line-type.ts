// ===========================================
// TELNYX NUMBER LOOKUP — can this number receive a text?
// ===========================================
// The 40001 "not routable" failure is ASYNCHRONOUS: Telnyx accepts the message,
// returns 200 with an id, and only the delivery receipt minutes later says it
// never arrived. By then the visitor is staring at a code entry box for a text
// that will never come, and three of the five real failures on this funnel were
// one person retrying the same landline and getting nothing each time.
//
// A carrier lookup is the only way to know BEFORE spending the send, so it runs
// first and the answer decides whether to text or to offer a phone call.
//
// It fails OPEN in every failure mode. A lookup outage must never stop a real
// mobile number from getting its code — losing a lead to our own caution is the
// exact outcome this file exists to prevent.

const API = 'https://api.telnyx.com/v2'
const TIMEOUT_MS = 2500

/**
 * Line types Telnyx reports. Evidence from this funnel's own sends:
 *
 *   mobile      delivered
 *   voip        DELIVERED — Josue's Twilio number verified and booked
 *   fixed line  failed 40001 (x3, two different people)
 *   other       failed 40001
 *
 * VoIP is deliberately NOT treated as unreachable. A naive "landline or VoIP"
 * rule would have blocked the one lead on this funnel that actually converted.
 */
export type LineType = 'mobile' | 'voip' | 'fixed line' | 'other' | 'unknown'

const SMS_CAPABLE: LineType[] = ['mobile', 'voip', 'unknown']

export function canReceiveSms(type: LineType): boolean {
  return SMS_CAPABLE.includes(type)
}

/** Never throws. Returns 'unknown' on any error, which is treated as sendable. */
export async function lookupLineType(e164: string): Promise<LineType> {
  const key = process.env.TELNYX_API_KEY
  if (!key) return 'unknown'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}/number_lookup/${encodeURIComponent(e164)}?type=carrier`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn(`[line-type] lookup ${res.status} for ${e164}; treating as sendable`)
      return 'unknown'
    }
    const json = (await res.json()) as { data?: { carrier?: { type?: string } } }
    const raw = json.data?.carrier?.type?.toLowerCase().trim() ?? ''
    if (raw === 'mobile' || raw === 'voip' || raw === 'fixed line' || raw === 'other') return raw
    return 'unknown'
  } catch (err) {
    console.warn(`[line-type] lookup failed for ${e164}, treating as sendable:`, err)
    return 'unknown'
  } finally {
    clearTimeout(timer)
  }
}
