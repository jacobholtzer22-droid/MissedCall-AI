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
