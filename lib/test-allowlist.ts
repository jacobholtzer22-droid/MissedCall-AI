// ===========================================
// NOTIFICATION TEST ALLOWLIST
// ===========================================
// Numbers listed in TEST_PHONE_ALLOWLIST bypass the send-once guards on the
// wizard funnel, so a full gate walk fires BOTH the lead SMS and the owner
// email every single time. Without it, walking the funnel twice from the same
// handset is silent the second time: the SMS is claimed once per lead forever
// and the owner alert has a six-hour cooldown. That is correct for real
// prospects and useless for testing.
//
// Read from the environment on EVERY call, not at module load, so the list can
// be retuned in Vercel without a code change. Vercel still binds env vars to a
// deployment, so a change there needs a redeploy to take effect — the
// per-request read makes the value swappable, it does not make it live.
//
// ⚠️ Anything on this list is texted on every walk with no dedupe of any kind.
// Put ONLY handsets you own here, never a customer number.

import { phonesMatch } from '@/lib/phone-utils'

/** Parsed allowlist. Empty when the var is unset, which disables the bypass. */
export function testPhoneAllowlist(): string[] {
  return (process.env.TEST_PHONE_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * Compared with phonesMatch (last ten digits) rather than string equality: the
 * env var is hand-typed and the funnel stores E.164, so "+1 517 580 9709" and
 * "+15175809709" must both match. Fails closed — an unset or empty var means no
 * number is ever treated as a test number.
 */
export function isTestPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  return testPhoneAllowlist().some((entry) => phonesMatch(entry, phone))
}
