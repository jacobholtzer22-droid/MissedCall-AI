// ===========================================
// OWNER ALERT SMS
// ===========================================
// The text Jacob reads on his phone when a lead verifies. Its whole job is to
// let him decide in about fifteen seconds whether the person is a contractor or
// an agency — which is why the company name and a Google search for it are the
// two things that must never be trimmed away.
//
// In lib/ rather than beside the route so the trim order is testable: a Next.js
// route file may only export handlers and config.

/** Hard cap. Two SMS segments of GSM-7 with room for the sender prefix. */
export const OWNER_SMS_MAX = 320

/**
 * The alert Jacob reads on his phone. Order matters when it has to be trimmed:
 * the whole point of this text is deciding in fifteen seconds whether a lead is
 * a contractor or an agency, so the company name and the Google search survive
 * and the dashboard link — which he can reach any time — is the first to go.
 */
export function buildOwnerSms(p: {
  name: string
  company: string
  trade: string
  tradeOther: string
  phone: string
  arm: string
  checkLink: string
  leadLink: string
}): string {
  const head = [
    `Call now: ${p.name}${p.company ? ` (${p.company})` : ''}`,
    `Trade: ${p.trade}${p.tradeOther ? ` — ${p.tradeOther}` : ''}`,
    p.phone,
    `Arm ${p.arm}`,
    p.checkLink ? `Check: ${p.checkLink}` : '',
  ].filter(Boolean)

  const withLead = [...head, p.leadLink].filter(Boolean).join('\n')
  if (withLead.length <= OWNER_SMS_MAX) return withLead

  // Drop the dashboard link, then the arm line. Never the company or the check.
  const withoutLead = head.join('\n')
  if (withoutLead.length <= OWNER_SMS_MAX) return withoutLead
  return head.filter((l) => !l.startsWith('Arm ')).join('\n').slice(0, OWNER_SMS_MAX)
}

