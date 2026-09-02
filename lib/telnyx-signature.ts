// ===========================================
// TELNYX WEBHOOK SIGNATURE VERIFICATION
// ===========================================
// Telnyx signs every webhook with Ed25519. The signature covers the string
// `${timestamp}|${rawBody}` — the RAW body, byte for byte. Re-serialising the
// parsed JSON changes key order and escaping and the signature will never
// match, so callers MUST pass the exact string they read off the request.
//
// ⚠️ SHIPPED IN LOG-ONLY MODE ON PURPOSE.
//
// These webhooks carry every inbound call and text on the platform. A
// verification bug here is not a failed request, it is every client's phone
// going dark at once — the same blast radius as the July 2026 outage. So the
// default is to verify, log the verdict, and let the request through.
//
// Turn on enforcement ONLY after the logs show `[telnyx-sig] valid` for real
// traffic on both webhooks, by setting TELNYX_WEBHOOK_ENFORCE=true. If
// TELNYX_PUBLIC_KEY is unset, enforcement stays off no matter what that flag
// says: a missing key must never take the platform down.

import { createPublicKey, verify as cryptoVerify } from 'crypto'

const TOLERANCE_SECONDS = 5 * 60

export type SignatureVerdict =
  | { ok: true; reason: 'valid' }
  | { ok: false; reason: 'no_public_key' | 'missing_headers' | 'stale_timestamp' | 'bad_signature' | 'error' }

/** Telnyx gives the key base64-raw; Node needs it wrapped as a DER SPKI. */
function ed25519KeyFromBase64(base64Key: string) {
  const raw = Buffer.from(base64Key, 'base64')
  if (raw.length !== 32) throw new Error(`expected a 32-byte Ed25519 key, got ${raw.length}`)
  // 12-byte SPKI prefix for Ed25519, then the raw key.
  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    raw,
  ])
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}

export function verifyTelnyxSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null
): SignatureVerdict {
  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim()
  if (!publicKey) return { ok: false, reason: 'no_public_key' }
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: 'missing_headers' }

  // Replay window. Telnyx retries legitimately, so this is generous.
  const ts = Number(timestampHeader)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' }
  }

  try {
    const key = ed25519KeyFromBase64(publicKey)
    const signed = Buffer.from(`${timestampHeader}|${rawBody}`, 'utf8')
    const signature = Buffer.from(signatureHeader, 'base64')
    // null algorithm: Ed25519 hashes internally.
    const ok = cryptoVerify(null, signed, key, signature)
    return ok ? { ok: true, reason: 'valid' } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/** True only when a key exists AND enforcement was explicitly switched on. */
export function signatureEnforced(): boolean {
  return Boolean(process.env.TELNYX_PUBLIC_KEY?.trim()) && process.env.TELNYX_WEBHOOK_ENFORCE === 'true'
}

/**
 * Verify, log, and decide. Returns true when the request should be REJECTED.
 * In log-only mode this is always false.
 */
export function shouldRejectTelnyxWebhook(
  label: string,
  rawBody: string,
  headers: Headers
): boolean {
  const verdict = verifyTelnyxSignature(
    rawBody,
    headers.get('telnyx-signature-ed25519'),
    headers.get('telnyx-timestamp')
  )
  const enforcing = signatureEnforced()
  if (verdict.ok) {
    console.log(`[telnyx-sig] ${label} valid enforcing=${enforcing}`)
    return false
  }
  console.warn(`[telnyx-sig] ${label} INVALID reason=${verdict.reason} enforcing=${enforcing}`)
  return enforcing && verdict.reason !== 'no_public_key'
}
