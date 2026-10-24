/**
 * Ops standings apply — Oct 23 2026. One-off.
 *
 * Applies Jacob's hand-reviewed standings to the Ops tables, idempotently:
 *   1. STANDINGS: per client, rename / services / stage / Stripe link /
 *      deliverable manual statuses / evidence / notes / follow-up.
 *   2. FROM_STRIPE: new engagements for paying Stripe customers no client has.
 *   3. Stripe search (read only): the names Jacob asked about plus anyone who
 *      paid in the last 48 hours; paying and unlinked ones become engagements.
 *   4. Kalights: what November billing actually is (read only).
 *
 * Engagements are matched by displayName exactly as the board prints it
 * (trimmed; curly and straight apostrophes treated alike), or by the rename
 * target so a second run finds rows the first run renamed. Every write is
 * skipped when the value is already there, so re-running changes nothing.
 *
 * Writes only Ops tables: Engagement, Deliverable and OpsActivity directly, and
 * whatever syncStripeForEngagement / ensureDeliverables write (the same three).
 * Stripe is read only. Dates are America/Detroit.
 *
 * "email" in a services list is a deliverable, not a ServiceKey: the website
 * service already creates it, so it is dropped from services here.
 *
 * Usage:
 *   npx tsx scripts/ops-apply-2026-10-23.ts --dry   # print every change, write nothing
 *   npx tsx scripts/ops-apply-2026-10-23.ts         # apply
 *
 * Requires: DATABASE_URL, STRIPE_SECRET_KEY
 */

import * as dotenv from 'dotenv'
import { TZDate } from '@date-fns/tz'
import type Stripe from 'stripe'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
import { getStripe } from '@/lib/ops/stripe'
import { ensureDeliverables, subscriptionMonthly, syncStripeForEngagement } from '@/lib/ops/sync'
import { EVIDENCE_FIELDS_FOR_TYPE } from '@/lib/ops/evidence'
import {
  DELIVERABLE_TYPES_FOR_SERVICE,
  SERVICE_KEYS,
  type DeliverableStatus,
  type DeliverableType,
  type EngagementStage,
  type ServiceKey,
} from '@/lib/ops/types'

// STRIPE_SECRET_KEY lives in .env.local; tsx does not load it. Read lazily by getStripe().
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const DRY = process.argv.includes('--dry')
const TZ = 'America/Detroit'
const TAG = '(Oct 23 standings)'

// ── The list ────────────────────────────────────────────────────────────────

type DelSpec = { status: DeliverableStatus; note: string } | 'clear'

type Standing = {
  match: string
  rename?: string
  services?: ServiceKey[]
  stage?: EngagementStage
  stripe?: string
  dels?: Partial<Record<DeliverableType, DelSpec>>
  evidence?: Record<string, string>
  notes?: string
  followUp?: { at: string; text: string }
}

const ALFA_WAIT = 'Waiting on John: create GBP, then connect his domain'
const FU = '2026-10-27 09:00'

const STANDINGS: Standing[] = [
  { match: 'Aesthetic Gardener', services: ['website', 'missedcall'], stage: 'active' },
  {
    match: 'Alfa Industries LLC',
    services: ['website', 'missedcall', 'gbp'],
    stage: 'active',
    dels: {
      website: { status: 'blocked', note: ALFA_WAIT },
      domain: { status: 'blocked', note: ALFA_WAIT },
      gbp: { status: 'not_started', note: 'Client to create GBP and add Jacob as manager' },
    },
    followUp: { at: FU, text: 'Check in with John Baez: GBP created? ready to connect domain?' },
  },
  { match: 'Bernal Landscape Management, LLC', services: ['website', 'missedcall'], stage: 'active' },
  { match: 'Big Bear Truck Repair', services: ['website', 'ads'], stage: 'active' },
  {
    match: 'BLS',
    rename: "Brad's Lawn Services",
    services: ['website', 'ads'],
    stage: 'active',
    stripe: 'cus_UIcavjLf2LHy4q',
    dels: { domain: { status: 'blocked', note: 'Site built, domain not connected yet' } },
    evidence: { domain: 'bradslawnservices.com' },
  },
  {
    match: 'CM Home Services LLC',
    services: ['website', 'missedcall', 'ads', 'gbp'],
    stage: 'active',
    dels: {
      missedcall: { status: 'blocked', note: 'Waiting on Cole to change phone plan (~2 weeks) before conditional forwarding' },
      ads: { status: 'not_started', note: 'Campaign built paused. $300 first month. Jacob to enable' },
      gbp: { status: 'in_progress', note: 'Video verification pending (Cole must record in-app)' },
    },
    followUp: { at: '2026-11-06 09:00', text: 'Cole: phone plan changed? Missed call go-live' },
  },
  {
    match: 'FlowState Home Solutions LLC',
    services: ['website', 'ads'],
    stage: 'active',
    dels: { ads: { status: 'in_progress', note: 'Weak results so far; verify conversion tracking is firing' } },
    followUp: { at: FU, text: 'Jason: check conversion tracking on the handyman campaign' },
  },
  { match: 'Fraaza Enterprises Inc.', services: ['website', 'missedcall'], stage: 'active' },
  { match: 'Fresh Cut Lawns LLC', services: ['website'], stage: 'active' },
  {
    match: 'Grizscapes LLC',
    services: ['missedcall', 'website'],
    stage: 'active',
    dels: { domain: { status: 'blocked', note: 'Site not connected to grizscapes.com yet' } },
    notes: '10DLC brand and campaign approved',
  },
  { match: 'Handmade Electric', services: ['website'], stage: 'active' },
  { match: 'J. Molina Landscaping', services: ['website'], stage: 'active', notes: 'Wants MissedCall AI later' },
  {
    match: 'Jack of all Blades Landscaping',
    rename: 'Jack of All Blades Landscaping',
    services: ['website', 'ads', 'missedcall', 'gbp'],
    stage: 'active',
    followUp: { at: FU, text: "Add Mike's new photos to the site" },
  },
  {
    match: 'Jaws Lawn and Snow',
    services: ['website', 'ads', 'email'] as ServiceKey[],
    stage: 'active',
    stripe: 'cus_Ui8pAWPOpdBlAU',
    dels: { email: { status: 'not_started', note: 'Connect business emails for Joey' } },
    notes: "Joey's one subscription covers Jaws Lawn and Snow, Jaws Auto Detailing and Jaws Painting Co. No missed call.",
  },
  { match: 'Jaws Auto Detailing', services: ['website', 'ads'], stage: 'active', notes: 'Billed under Jaws Lawn and Snow (Joey)' },
  { match: 'Jaws Painting Co', services: ['website'], stage: 'active', notes: 'Billed under Jaws Lawn and Snow (Joey)' },
  {
    match: 'Just junk it',
    rename: 'Just Junk It',
    services: ['website', 'ads'],
    stage: 'active',
    dels: { ads: { status: 'blocked', note: "Waiting on Trystan's LLC approval before ads go live" } },
  },
  {
    match: 'LoneStar Services',
    services: ['website'],
    stage: 'active',
    notes: 'Website with SEO and AI integration only; no ads or GBP management',
  },
  {
    match: 'Master Gardner',
    services: ['website', 'missedcall'],
    stage: 'active',
    notes: 'Spam call screener turned off by client; missed call only',
  },
  { match: 'OC Water Pros', services: ['website', 'ads'], stage: 'active' },
  { match: 'OnTheSpot Mobile Detailers', services: ['website', 'gbp'], stage: 'active', notes: 'GBP management included' },
  {
    match: 'Prestige Blinds',
    services: ['website', 'ads'],
    stage: 'active',
    dels: { ads: { status: 'not_started', note: 'Campaign built paused. $500 first month. Jacob to enable' } },
    followUp: { at: FU, text: "Turn on Ronny's ads" },
  },
  {
    match: 'Rodas Premier Lawn & Snow Services',
    services: ['website'],
    stage: 'active',
    followUp: { at: FU, text: 'Check in with Clay about running ads' },
  },
  {
    match: 'S&G Construction Inc.',
    services: ['website', 'ads'],
    stage: 'active',
    dels: { ads: { status: 'paused', note: "Paused at Ramiro's request" } },
    notes: 'Confirm: ads paused or live?',
  },
  {
    match: 'Southern peach junk removal',
    rename: 'Southern Peach Junk Removal',
    services: ['website', 'ads'],
    stage: 'active',
    followUp: { at: FU, text: 'Check Southern Peach ads performance' },
  },
  {
    match: 'T&M Construction Co',
    services: ['website', 'missedcall', 'ads'],
    stage: 'active',
    dels: { ads: { status: 'paused', note: 'Budget exhausted; check results with Terrell' } },
    followUp: { at: FU, text: 'Terrell: ads results, more budget?' },
  },
  {
    match: '8th Ascent AV',
    rename: '8th Ascent',
    services: ['website'],
    stage: 'paid_upfront',
    notes: '$165/mo website-only subscription to start',
    followUp: { at: FU, text: "Start Malcolm's $165 subscription" },
  },
  { match: 'Kalights', services: ['website', 'ads'], stage: 'paid_upfront', notes: 'Billing scheduled in Stripe for November' },
  {
    match: 'Special select lawn care LLC',
    rename: 'Special Select Lawn Care',
    services: ['website', 'ads'],
    stage: 'paid_upfront',
    dels: { domain: { status: 'blocked', note: 'Otoniel got frustrated during the domain transfer and went quiet' } },
    followUp: { at: FU, text: 'Check in with Otoniel; ready to start subscription' },
  },
  {
    match: 'CowboySprayFoam',
    rename: 'Cowboy Spray Foam',
    services: ['website', 'ads'],
    stage: 'paid_upfront',
    stripe: 'cus_VTdwQCmGGekTEk',
    dels: { ads: { status: 'not_started', note: 'Upload advertiser verification doc, then build the DFW campaign' } },
    evidence: { domain: 'cowboysprayfoam.com' },
  },
  {
    match: 'Houston Waste Removal',
    services: ['website', 'ads', 'email'] as ServiceKey[],
    stage: 'active',
    stripe: 'cus_VM6LlCsSGm0DId',
    followUp: { at: FU, text: "Check Earl's ads performance" },
  },
  {
    match: 'Rays renovation projects',
    rename: 'Rays Renovation Projects',
    services: ['website', 'ads'],
    stage: 'active',
    stripe: 'cus_VPAqostnDwPV64',
    dels: { ads: { status: 'paused', note: "Paused at Ray's request" } },
  },
  {
    match: 'Titan Home Exteriors',
    services: ['website', 'ads'],
    stage: 'active',
    stripe: 'cus_VPsMGEhh7l6O0f',
    dels: {
      domain: { status: 'blocked', note: 'Domain transfer pending (titanhomeexteriorsllc.com)' },
      ads: { status: 'not_started', note: 'Run ads after domain is live' },
    },
  },
  {
    match: "Chico's presure Cleanig",
    rename: 'Shocos Pressure Cleaning',
    services: ['website', 'ads', 'gbp'],
    stage: 'paid_upfront',
    dels: {
      website: { status: 'in_progress', note: 'Built; send to client for review' },
      ads: { status: 'not_started', note: 'Build and run after site sign-off' },
    },
    followUp: { at: FU, text: 'Send Shocos his site; ads; start subscription' },
  },
  {
    match: 'Oliveira Drywall Services',
    services: ['website'],
    stage: 'paid_upfront',
    dels: { domain: { status: 'in_progress', note: 'oliveiradrywall.com transferring to Jacob' } },
    notes: 'Subscription starts Oct 24',
  },
  { match: 'Hail Recovery Team', stage: 'churned', notes: 'Lost client (Oct 2026)' },
  {
    match: 'Evergreen construction llc',
    rename: 'Evergreen Construction',
    stage: 'churned',
    stripe: 'cus_VL1gKStyrqozT1',
    notes: 'Lost client; paid half',
  },
  {
    match: 'Helper Outdoor Services',
    rename: 'Helper Property Pros',
    services: ['website', 'missedcall', 'ads'],
    stage: 'paused',
    notes:
      'Was $250/mo with missed call; paused Oct 16 (free month). Running ads this month, $250 budget. Goal: $350/mo from December',
    followUp: { at: '2026-11-24 09:00', text: 'Josue: December renewal at $350' },
  },
  { match: 'MK2 Auto Spa', stage: 'churned', notes: 'Left Oct 2026' },
]

const IDENTIFY = 'Identify: who is this and what did they buy'

/** New engagements from Stripe customers. displayName = Stripe customer name unless renamed. */
const FROM_STRIPE: { customerId: string; rename?: string; notes?: string }[] = [
  { customerId: 'cus_VTFOEziMYvmoNX' }, // Enio, $250 upfront
  { customerId: 'cus_VQd7oZrv4lwj2E' }, // Michael Rudd, $375/mo no upfront
  { customerId: 'cus_V3mqR4v7HZq8jh', rename: 'Crews Local Services' }, // Brandon Crew
  { customerId: 'cus_VR5uCCBe93YzCq', notes: IDENTIFY }, // Daniel
  { customerId: 'cus_V5ybAbIUN3qrEF', notes: IDENTIFY }, // Better 2 Enterprises
  { customerId: 'cus_VJqx6Z4yG5HAef', notes: IDENTIFY }, // Michael Morrison
]

const SEARCH_TERMS = ['Andres', 'Dale', 'Brian', 'Bryan', 'Luke', 'Brem', 'Sergiy', 'Korelov', 'Premium Detailing']
const KALIGHTS_CUSTOMER = 'cus_VENpbVxS7h8zs3'

// ── Helpers ─────────────────────────────────────────────────────────────────

const LIVE: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due', 'unpaid']
const stats = { changes: 0, errors: [] as string[] }
/**
 * Stripe customers section 1 links. A dry run writes nothing, so without this
 * section 3 would see them as unlinked and plan a duplicate engagement.
 */
const linkedInSection1 = new Map<string, string>()
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

/** "2026-10-27 09:00" in America/Detroit. */
function detroit(at: string): Date {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
  if (!m) throw new Error(`bad date ${at}`)
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, TZ).getTime())
}

const dateStr = (sec: number | null | undefined) =>
  sec ? new Date(sec * 1000).toLocaleString('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '—'
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

const EVIDENCE_TYPE_FOR_KEY: Record<string, DeliverableType> = Object.fromEntries(
  Object.entries(EVIDENCE_FIELDS_FOR_TYPE).flatMap(([type, keys]) => keys.map((k) => [k, type as DeliverableType]))
)

const orderServices = (s: ServiceKey[]) => SERVICE_KEYS.filter((k) => s.includes(k))
const sameList = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && b.every((x) => (a as string[]).includes(x))

type EngRow = Prisma.EngagementGetPayload<{ include: { deliverables: true } }>

async function loadEngagements(): Promise<EngRow[]> {
  return db.engagement.findMany({ include: { deliverables: true } })
}

// ── 1. Standings ────────────────────────────────────────────────────────────

async function applyStanding(spec: Standing, all: EngRow[]) {
  const want = normName(spec.match)
  const renamed = spec.rename ? normName(spec.rename) : null
  const hits = all.filter((e) => normName(e.displayName) === want || (renamed && normName(e.displayName) === renamed))
  line(`\n● ${spec.match}${spec.rename ? ` → ${spec.rename}` : ''}`)
  if (hits.length !== 1) {
    fail(`${spec.match}: ${hits.length} engagements match`)
    return
  }
  let eng = hits[0]
  const data: Prisma.EngagementUncheckedUpdateInput = {}
  const activities: { kind: string; body: string; followUpAt?: Date }[] = []

  if (spec.rename && eng.displayName !== spec.rename) {
    data.displayName = spec.rename
    change(`rename "${eng.displayName}" → "${spec.rename}"`)
  }
  const services = spec.services ? orderServices(spec.services) : null
  if (services && !sameList(eng.services, services)) {
    data.services = services
    change(`services ${JSON.stringify(eng.services)} → ${JSON.stringify(services)}`)
  }
  // The list never undoes the sync's promotion rule: a row it moved to 'active'
  // on an active Stripe subscription stays active (the next sync would only
  // promote it again).
  const promotedBySync =
    spec.stage !== undefined &&
    ['prospect', 'paid_upfront', 'onboarding'].includes(spec.stage) &&
    eng.stage === 'active' &&
    eng.stripeSubscriptionStatus === 'active'
  if (promotedBySync) line(`  keep stage active, not ${spec.stage}: Stripe subscription is active (promotion rule)`)
  if (spec.stage && eng.stage !== spec.stage && !promotedBySync) {
    data.stage = spec.stage
    activities.push({ kind: 'status_change', body: `stage: ${eng.stage} -> ${spec.stage} ${TAG}` })
    change(`stage ${eng.stage} → ${spec.stage}`)
  }
  if (spec.notes !== undefined && eng.notes !== spec.notes) {
    data.notes = spec.notes
    change(`notes ${eng.notes ? `"${eng.notes}"` : '(empty)'} → "${spec.notes}"`)
  }
  let linkStripe = false
  if (spec.stripe && eng.stripeCustomerId !== spec.stripe) {
    const owner = all.find((e) => e.stripeCustomerId === spec.stripe && e.id !== eng.id)
    if (owner) {
      fail(`${spec.match}: ${spec.stripe} is already linked to ${owner.displayName}`)
    } else {
      data.stripeCustomerId = spec.stripe
      linkStripe = true
      linkedInSection1.set(spec.stripe, spec.rename ?? spec.match)
      change(`stripe ${eng.stripeCustomerId ?? '(none)'} → ${spec.stripe}, then sync it`)
    }
  }
  if (spec.followUp) {
    const at = detroit(spec.followUp.at)
    if (eng.nextFollowUpAt?.getTime() !== at.getTime()) {
      data.nextFollowUpAt = at
      change(`nextFollowUpAt ${eng.nextFollowUpAt?.toISOString() ?? '(none)'} → ${spec.followUp.at} ET`)
    }
    const exists = await db.opsActivity.findFirst({
      where: { engagementId: eng.id, kind: 'note', body: spec.followUp.text, followUpAt: at },
      select: { id: true },
    })
    if (!exists) {
      activities.push({ kind: 'note', body: spec.followUp.text, followUpAt: at })
      change(`activity note "${spec.followUp.text}"`)
    }
  }

  if (!DRY && (Object.keys(data).length > 0 || activities.length > 0)) {
    await db.$transaction([
      ...(Object.keys(data).length > 0 ? [db.engagement.update({ where: { id: eng.id }, data })] : []),
      ...activities.map((a) =>
        db.opsActivity.create({ data: { engagementId: eng.id, kind: a.kind, body: a.body, followUpAt: a.followUpAt ?? null } })
      ),
    ])
  }

  // Deliverables for the (new) services: create only.
  if (services) {
    const have = new Set(eng.deliverables.map((d) => d.type))
    const missing = Array.from(new Set(services.flatMap((s) => DELIVERABLE_TYPES_FOR_SERVICE[s]))).filter((t) => !have.has(t))
    if (missing.length > 0) {
      change(`create deliverables ${missing.join(', ')}`)
      if (!DRY) await ensureDeliverables(eng.id, services)
    }
  }
  if (linkStripe && !DRY) {
    const r = await syncStripeForEngagement(eng.id)
    if (r.ok) {
      line(`  stripe synced: ${r.subscriptionStatus}${r.promotedFrom ? `, promoted from ${r.promotedFrom}` : ''}${r.warnings.length ? `, warnings: ${r.warnings.join('; ')}` : ''}`)
    } else fail(`${spec.match}: stripe sync: ${r.reason}`)
  }
  if (!DRY) eng = (await db.engagement.findUnique({ where: { id: eng.id }, include: { deliverables: true } }))!

  // Deliverable overrides.
  for (const [type, d] of Object.entries(spec.dels ?? {}) as [DeliverableType, DelSpec][]) {
    const del = eng.deliverables.find((x) => x.type === type)
    if (!del) {
      if (DRY) change(`${type}: manual ${d === 'clear' ? 'clear' : `${d.status} "${d.note}"`} (on the deliverable created above)`)
      else fail(`${spec.match}: no ${type} deliverable`)
      continue
    }
    const nextStatus = d === 'clear' ? null : d.status
    const nextNote = d === 'clear' ? null : d.note
    if (del.manualStatus === nextStatus && del.manualStatusNote === nextNote) continue
    change(`${type}: manual ${del.manualStatus ?? 'none'} → ${nextStatus ?? 'none'}${nextNote ? ` "${nextNote}"` : ''}`)
    if (!DRY) {
      await db.deliverable.update({
        where: { id: del.id },
        data: { manualStatus: nextStatus, manualStatusNote: nextNote, manualStatusAt: nextStatus ? new Date() : null },
      })
    }
  }

  // Evidence, merged key by key into the deliverable that owns the key.
  for (const [key, value] of Object.entries(spec.evidence ?? {})) {
    const type = EVIDENCE_TYPE_FOR_KEY[key]
    if (!type) {
      fail(`${spec.match}: unknown evidence key ${key}`)
      continue
    }
    const del = eng.deliverables.find((x) => x.type === type)
    if (!del) {
      if (DRY) change(`${type}.evidence.${key} = ${value} (on the deliverable created above)`)
      else fail(`${spec.match}: no ${type} deliverable for evidence ${key}`)
      continue
    }
    const ev = del.evidence && typeof del.evidence === 'object' && !Array.isArray(del.evidence) ? (del.evidence as Record<string, unknown>) : {}
    if (ev[key] === value) continue
    change(`${type}.evidence.${key} ${ev[key] ?? '(none)'} → ${value}`)
    if (!DRY) await db.deliverable.update({ where: { id: del.id }, data: { evidence: { ...ev, [key]: value } as Prisma.InputJsonObject } })
  }
}

// ── 2/3. Engagements from Stripe ────────────────────────────────────────────

async function createFromStripe(
  stripe: Stripe,
  customerId: string,
  opts: { rename?: string; notes?: string; why: string },
  all: EngRow[]
) {
  const existing = all.find((e) => e.stripeCustomerId === customerId)
  const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer
  const name = opts.rename ?? (customer.name?.trim() || customer.email?.trim() || customerId)
  line(`\n● ${customerId} (${customer.name ?? customer.email ?? '?'}) — ${opts.why}`)
  if ((customer as { deleted?: boolean }).deleted) return fail(`${customerId} is deleted in Stripe`)

  if (existing) {
    const data: Prisma.EngagementUncheckedUpdateInput = {}
    if (opts.rename && existing.displayName !== opts.rename) {
      data.displayName = opts.rename
      change(`rename "${existing.displayName}" → "${opts.rename}"`)
    }
    if (opts.notes !== undefined && existing.notes !== opts.notes) {
      data.notes = opts.notes
      change(`notes → "${opts.notes}"`)
    }
    if (Object.keys(data).length === 0) line(`  already linked to "${existing.displayName}", nothing to do`)
    else if (!DRY) await db.engagement.update({ where: { id: existing.id }, data })
    return
  }

  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 })
  const stage: EngagementStage = subs.data.length > 0 ? 'active' : 'paid_upfront'
  change(`create engagement "${name}" source stripe, stage ${stage}${opts.notes ? `, notes "${opts.notes}"` : ''}, then sync it`)
  if (DRY) return
  const row = await db.engagement.create({
    data: {
      displayName: name,
      email: customer.email?.trim() || null,
      phone: normalizeToE164(customer.phone) || null,
      source: 'stripe',
      stage,
      services: [],
      notes: opts.notes ?? null,
      stripeCustomerId: customerId,
    },
    include: { deliverables: true },
  })
  all.push(row)
  const r = await syncStripeForEngagement(row.id)
  if (r.ok) line(`  stripe synced: ${r.subscriptionStatus}${r.warnings.length ? `, warnings: ${r.warnings.join('; ')}` : ''}`)
  else fail(`${customerId}: stripe sync: ${r.reason}`)
}

type CustomerFacts = {
  customer: Stripe.Customer
  subs: { id: string; status: string; monthly: number; notes: string[] }[]
  lastPaymentAt: number | null
  paidCents: number
}

async function customerFacts(stripe: Stripe, customer: Stripe.Customer): Promise<CustomerFacts> {
  const [subs, charges, invoices] = await Promise.all([
    stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.charges.list({ customer: customer.id, limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.invoices.list({ customer: customer.id, status: 'paid', limit: 100 }).autoPagingToArray({ limit: 1000 }),
  ])
  const ok = charges.filter((c) => c.status === 'succeeded' && c.amount - c.amount_refunded > 0)
  const times = [...ok.map((c) => c.created), ...invoices.map((i) => i.status_transitions.paid_at ?? i.created)]
  return {
    customer,
    subs: subs.map((s) => ({ id: s.id, status: s.status, ...subscriptionMonthly(s) })),
    lastPaymentAt: times.length ? Math.max(...times) : null,
    paidCents: ok.reduce((n, c) => n + c.amount - c.amount_refunded, 0),
  }
}

function printFacts(f: CustomerFacts, linkedTo: string | null) {
  const c = f.customer
  line(`  ${c.id}  ${c.name ?? '(no name)'}  ${c.email ?? '(no email)'}`)
  line(`    linked: ${linkedTo ?? 'no'} · last payment ${dateStr(f.lastPaymentAt)} · charges net ${usd(f.paidCents)}`)
  if (f.subs.length === 0) line('    subscriptions: none')
  for (const s of f.subs) line(`    sub ${s.id} ${s.status} $${s.monthly}/mo${s.notes.length ? ` (${s.notes.join('; ')})` : ''}`)
}

// ── 4. Kalights ─────────────────────────────────────────────────────────────

async function inspectKalights(stripe: Stripe, customers: Stripe.Customer[]) {
  line('\n════ Kalights / Will: November billing ════')
  const targets = customers.filter(
    (c) => c.id === KALIGHTS_CUSTOMER || /\bwill\b/i.test(c.name ?? '') || (c.email ?? '').toLowerCase().includes('kalights')
  )
  if (!targets.some((c) => c.id === KALIGHTS_CUSTOMER)) line(`  ${KALIGHTS_CUSTOMER} not in the customer list`)
  for (const c of targets) {
    line(`\n  ${c.id}  ${c.name ?? '(no name)'}  ${c.email ?? ''}`)
    const [subs, invoices] = await Promise.all([
      stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 100 }).autoPagingToArray({ limit: 100 }),
      stripe.invoices.list({ customer: c.id, limit: 100 }).autoPagingToArray({ limit: 100 }),
    ])
    let schedules: Stripe.SubscriptionSchedule[] = []
    try {
      schedules = await stripe.subscriptionSchedules
        .list({ customer: c.id, limit: 100, expand: ['data.phases.items.price'] })
        .autoPagingToArray({ limit: 100 })
    } catch (err) {
      line(`    schedules: could not read (${err instanceof Error ? err.message : String(err)})`)
    }
    line(`    subscriptions: ${subs.length ? '' : 'none'}`)
    for (const s of subs) {
      const m = subscriptionMonthly(s)
      line(`      ${s.id} ${s.status} start ${dateStr(s.start_date)} $${m.monthly}/mo${s.cancel_at ? ` cancel_at ${dateStr(s.cancel_at)}` : ''}`)
    }
    line(`    subscription schedules: ${schedules.length ? '' : 'none'}`)
    for (const sc of schedules) {
      line(`      ${sc.id} ${sc.status} end_behavior ${sc.end_behavior}`)
      for (const ph of sc.phases) {
        const items = ph.items.map((it) => {
          const p = it.price as Stripe.Price | string
          return typeof p === 'string' ? p : `${usd(p.unit_amount ?? 0)}/${p.recurring?.interval ?? 'once'} x${it.quantity ?? 1}`
        })
        line(`        phase ${dateStr(ph.start_date)} → ${dateStr(ph.end_date)}: ${items.join(', ')}`)
      }
    }
    const pending = invoices.filter((i) => i.status === 'draft' || i.status === 'open')
    line(`    draft/open invoices: ${pending.length ? '' : 'none'}`)
    for (const i of pending) {
      line(
        `      ${i.id} ${i.status} total ${usd(i.total)} due ${dateStr(i.due_date)} auto-finalizes ${dateStr(i.automatically_finalizes_at)}` +
          ` ${i.parent?.subscription_details ? 'subscription' : 'one-off'}: ${i.lines.data.map((l) => l.description).filter(Boolean).join('; ')}`
      )
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const stripe = getStripe()
  if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set')
  line(`ops-apply-2026-10-23 ${DRY ? '--dry (no writes)' : 'LIVE'}`)

  let all = await loadEngagements()
  line('\n════ 1. Standings ════')
  for (const spec of STANDINGS) await applyStanding(spec, all)

  all = await loadEngagements()
  line('\n════ 2. New engagements from Stripe ════')
  for (const f of FROM_STRIPE) await createFromStripe(stripe, f.customerId, { ...f, why: 'from the list' }, all)

  // 3. Search (read only), then create the paying and unlinked ones.
  line('\n════ 3. Stripe search ════')
  const customers = (await stripe.customers.list({ limit: 100 }).autoPagingToArray({ limit: 10000 })).filter(
    (c) => !(c as { deleted?: boolean }).deleted
  )
  const since48 = Math.floor(Date.now() / 1000) - 48 * 3600
  const [recentCharges, recentInvoices] = await Promise.all([
    stripe.charges.list({ created: { gte: since48 }, limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.invoices.list({ status: 'paid', created: { gte: since48 - 30 * 86400 }, limit: 100 }).autoPagingToArray({ limit: 1000 }),
  ])
  const recentIds = new Set(
    [
      ...recentCharges.filter((c) => c.status === 'succeeded').map((c) => c.customer),
      ...recentInvoices.filter((i) => (i.status_transitions.paid_at ?? 0) >= since48).map((i) => i.customer),
    ]
      .map((c) => (typeof c === 'string' ? c : c?.id))
      .filter((c): c is string => Boolean(c))
  )
  const byTerm = new Map<string, string[]>()
  for (const c of customers) {
    const hay = `${c.name ?? ''} ${c.email ?? ''}`.toLowerCase()
    const terms = SEARCH_TERMS.filter((t) => hay.includes(t.toLowerCase()))
    if (recentIds.has(c.id)) terms.push('paid in last 48h')
    if (terms.length) byTerm.set(c.id, terms)
  }
  const plannedFromList = new Set(FROM_STRIPE.map((f) => f.customerId))
  const toCreate: string[] = []
  if (byTerm.size === 0) line('  no customer matches the terms or paid in the last 48 hours')
  for (const [id, terms] of Array.from(byTerm)) {
    const c = customers.find((x) => x.id === id)!
    const facts = await customerFacts(stripe, c)
    const linkedRow = all.find((e) => e.stripeCustomerId === id)
    const linkedLabel = linkedRow
      ? `"${linkedRow.displayName}"`
      : linkedInSection1.has(id)
      ? `"${linkedInSection1.get(id)}" (linked in section 1)`
      : plannedFromList.has(id)
      ? '(created in section 2)'
      : null
    const linked = linkedLabel !== null
    line(`\n  [${terms.join(', ')}]`)
    printFacts(facts, linkedLabel)
    const paying = facts.subs.some((s) => LIVE.includes(s.status as Stripe.Subscription.Status)) || facts.paidCents > 0
    if (!linked) {
      if (paying) toCreate.push(id)
      else line('    not paying: no engagement')
    }
  }
  for (const id of toCreate) await createFromStripe(stripe, id, { why: 'search: paying and unlinked' }, all)

  await inspectKalights(stripe, customers)

  line(`\n════ ${DRY ? 'Would make' : 'Made'} ${stats.changes} change${stats.changes === 1 ? '' : 's'}; ${stats.errors.length} error${stats.errors.length === 1 ? '' : 's'} ════`)
  for (const e of stats.errors) line(`  ${e}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
