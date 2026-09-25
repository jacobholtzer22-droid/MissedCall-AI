// Render the demo-line inbound alert in all three states, through the real
// builder. Same discipline as scripts/preview-booker-messages.ts: nothing here
// re-implements the copy, so a change to the email shows up here immediately.
//
//   npx tsx scripts/preview-inbound-alert.ts
//
// Sends nothing and touches no database.

process.env.DATABASE_URL = ''
process.env.TELNYX_API_KEY = ''
process.env.RESEND_API_KEY = ''

import { inboundAlertHtml } from '../lib/marketing-reply'
import type { DemoThreadContext } from '../lib/marketing-thread-log'
import { formatDemoEt } from '../lib/marketing-thread-log'

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60_000)
// Fixed, so the sample's confirmation body and its "Their demo" line agree.
// 3:00 PM EDT on Thu Sep 26.
const demoAt = new Date('2026-09-26T19:00:00Z')

const parts = {
  who: 'Marcus / Delgado Concrete',
  from: '+15175551212',
  trade: 'Concrete',
  incoming: "Hey is that demo still on for tomorrow? Can I move it an hour later?",
}

const cases: { name: string; ctx: DemoThreadContext }[] = [
  {
    name: 'A. Logged body (the normal case from here on)',
    ctx: {
      lastOutbound: {
        body:
          "You're booked: Sat, Sep 26 at 3:00 PM EDT (your time). I'll call you then. " +
          'Need to move it? Text me here or call 517-580-9709.',
        sentAt: ago(190),
      },
      fallback: { kind: 'confirmation', label: 'booking confirmation', sentAt: ago(190) },
      demo: { scheduledAt: demoAt, whenEt: formatDemoEt(demoAt) },
    },
  },
  {
    name: 'B. Fallback (sent before this existed, or the row write failed)',
    ctx: {
      lastOutbound: null,
      fallback: { kind: 'follow_up', label: '24h follow-up', sentAt: ago(1500) },
      demo: null,
    },
  },
  {
    name: 'C. No outbound at all (they texted the line cold)',
    ctx: { lastOutbound: null, fallback: null, demo: null },
  },
]

for (const c of cases) {
  console.log('\n' + '='.repeat(72))
  console.log(c.name)
  console.log('='.repeat(72))
  console.log(inboundAlertHtml(c.ctx, parts).trim())
}
console.log()
