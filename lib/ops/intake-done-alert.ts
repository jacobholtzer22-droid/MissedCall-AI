// ===========================================
// Intake done: tell Jacob a client finished the intake
// ===========================================
// Fires from both doors, the portal wizard (PORTAL_INTAKE_WIZARD) and the
// signed link (CLIENT_INTAKE_LINK), once per Done that changed something: the
// finish routes call it only when they wrote the "Answers in" note, so a
// second press of Done with nothing new sends nothing.
//
// Owner-facing only: one text and one email through notifyOwnerOfMarketingEvent,
// the path every other owner alert uses (OWNER_PHONE / YOUR_EMAIL, else the
// marketing business's owner phone and email). It never throws to the route and
// the client's Done never waits on it (the routes hand it to waitUntil).

import { db } from '@/lib/db'
import { getMarketingBusiness, notifyOwnerOfMarketingEvent } from '@/lib/marketing-funnel'
import { intakeSummary, readIntake } from '@/lib/ops/intake'

export type IntakeDoneFacts = {
  displayName: string
  contactName: string | null
  via: 'portal' | 'link'
  /** What they bought, from Engagement.services. */
  services: string[]
  photos: number
  videos: number
  logo: boolean
  missing: string[]
  href: string | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** The text and the email. The text is GSM-7: straight quotes, no dashes, no emoji. */
export function intakeDoneAlertText(f: IntakeDoneFacts): { smsText: string; subject: string; html: string } {
  const who = f.contactName?.trim() || 'The client'
  const door = f.via === 'portal' ? 'sign-up' : 'link'
  const bought = f.services.length ? f.services.join(', ') : 'nothing recorded'
  const files = `${f.photos} photo${f.photos === 1 ? '' : 's'}${f.videos ? `, ${f.videos} video${f.videos === 1 ? '' : 's'}` : ''}, logo ${f.logo ? 'yes' : 'no'}`
  const gaps = f.missing.length ? `Still missing: ${f.missing.join(', ')}.` : 'Nothing missing: ready for a brief.'
  const smsText =
    `Intake done: ${who} finished the ${door} intake for ${f.displayName}. ` +
    `Bought: ${bought}. ${files}. ${gaps}` +
    (f.href ? ` ${f.href}` : '')
  const subject = `[Ops] Intake done: ${f.displayName} (${door})`
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">` +
    `<p><strong>${esc(who)}</strong> finished the ${door} intake for <strong>${esc(f.displayName)}</strong>.</p>` +
    `<ul>` +
    `<li>Bought: ${esc(bought)}</li>` +
    `<li>Files: ${esc(files)}</li>` +
    `<li>${esc(gaps)}</li>` +
    `</ul>` +
    `<p>Next: ${f.missing.length ? 'chase the missing pieces, then ask the chief to draft the brief.' : 'ask the chief to draft the brief (with autoflow on it drafts itself).'}</p>` +
    (f.href ? `<p><a href="${esc(f.href)}">Open the client in Ops</a></p>` : '') +
    `</div>`
  return { smsText, subject, html }
}

/** Read the client, build the alert, send it. Logs and swallows every failure. */
export async function sendIntakeDoneAlert(engagementId: string, via: 'portal' | 'link'): Promise<void> {
  try {
    const e = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { displayName: true, contactName: true, services: true, intake: true },
    })
    if (!e) return
    const s = intakeSummary(readIntake(e.intake))
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
    const text = intakeDoneAlertText({
      displayName: e.displayName,
      contactName: e.contactName,
      via,
      services: Array.isArray(e.services) ? (e.services as string[]) : [],
      photos: s.photos,
      videos: s.videos,
      logo: s.logo,
      missing: s.missing,
      href: base ? `${base}/admin/ops?tab=clients` : null,
    })
    const biz = await getMarketingBusiness()
    const r = await notifyOwnerOfMarketingEvent({
      subject: text.subject,
      html: text.html,
      smsText: text.smsText,
      ownerEmailFallback: biz?.ownerEmail ?? null,
      ownerPhoneFallback: biz?.ownerPhone ?? null,
    })
    console.log(`[intake-done] alert engagementId=${engagementId} via=${via} email=${r.email} sms=${r.sms}${r.smsError ? ` smsError=${r.smsError}` : ''}`)
  } catch (err) {
    console.error('[intake-done] alert failed:', err instanceof Error ? err.message : err)
  }
}
