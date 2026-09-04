/**
 * Backfill first-touch attribution from stored landing paths.
 *
 *   npx tsx scripts/backfill-attribution.ts          # dry run, prints a plan
 *   npx tsx scripts/backfill-attribution.ts --apply  # writes
 *
 * Only fills rows whose attributionFirst is EMPTY. A captured touch is never
 * overwritten: the live capture sees the untruncated URL and the referrer,
 * both of which are strictly better than anything reconstructable here.
 *
 * ── Why some rows come out partial ──────────────────────────────────────────
 * The wizard stored `Landing path:` capped at 300 characters. A Meta fbclid on
 * its own runs past 250, so on 9 of the 14 tagged leads the query was sliced
 * mid-parameter and everything after the cut — usually utm_term, the AD name —
 * is simply gone. It is not recoverable from anywhere else: the appointment
 * notes never carried the URL and the arm ledger has no URL column. The cap is
 * raised to 1000 going forward, but that cannot repair rows already written.
 *
 * TERM_OVERRIDES exists for exactly that gap: values supplied by Jacob from
 * Meta Ads Manager for rows where the ad name was truncated away. They are
 * recorded here rather than typed straight into the database so the source of
 * every backfilled value stays visible.
 */

import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { buildTouch, buildFbc, sanitizeTouch, type AttributionTouch } from '@/lib/attribution'

const LANDING_LINE = /^Landing path: (.+)$/m
const APPLY = process.argv.includes('--apply')

/** phone -> utm_term, for rows whose ad name was lost to the 300-char cap. */
const TERM_OVERRIDES: Record<string, string> = {
  // Supplied by Jacob 2026-09-04. His stored path ends "&utm_id=…&u", cut
  // exactly where utm_term began.
  '+16127231555': 'aa_founder_tk2_v3_0903_vsl',
}

/**
 * Drop a trailing fragment left by the 300-char cut, so "…&u" or
 * "…&utm_term=aa_found" never lands in the database as if it were the value.
 * A final pair with no "=" is definitely a fragment; a final pair WITH one may
 * still be a truncated value, which is why the length check is on the whole
 * string, not the pair.
 */
function usableQuery(path: string, wasCapped: boolean): string {
  const q = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  if (!q) return ''
  const pairs = q.split('&')
  const last = pairs[pairs.length - 1]
  if (!last.includes('=')) pairs.pop()
  // The cut can also land inside a value, leaving a plausible-looking but wrong
  // final pair. On a capped row the last surviving pair is dropped too.
  else if (wasCapped) pairs.pop()
  return pairs.join('&')
}

function touchFrom(path: string, arm: string | null, at: Date, capped: boolean): AttributionTouch | null {
  const q = usableQuery(path, capped)
  if (!q) return null
  const touch = buildTouch({
    search: q,
    referrer: '', // never captured on these rows; "direct" is the honest value
    arm,
    path: path.split('?')[0],
    now: at,
  })
  const hasTag = touch.source || touch.medium || touch.campaign || touch.content || touch.term || touch.utmId || touch.fbclid
  return hasTag ? touch : null
}

async function main() {
  const business = await getMarketingBusiness()
  if (!business) throw new Error('no marketing business configured')

  const leads = await db.websiteLead.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, phone: true, message: true, funnelVariant: true,
      createdAt: true, attributionFirst: true, fbc: true, bookingSurface: true,
    },
  })

  let leadsFilled = 0, leadsSkippedHasTouch = 0, leadsNoTags = 0, fbcFilled = 0, overridesApplied = 0
  const phoneToTouch = new Map<string, AttributionTouch>()

  for (const lead of leads) {
    if (sanitizeTouch(lead.attributionFirst)) {
      leadsSkippedHasTouch++
      continue
    }
    const path = lead.message?.match(LANDING_LINE)?.[1]
    if (!path) {
      leadsNoTags++
      continue
    }
    // The message field held the path at exactly 300 chars when it was capped.
    const capped = path.length >= 300
    const touch = touchFrom(path, lead.funnelVariant, lead.createdAt, capped)
    if (!touch) {
      leadsNoTags++
      continue
    }
    const override = lead.phone ? TERM_OVERRIDES[lead.phone] : undefined
    if (override && !touch.term) {
      touch.term = override
      overridesApplied++
    }
    const fbc = lead.fbc ?? buildFbc(touch.fbclid, lead.createdAt.getTime())

    console.log(
      `${APPLY ? 'WRITE' : 'PLAN '} lead ${lead.name?.slice(0, 18).padEnd(18)} arm=${touch.arm ?? '-'} ` +
        `campaign=${touch.campaign ?? '-'} content=${touch.content ?? '-'} term=${touch.term ?? '-'}` +
        `${override ? ' (term from override)' : ''} fbclid=${touch.fbclid ? 'y' : 'n'}`
    )

    if (APPLY) {
      await db.websiteLead.update({
        where: { id: lead.id },
        data: { attributionFirst: touch, ...(fbc && !lead.fbc ? { fbc } : {}) },
      })
    }
    leadsFilled++
    if (fbc && !lead.fbc) fbcFilled++
    if (lead.phone) phoneToTouch.set(lead.phone, touch)
  }

  // Bookings carry no landing path of their own — the appointment notes never
  // stored one — so they inherit the lead's touch, matched on phone. That is
  // the same join the admin list uses.
  const appts = await db.appointment.findMany({
    where: { businessId: business.id },
    select: { id: true, customerPhone: true, customerName: true, attributionFirst: true, bookingSurface: true, source: true },
  })
  let apptsFilled = 0, apptsSkipped = 0, apptsNoLead = 0
  for (const a of appts) {
    if (sanitizeTouch(a.attributionFirst)) {
      apptsSkipped++
      continue
    }
    const touch = phoneToTouch.get(a.customerPhone)
    if (!touch) {
      apptsNoLead++
      continue
    }
    console.log(`${APPLY ? 'WRITE' : 'PLAN '} booking ${a.customerName?.slice(0, 18)} <- ${touch.campaign ?? touch.fbclid?.slice(0, 12)}`)
    if (APPLY) {
      await db.appointment.update({
        where: { id: a.id },
        data: {
          attributionFirst: touch,
          // 'website' is the funnel door; every booking that old came off the
          // watch page, since the landing calendar shipped today.
          ...(a.bookingSurface ? {} : { bookingSurface: a.source === 'website' ? 'watch' : 'calendar' }),
        },
      })
    }
    apptsFilled++
  }

  console.log('\n' + JSON.stringify({
    mode: APPLY ? 'APPLIED' : 'DRY RUN',
    leads: { total: leads.length, backfilled: leadsFilled, alreadyHadTouch: leadsSkippedHasTouch, noTagsInPath: leadsNoTags },
    fbcRebuiltFromFbclid: fbcFilled,
    termOverridesApplied: overridesApplied,
    bookings: { total: appts.length, backfilled: apptsFilled, alreadyHadTouch: apptsSkipped, noMatchingLead: apptsNoLead },
  }, null, 1))
}

main().finally(() => db.$disconnect())
