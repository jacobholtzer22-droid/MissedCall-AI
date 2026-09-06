/**
 * Rescue the people the gate lost before it could rescue itself.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-gate-failures.ts
 *   npx tsx --env-file=.env.local scripts/backfill-gate-failures.ts --apply
 *
 * Four numbers hit a dead end at the phone screen since 2026-09-03 and left no
 * lead row at all: three landlines that failed Telnyx 40001, and one that got
 * its code and never verified. They gave a trade, a name and an email on the
 * way in and none of it was written down.
 *
 * Whatever the wizard captured is recovered from the PhoneVerification row and
 * from any FunnelEvent that shares its visitorId. Where a field was never
 * captured it stays blank rather than being invented — a wrong name on a cold
 * call is worse than no name.
 */

import { db } from '@/lib/db'
import { getMarketingBusiness, notifyOwnerOfMarketingEvent, findPartialLeadByPhone } from '@/lib/marketing-funnel'

const APPLY = process.argv.includes('--apply')
const SINCE = new Date('2026-09-03T00:00:00.000Z')

/** The four named in the brief. */
const TARGETS = ['+12145553624', '+12318441450', '+16783516978', '+15132452121']

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function main() {
  const business = await getMarketingBusiness()
  if (!business) throw new Error('no marketing business configured')

  let created = 0
  let skipped = 0

  for (const phone of TARGETS) {
    const rows = await db.phoneVerification.findMany({
      where: { phone, createdAt: { gte: SINCE } },
      orderBy: { createdAt: 'desc' },
    })
    if (rows.length === 0) {
      console.log(`${phone}  no verification row since 2026-09-03 — skipped`)
      skipped++
      continue
    }
    const latest = rows[0]

    const existing = await findPartialLeadByPhone(business.id, phone)
    if (existing) {
      console.log(`${phone}  already has lead ${existing.id} (${existing.status}) — skipped`)
      skipped++
      continue
    }

    // Reason from what actually happened to the row.
    const reason =
      latest.deliveryStatus === 'failed' || latest.deliveryError?.includes('40001')
        ? 'number cannot receive texts (Telnyx 40001)'
        : latest.attempts >= 3
        ? 'too many wrong codes'
        : 'code sent, never verified'

    // The wizard's own events, matched on the visitor that sent the code.
    const events = latest.visitorId
      ? await db.funnelEvent.findMany({
          where: { visitorId: latest.visitorId },
          orderBy: { createdAt: 'asc' },
          select: { name: true, step: true, metadata: true },
        })
      : []
    const screens = events
      .filter((e) => e.name === 'gate_step_completed')
      .map((e) => e.step)
      .filter(Boolean)

    const arm = latest.funnelVariant ?? null
    const message = [
      `GATE FAILED: ${reason}`,
      '',
      `Trade: not captured`,
      `First name: not captured`,
      `Email: not captured`,
      `Funnel arm: ${arm ?? 'unassigned'}`,
      `Line type: ${latest.lineType ?? 'not checked at the time'}`,
      `Attempts: ${latest.attempts}`,
      `Code sent: ${latest.createdAt.toISOString()}`,
      `Screens completed before the wall: ${screens.length ? screens.join(', ') : 'not recorded'}`,
      '',
      'Backfilled 2026-09-06. The wizard was not recording per-screen answers at',
      'the time, so only the number is certain. Worth a call: they asked for the',
      'demo and never got a code that worked.',
    ].join('\n')

    console.log(
      `${APPLY ? 'WRITE' : 'PLAN '} ${phone}  reason="${reason}"  arm=${arm ?? '-'}  ` +
        `lineType=${latest.lineType ?? '-'}  attempts=${latest.attempts}  screens=${screens.length}`
    )

    if (APPLY) {
      const lead = await db.websiteLead.create({
        data: {
          businessId: business.id,
          name: phone, // no captured name; the number is the identity
          phone,
          message,
          status: 'needs_call',
          variant: latest.variant,
          funnelVariant: arm,
        },
      })
      console.log(`         lead ${lead.id}`)

      await notifyOwnerOfMarketingEvent({
        ownerEmailFallback: business.ownerEmail,
        ownerPhoneFallback: business.ownerPhone,
        subject: `GATE FAILED (backfilled): ${reason} — call ${phone}`,
        smsText: `GATE FAILED: ${reason}. Call this one: ${phone}`,
        html: `
          <h2>Gate failed — call this one</h2>
          <p>Backfilled from ${escapeHtml(latest.createdAt.toISOString())}. This person never
             got a working code and was never written down at the time.</p>
          <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Line type:</strong> ${escapeHtml(latest.lineType ?? 'not checked at the time')}</p>
          <p><strong>Funnel arm:</strong> ${escapeHtml(arm ?? 'unassigned')}</p>
          <p><strong>Attempts:</strong> ${latest.attempts}</p>
        `,
      })
    }
    created++
  }

  console.log(`\n${JSON.stringify({ mode: APPLY ? 'APPLIED' : 'DRY RUN', created, skipped }, null, 1)}`)
}

main().finally(() => db.$disconnect())
