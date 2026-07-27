// Shared helpers for rendering email campaign bodies.
// Used by the compose preview (client) and the send route (server) so the
// preview matches what Resend actually delivers.

export function bodyContainsHtml(text: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(text)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Wraps plain-text email body in a div with white-space: pre-wrap so that
// newlines and runs of spaces survive the HTML render in email clients.
export function plainTextToEmailHtml(text: string): string {
  const escaped = escapeHtml(text)
  return `<div style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #111;">${escaped}</div>`
}

// ── Campaign personalization tokens ──────────────────────────────────
// Supported (case-insensitive): [first name], [last name], [full name], [name].
// [name] and [full name] insert the contact's full name; missing names fall
// back to "there" so "Hi [first name]," still reads naturally.

const PERSONALIZATION_TOKEN_RE = /\[(?:first ?name|last ?name|full ?name|name)\]/i

export const PERSONALIZATION_NAME_FALLBACK = 'there'

export function hasPersonalizationTokens(text: string): boolean {
  return PERSONALIZATION_TOKEN_RE.test(text)
}

/** Fix imported all-caps/all-lowercase names ("JOHN" / "john" → "John"); leave mixed case alone. */
function tidyNameCase(name: string): string {
  if (name === name.toLowerCase() || name === name.toUpperCase()) {
    return name
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ')
  }
  return name
}

export function personalizeText(
  text: string,
  contact: { name?: string | null },
  opts: { html?: boolean } = {}
): string {
  const fullName = tidyNameCase(contact.name?.trim() ?? '')
  const parts = fullName ? fullName.split(/\s+/) : []
  const firstName = parts[0] ?? ''
  const lastName = parts.slice(1).join(' ')
  // In HTML mode the token sits inside markup the author already controls, so
  // only the inserted value needs escaping. Plain-text bodies are escaped as a
  // whole later by plainTextToEmailHtml, so leave values raw there.
  const enc = (v: string) => (opts.html ? escapeHtml(v) : v)
  return text
    .replace(/\[first ?name\]/gi, enc(firstName || PERSONALIZATION_NAME_FALLBACK))
    .replace(/\[last ?name\]/gi, enc(lastName))
    .replace(/\[full ?name\]/gi, enc(fullName || PERSONALIZATION_NAME_FALLBACK))
    .replace(/\[name\]/gi, enc(fullName || PERSONALIZATION_NAME_FALLBACK))
}
