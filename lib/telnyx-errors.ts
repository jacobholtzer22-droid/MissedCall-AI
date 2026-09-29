// ===========================================
// TELNYX ERROR CLASSIFICATION
// ===========================================
// Pure, dependency-free predicates over whatever the Telnyx SDK throws. Kept out
// of the webhook routes so they can be unit tested without a request, a database
// or an API key (`npm test`).

/**
 * Telnyx error code 90018, "Call has already ended", returned as a 422.
 *
 * Every call-control command races the caller hanging up: the webhook fires, we
 * decide what to do, and by the time the command reaches Telnyx the leg can be
 * gone. Telnyx rejects it. Nothing is broken, nothing is retryable, and there is
 * no action for anyone to take.
 */
export const TELNYX_CALL_ENDED_CODE = '90018'

/**
 * True when an error is Telnyx's "call has already ended".
 *
 * Matched structurally on the response body, which the SDK exposes at
 * `err.error` (`{ errors: [{ code: '90018' }] }`) — a raw `err.errors` and a
 * top-level `err.code` are accepted too, so a hand-rolled or re-thrown error is
 * still recognised. The message-substring check is a last-resort fallback:
 * `APIError.makeMessage` folds the JSON body into `Error.message`, producing
 * `422 {"errors":[{"code":"90018",...}]}`.
 *
 * Deliberately narrow. Any other Telnyx failure — including other 422s — must
 * return false and stay loud.
 */
export function isCallEndedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const e = err as {
    code?: unknown
    message?: unknown
    error?: { errors?: unknown }
    errors?: unknown
  }

  const codesFrom = (v: unknown): unknown[] =>
    Array.isArray(v) ? v.map((item) => (item && typeof item === 'object' ? (item as { code?: unknown }).code : undefined)) : []

  const codes: unknown[] = [e.code, ...codesFrom(e.errors), ...codesFrom(e.error?.errors)]
  if (codes.some((c) => c != null && String(c) === TELNYX_CALL_ENDED_CODE)) return true

  // Fallback only: a code that appears nowhere structured but is present in the
  // serialized body the SDK put in the message.
  return typeof e.message === 'string' && e.message.includes(TELNYX_CALL_ENDED_CODE)
}
