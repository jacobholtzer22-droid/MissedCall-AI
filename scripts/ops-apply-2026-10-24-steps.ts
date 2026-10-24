/**
 * Ops steps seed + standings — Oct 24 2026. One-off.
 *
 *   1. STEPS: sets each client's deliverable steps (lib/ops/steps.ts) with the
 *      waiting note, and clears the deliverable's manualStatus / note so the
 *      step shows (effectiveStatus puts manualStatus first). When the list gives
 *      no note, the old manualStatusNote is kept as the waiting note. A
 *      deliverable named here that the client lacks is created first, adding
 *      its service when needed.
 *   2. Premium Detailing / Shocos Pressure Cleaning: the father-and-son pair.
 *   3. Stripe search (read only) for the pair; links Shocos when exactly one
 *      unlinked customer fits.
 *   4. Michael Rudd: monthly, stage, notes, follow-up.
 *
 * Engagements are matched by displayName exactly as the board prints it
 * (trimmed; curly and straight apostrophes alike). Every write is skipped when
 * the value is already there, so re-running changes nothing.
 *
 * Needs scripts/sql/2026-10-24_add_deliverable_steps.sql applied for a live
 * run. --dry works before that: it reads the old Deliverable columns only and
 * treats every step as unset.
 *
 * Writes only Ops tables (Engagement, Deliverable, OpsActivity, plus what
 * ensureDeliverables / syncStripeForEngagement write). Stripe is read only.
 * Dates are America/Detroit.
 *
 * Usage:
 *   npx tsx scripts/ops-apply-2026-10-24-steps.ts --dry   # print every change, write nothing
 *   npx tsx scripts/ops-apply-2026-10-24-steps.ts         # apply
 *
 * Requires: DATABASE_URL, STRIPE_SECRET_KEY
 */

import * as dotenv from 'dotenv'
import { TZDate } from '@date-fns/tz'
import type Stripe from 'stripe'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/ops/stripe'
import { ensureDeliverables, syncStripeForEngagement } from '@/lib/ops/sync'
import { defaultWaitingOn, effectiveStatusOf, stepFor } from '@/lib/ops/steps'
import { DELIVERABLE_TYPES_FOR_SERVICE, SERVICE_KEYS, type DeliverableType, type ServiceKey } from '@/lib/ops/types'

// STRIPE_SECRET_KEY lives in .env.local; tsx does not load it. Read lazily by getStripe().
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const DRY = process.argv.includes('--dry')
const TZ = 'America/Detroit'
const TAG = '(Oct 24 standings)'

// ── The list: client | deliverable: step (note) ─────────────────────────────

type StepSpec = [step: string, note?: string]
const STEPS: { client: string; steps: Partial<Record<DeliverableType, StepSpec>> }[] = [
  {
    client: 'Alfa Industries LLC',
    steps: {
      website: ['approved'],
      domain: ['dns_by_client', 'John points DNS on a call once GBP exists'],
      gbp: ['create'],
      missedcall: ['live'],
    },
  },
  { client: 'Bernal Landscape Management, LLC', steps: { website: ['live'], missedcall: ['live'] } },
  { client: 'Aesthetic Gardener', steps: { website: ['live'], missedcall: ['live'] } },
  { client: 'Big Bear Truck Repair', steps: { website: ['live'], ads: ['running'] } },
  { client: "Brad's Lawn Services", steps: { website: ['approved'], domain: ['dns_records'], ads: ['running'] } },
  {
    client: 'CM Home Services LLC',
    steps: {
      website: ['live'],
      domain: ['owner_unknown', 'no domain bought yet; cmhomeservicesnj.com'],
      missedcall: ['forwarding', 'phone plan change, ~2 weeks'],
      ads: ['enable', '$300 first month'],
      gbp: ['verification', 'video must be recorded in-app by Cole'],
    },
  },
  {
    client: 'FlowState Home Solutions LLC',
    steps: { website: ['live'], domain: ['live'], ads: ['running', 'verify conversion tracking'] },
  },
  { client: 'Fraaza Enterprises Inc.', steps: { website: ['live'], missedcall: ['live'] } },
  { client: 'Fresh Cut Lawns LLC', steps: { website: ['live'] } },
  {
    client: 'Grizscapes LLC',
    steps: {
      missedcall: ['live'],
      website: ['approved'],
      domain: ['transfer_requested', 'owner transferring grizscapes.com to Jacob'],
    },
  },
  { client: 'Handmade Electric', steps: { website: ['live'] } },
  { client: 'J. Molina Landscaping', steps: { website: ['live'] } },
  {
    client: 'Jack of All Blades Landscaping',
    steps: { website: ['revisions', "add Mike's new photos"], ads: ['running'], missedcall: ['live'], gbp: ['live'] },
  },
  { client: 'Jaws Lawn and Snow', steps: { website: ['live'], ads: ['running'], email: ['workspace'] } },
  { client: 'Jaws Auto Detailing', steps: { website: ['live'], ads: ['running'] } },
  { client: 'Jaws Painting Co', steps: { website: ['live'] } },
  { client: 'Just Junk It', steps: { website: ['live'], ads: ['business_docs', 'LLC approval'] } },
  { client: 'LoneStar Services', steps: { website: ['live'] } },
  { client: 'Master Gardner', steps: { website: ['live'], missedcall: ['live'] } },
  { client: 'OC Water Pros', steps: { website: ['live'], ads: ['running'] } },
  { client: 'OnTheSpot Mobile Detailers', steps: { website: ['live'], gbp: ['live'] } },
  { client: 'Prestige Blinds', steps: { website: ['live'], domain: ['live'], ads: ['enable', '$500 first month'] } },
  { client: 'Rodas Premier Lawn & Snow Services', steps: { website: ['live'] } },
  { client: 'S&G Construction Inc.', steps: { website: ['live'], ads: ['paused_by_client'] } },
  { client: 'Southern Peach Junk Removal', steps: { website: ['live'], ads: ['running'] } },
  {
    client: 'T&M Construction Co',
    steps: { website: ['live'], missedcall: ['live'], ads: ['budget', 'budget exhausted, ask Terrell'] },
  },
  { client: '8th Ascent', steps: { website: ['build', 'DJ site rebuild'] } },
  { client: 'Kalights', steps: { website: ['live'], ads: ['running'] } },
  {
    client: 'Special Select Lawn Care',
    steps: {
      website: ['approved'],
      domain: ['transfer_requested', 'Otoniel went quiet during the transfer'],
      ads: ['site_live'],
    },
  },
  {
    client: 'Cowboy Spray Foam',
    steps: { website: ['revisions', 'slug branch unmerged, tweaks'], domain: ['dns_records'], ads: ['verification_docs'] },
  },
  { client: 'Houston Waste Removal', steps: { website: ['live'], domain: ['live'], email: ['live'], ads: ['running'] } },
  {
    client: 'Rays Renovation Projects',
    steps: { website: ['live', 'on vercel.app'], domain: ['owner_unknown'], ads: ['paused_by_client'] },
  },
  {
    client: 'Titan Home Exteriors',
    steps: { website: ['revisions', 'restyle; fix slug collision'], domain: ['transfer_requested'], ads: ['site_live'] },
  },
  { client: 'Shocos Pressure Cleaning', steps: { website: ['send_preview'], ads: ['campaign_build'], gbp: ['live'] } },
  {
    client: 'Oliveira Drywall Services',
    steps: { website: ['revisions', 'replace the End2End section'], domain: ['transfer_in_progress'] },
  },
  {
    client: 'Helper Property Pros',
    steps: { website: ['live'], missedcall: ['live'], ads: ['campaign_build', '$250 budget this month'] },
  },
]

const PAIR_NOTE = 'Father and son with %OTHER%; paid the upfront together; $200/mo each'
const PREMIUM = 'Premium Detailing'
const SHOCOS = 'Shocos Pressure Cleaning'
const PAIR_TERMS = ['premium', 'detailing', 'shocos', 'pressure', 'cleaning']
const RUDD = {
  match: 'Michael Rudd',
  monthly: 375,
  stage: 'onboarding',
  notes: '$375/mo, no upfront; the Oct 12 $375 was month one as a one-off charge; convert to a subscription',
  followUp: { at: '2026-10-27 09:00', text: 'Michael Rudd: what are we waiting on from him; create the subscription' },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const stats = { changes: 0, errors: [] as string[], cleared: [] as string[] }
const line = (s: string) => console.log(s)
const change = (s: string) => {
  stats.changes++
  console.log(`  ${DRY ? 'would ' : ''}${s}`)
}
const fail = (s: string) => {
  stats.errors.push(s)
  console.log(`  ERROR ${s}`)
}
const normName = (s: string) => s.trim().replace(/[‘’]/g, "'")

function detroit(at: string): Date {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
  if (!m) throw new Error(`bad date ${at}`)
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, TZ).getTime())
}

const SERVICE_FOR_TYPE = Object.fromEntries(
  Object.entries(DELIVERABLE_TYPES_FOR_SERVICE).flatMap(([svc, types]) => types.map((t) => [t, svc]))
) as Record<DeliverableType, ServiceKey>

type Del = {
  id: string
  type: string
  manualStatus: string | null
  manualStatusNote: string | null
  computedStatus: string
  step: string | null
  waitingOn: string | null
  waitingNote: string | null
}
type Eng = {
  id: string
  displayName: string
  services: Prisma.JsonValue
  stage: string
  notes: string | null
  monthlyAmount: number | null
  stripeCustomerId: string | null
  nextFollowUpAt: Date | null
  deliverables: Del[]
}

let stepColumns = false

/** Every engagement with the deliverable fields this script reads. */
async function loadEngagements(): Promise<Eng[]> {
  const rows = await db.engagement.findMany({
    select: {
      id: true,
      displayName: true,
      services: true,
      stage: true,
      notes: true,
      monthlyAmount: true,
      stripeCustomerId: true,
      nextFollowUpAt: true,
      deliverables: {
        select: {
          id: true,
          type: true,
          manualStatus: true,
          manualStatusNote: true,
          computedStatus: true,
          ...(stepColumns ? { step: true, waitingOn: true, waitingNote: true } : {}),
        },
      },
    },
  })
  return rows.map((r) => ({
    ...r,
    deliverables: r.deliverables.map((d) => ({
      step: null,
      waitingOn: null,
      waitingNote: null,
      ...(d as Partial<Del>),
      id: d.id,
      type: d.type,
      manualStatus: d.manualStatus,
      manualStatusNote: d.manualStatusNote,
      computedStatus: d.computedStatus,
    })),
  }))
}

function findOne(all: Eng[], name: string): Eng | null {
  const hits = all.filter((e) => normName(e.displayName) === normName(name))
  if (hits.length !== 1) {
    fail(`${name}: ${hits.length} engagements match`)
    return null
  }
  return hits[0]
}

const servicesOf = (e: Eng) => (Array.isArray(e.services) ? (e.services as string[]) : [])

// ── 1. Steps ────────────────────────────────────────────────────────────────

async function applySteps(all: Eng[]) {
  line('\n════ 1. Steps ════')
  for (const spec of STEPS) {
    line(`\n● ${spec.client}`)
    const eng = findOne(all, spec.client)
    if (!eng) continue

    // Validate the whole row first: a typo writes nothing for this client.
    const bad = Object.entries(spec.steps).filter(([type, [key]]) => !stepFor(type, key))
    if (bad.length > 0) {
      for (const [type, [key]] of bad) fail(`${spec.client}: "${key}" is not a ${type} step`)
      continue
    }

    // Missing deliverables: add the service, then create them.
    const needTypes = (Object.keys(spec.steps) as DeliverableType[]).filter((t) => !eng.deliverables.some((d) => d.type === t))
    if (needTypes.length > 0) {
      const services = SERVICE_KEYS.filter((k) => servicesOf(eng).includes(k) || needTypes.some((t) => SERVICE_FOR_TYPE[t] === k))
      const added = services.filter((k) => !servicesOf(eng).includes(k))
      if (added.length > 0) change(`services ${JSON.stringify(servicesOf(eng))} → ${JSON.stringify(services)}`)
      change(`create deliverables ${needTypes.join(', ')}`)
      if (!DRY) {
        if (added.length > 0) await db.engagement.update({ where: { id: eng.id }, data: { services } })
        await ensureDeliverables(eng.id, services)
        const fresh = await db.deliverable.findMany({
          where: { engagementId: eng.id },
          select: {
            id: true,
            type: true,
            manualStatus: true,
            manualStatusNote: true,
            computedStatus: true,
            step: true,
            waitingOn: true,
            waitingNote: true,
          },
        })
        eng.deliverables = fresh
        eng.services = services
      }
    }

    for (const [type, [key, note]] of Object.entries(spec.steps) as [DeliverableType, StepSpec][]) {
      const d = eng.deliverables.find((x) => x.type === type)
      // The list's note wins; with none, keep the manual note (or, on a re-run
      // once that has been cleared, the waiting note it became).
      const wantNote = note ?? d?.manualStatusNote ?? d?.waitingNote ?? null
      const wantWaiting = defaultWaitingOn(type, key)
      const hasManual = Boolean(d?.manualStatus || d?.manualStatusNote)
      if (d && d.step === key && d.waitingNote === wantNote && d.waitingOn === wantWaiting && !hasManual) continue
      const st = stepFor(type, key)!
      const shows = effectiveStatusOf({ type, manualStatus: null, computedStatus: d?.computedStatus ?? 'unknown', step: key })
      change(
        `${type}: step ${d?.step ?? '(none)'} → ${key} "${st.label}"` +
          `${wantNote ? ` (${wantNote}${!note && d?.manualStatusNote ? ', kept from the manual note' : ''})` : ''}` +
          `, waiting on ${wantWaiting ?? 'nobody'}, shows ${shows}` +
          (d ? '' : ' (on the deliverable created above)')
      )
      if (d && hasManual) {
        change(`${type}: clear manualStatus ${d.manualStatus ?? '(none)'}${d.manualStatusNote ? ` "${d.manualStatusNote}"` : ''}`)
        stats.cleared.push(`${spec.client} ${type}: ${d.manualStatus ?? '(none)'} → step ${key}, shows ${shows}`)
      }
      if (!DRY && d) {
        await db.deliverable.update({
          where: { id: d.id },
          data: {
            step: key,
            waitingOn: wantWaiting,
            waitingNote: wantNote,
            stepUpdatedAt: new Date(),
            manualStatus: null,
            manualStatusNote: null,
            manualStatusAt: null,
          },
        })
      } else if (!DRY) fail(`${spec.client}: no ${type} deliverable after create`)
    }
  }
}

// ── 2/3. Premium Detailing and Shocos ───────────────────────────────────────

async function applyPair(all: Eng[], stripe: Stripe) {
  line('\n════ 2. Premium Detailing / Shocos Pressure Cleaning ════')
  const premiumNote = PAIR_NOTE.replace('%OTHER%', SHOCOS)
  const shocosNote = PAIR_NOTE.replace('%OTHER%', PREMIUM)

  let premium = all.find((e) => normName(e.displayName) === normName(PREMIUM)) ?? null
  line(`\n● ${PREMIUM}`)
  if (!premium) {
    change(`create engagement "${PREMIUM}" source manual, services ["website"], stage paid_upfront, monthly 200, notes "${premiumNote}"`)
    change('create deliverables website, domain, email; website step build')
    if (!DRY) {
      const row = await db.engagement.create({
        data: {
          displayName: PREMIUM,
          source: 'manual',
          services: ['website'],
          stage: 'paid_upfront',
          monthlyAmount: 200,
          notes: premiumNote,
        },
      })
      await ensureDeliverables(row.id, ['website'])
      const web = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId: row.id, type: 'website' } } })
      if (web) {
        await db.deliverable.update({
          where: { id: web.id },
          data: { step: 'build', waitingOn: defaultWaitingOn('website', 'build'), waitingNote: null, stepUpdatedAt: new Date() },
        })
      }
      premium = (await loadEngagements()).find((e) => e.id === row.id) ?? null
    }
  } else {
    line('  exists')
    const web = premium.deliverables.find((d) => d.type === 'website')
    if (web && web.step !== 'build' && !web.step) {
      change('website step → build')
      if (!DRY) {
        await db.deliverable.update({
          where: { id: web.id },
          data: { step: 'build', waitingOn: 'jacob', stepUpdatedAt: new Date() },
        })
      }
    }
  }

  line(`\n● ${SHOCOS}`)
  const shocos = findOne(all, SHOCOS)
  if (shocos) {
    const data: Prisma.EngagementUncheckedUpdateInput = {}
    if (shocos.monthlyAmount !== 200) {
      data.monthlyAmount = 200
      change(`monthly ${shocos.monthlyAmount ?? '—'} → 200`)
    }
    if (!(shocos.notes ?? '').includes(shocosNote)) {
      data.notes = shocos.notes ? `${shocos.notes}\n${shocosNote}` : shocosNote
      change(`append to notes "${shocosNote}"`)
    }
    if (!DRY && Object.keys(data).length > 0) await db.engagement.update({ where: { id: shocos.id }, data })
  }

  // Stripe search, read only.
  line('\n════ 3. Stripe search for the pair (read only) ════')
  const customers = (await stripe.customers.list({ limit: 100 }).autoPagingToArray({ limit: 10000 })).filter(
    (c) => !(c as { deleted?: boolean }).deleted
  )
  const linked = new Map(all.filter((e) => e.stripeCustomerId).map((e) => [e.stripeCustomerId!, e.displayName]))
  const since = Math.floor(new TZDate(2026, 9, 15, 0, 0, 0, TZ).getTime() / 1000)
  const charges = await stripe.charges.list({ created: { gte: since }, limit: 100 }).autoPagingToArray({ limit: 5000 })
  const recentPayer = new Map<string, { at: number; cents: number }>()
  for (const ch of charges) {
    const id = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id
    if (!id || ch.status !== 'succeeded') continue
    const p = recentPayer.get(id) ?? { at: 0, cents: 0 }
    p.at = Math.max(p.at, ch.created)
    p.cents += ch.amount - ch.amount_refunded
    recentPayer.set(id, p)
  }
  const byTerm = customers.filter((c) => PAIR_TERMS.some((t) => `${c.name ?? ''} ${c.email ?? ''}`.toLowerCase().includes(t)))
  const recentUnlinked = customers.filter((c) => recentPayer.has(c.id) && !linked.has(c.id))
  const shown = new Map([...byTerm, ...recentUnlinked].map((c) => [c.id, c]))
  if (shown.size === 0) line('  no customer matches the terms, and every Oct 15+ payer is linked')
  for (const c of Array.from(shown.values())) {
    const why = [
      byTerm.includes(c) ? 'name/email matches' : null,
      recentPayer.has(c.id) ? `paid since Oct 15: $${(recentPayer.get(c.id)!.cents / 100).toFixed(2)}, last ${new Date(recentPayer.get(c.id)!.at * 1000).toLocaleDateString('en-US', { timeZone: TZ })}` : null,
    ].filter(Boolean)
    line(`  ${c.id}  ${c.name ?? '(no name)'}  ${c.email ?? '(no email)'}  [${why.join('; ')}]  linked: ${linked.get(c.id) ?? 'no'}`)
  }
  const fits = byTerm.filter((c) => !linked.has(c.id))
  if (fits.length === 1 && shocos) {
    const id = fits[0].id
    if (shocos.stripeCustomerId === id) line(`  ${SHOCOS} already linked to ${id}`)
    else if (shocos.stripeCustomerId) fail(`${SHOCOS} is linked to ${shocos.stripeCustomerId}, not replacing it with ${id}`)
    else {
      change(`link ${SHOCOS} → ${id}, then sync it`)
      const premiumIdNote = `Stripe customer ${id} is billed under ${SHOCOS}`
      if (premium && !(premium.notes ?? '').includes(premiumIdNote)) change(`append to ${PREMIUM} notes "${premiumIdNote}"`)
      if (!DRY) {
        await db.engagement.update({ where: { id: shocos.id }, data: { stripeCustomerId: id } })
        const r = await syncStripeForEngagement(shocos.id)
        line(r.ok ? `  stripe synced: ${r.subscriptionStatus}${r.promotedFrom ? `, promoted from ${r.promotedFrom}` : ''}` : `  ERROR stripe sync: ${r.reason}`)
        if (premium && !(premium.notes ?? '').includes(premiumIdNote)) {
          await db.engagement.update({
            where: { id: premium.id },
            data: { notes: premium.notes ? `${premium.notes}\n${premiumIdNote}` : premiumIdNote },
          })
        }
      }
    }
  } else {
    line(`  ${fits.length} unlinked customers fit the pair by name or email: no link made`)
  }
}

// ── 4. Michael Rudd ─────────────────────────────────────────────────────────

async function applyRudd(all: Eng[]) {
  line(`\n════ 4. ${RUDD.match} ════`)
  const eng = findOne(all, RUDD.match)
  if (!eng) return
  const data: Prisma.EngagementUncheckedUpdateInput = {}
  const at = detroit(RUDD.followUp.at)
  const activities: { kind: string; body: string; followUpAt?: Date }[] = []
  if (eng.monthlyAmount !== RUDD.monthly) {
    data.monthlyAmount = RUDD.monthly
    change(`monthly ${eng.monthlyAmount ?? '—'} → ${RUDD.monthly}`)
  }
  if (eng.stage !== RUDD.stage) {
    data.stage = RUDD.stage
    activities.push({ kind: 'status_change', body: `stage: ${eng.stage} -> ${RUDD.stage} ${TAG}` })
    change(`stage ${eng.stage} → ${RUDD.stage}`)
  }
  if (eng.notes !== RUDD.notes) {
    data.notes = RUDD.notes
    change(`notes → "${RUDD.notes}"`)
  }
  if (eng.nextFollowUpAt?.getTime() !== at.getTime()) {
    data.nextFollowUpAt = at
    change(`nextFollowUpAt → ${RUDD.followUp.at} ET`)
  }
  const exists = await db.opsActivity.findFirst({
    where: { engagementId: eng.id, kind: 'note', body: RUDD.followUp.text, followUpAt: at },
    select: { id: true },
  })
  if (!exists) {
    activities.push({ kind: 'note', body: RUDD.followUp.text, followUpAt: at })
    change(`activity note "${RUDD.followUp.text}"`)
  }
  if (!DRY && (Object.keys(data).length > 0 || activities.length > 0)) {
    await db.$transaction([
      ...(Object.keys(data).length > 0 ? [db.engagement.update({ where: { id: eng.id }, data })] : []),
      ...activities.map((a) =>
        db.opsActivity.create({ data: { engagementId: eng.id, kind: a.kind, body: a.body, followUpAt: a.followUpAt ?? null } })
      ),
    ])
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const stripe = getStripe()
  if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set')

  const cols = await db.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Deliverable' AND column_name IN ('step', 'waitingOn', 'waitingNote', 'stepUpdatedAt')`
  stepColumns = cols.length === 4
  line(`ops-apply-2026-10-24-steps ${DRY ? '--dry (no writes)' : 'LIVE'}`)
  line(`step columns in the database: ${stepColumns ? 'yes' : `NO (${cols.length}/4)`}`)
  if (!stepColumns) {
    if (!DRY) throw new Error('Apply scripts/sql/2026-10-24_add_deliverable_steps.sql first')
    line('  dry run without them: every current step is treated as unset')
  }

  await applySteps(await loadEngagements())
  await applyPair(await loadEngagements(), stripe)
  await applyRudd(await loadEngagements())

  line(`\n════ ${DRY ? 'Would make' : 'Made'} ${stats.changes} change${stats.changes === 1 ? '' : 's'}; ${stats.errors.length} error${stats.errors.length === 1 ? '' : 's'} ════`)
  for (const e of stats.errors) line(`  ${e}`)
  if (stats.cleared.length > 0) {
    line(`\n${stats.cleared.length} manual statuses ${DRY ? 'would be' : 'were'} cleared so the step shows:`)
    for (const c of stats.cleared) line(`  ${c}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
