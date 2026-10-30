// ===========================================
// /admin/ops — sync
// ===========================================
// Keeps the Ops tables current from data that already exists. Phases, in order:
//
//   a. Engagement per won PipelinePerson          (source 'pipeline_won')
//   b. Engagement per Business row, linking first (source 'business_row')
//   c. Deliverables for each engagement's services, plus sync-owned evidence
//   d. Stripe: customer match, subscription, upfront payments (READ ONLY)
//   e. Database-only OpsChecks
//   f. Deliverable.computedStatus from its checks
//
// Writes ONLY Engagement, Deliverable, OpsCheck and, for a promotion, one
// OpsActivity status_change row. Every other table is read.
// After an Engagement exists the sync touches only its sync-owned fields
// (SYNC_OWNED_FIELDS); everything else on the row is edited by hand.
//
// Idempotent: Engagement is upserted on businessId / pipelinePersonId,
// Deliverable on (engagementId, type), OpsCheck on (deliverableId, key), and an
// upsert's update branch never rewrites hand-edited fields.
//
// dryRun works on an in-memory copy of the rows: every phase runs and the
// summary is the same, but nothing is written. Rows a dry run would create get
// "dry:" ids so later phases can still see them.

import type Stripe from 'stripe'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { normalizeToE164 } from '@/lib/phone-utils'
import { getStripe } from '@/lib/ops/stripe'
import { cleanInbox } from '@/lib/ops/photo-filing-server'
import {
  DELIVERABLE_TYPES_FOR_SERVICE,
  SERVICE_KEYS,
  isInformationalCheck,
  type DeliverableStatus,
  type DeliverableType,
  type EngagementSource,
  type EngagementStage,
  type OpsCheckKey,
  type ServiceKey,
} from '@/lib/ops/types'

/** The only Engagement fields the sync may change on a row that already exists. */
export const SYNC_OWNED_FIELDS = [
  'businessId', // linking only, never unlinking
  'stripeCustomerId',
  'stripeSubscriptionId',
  'stripeSubscriptionStatus',
  'upfrontPaidAt',
  'upfrontAmount',
  'monthlyAmount',
  'monthlyStartedAt',
  'stripeSyncedAt',
] as const

const DAY_MS = 24 * 60 * 60 * 1000
const UNPAID_LOOKBACK_DAYS = 120
const NO_ACCOUNT = 'no platform account linked'

/**
 * Test or junk rows: created with stage 'ignored' instead of the computed
 * stage. Applied at creation only, compared on the trimmed display name, so a
 * row renamed later is never re-ignored and an ignored row can be revived by
 * hand.
 */
export const IGNORE_ON_CREATE = [
  'Test Business',
  'fisrtcomesfunction',
  'Smith Insurance',
  'BomaCrumbs',
  'Terrell Kempfer',
  'ApplyNex',
] as const
const isIgnoredOnCreate = (name: string) => (IGNORE_ON_CREATE as readonly string[]).includes(name.trim())
const SUB_PRIORITY: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due', 'unpaid', 'canceled']

// ── Summary ─────────────────────────────────────────────────────────────────

type EngRef = { engagementId: string; displayName: string }

export interface OpsSyncSummary {
  dryRun: boolean
  startedAt: string
  durationMs: number
  notes: string[]
  engagementsCreated: (EngRef & {
    source: EngagementSource
    /** Final stage, after the post-Stripe finalization. */
    stage: EngagementStage
    /** The stage set at insert, when finalization changed it. */
    stageAtInsert?: EngagementStage
    services: ServiceKey[]
    businessId: string | null
    pipelinePersonId: string | null
  })[]
  createdBySource: Record<string, number>
  links: (EngRef & {
    businessId: string
    businessName: string
    matchedOn: string[]
    /** Set when a same-run link renamed the engagement to Business.name. */
    previousDisplayName?: string
    /** Set when a same-run link filled empty services from the Business row. */
    servicesInferred?: ServiceKey[]
  })[]
  ambiguities: {
    businessId: string
    businessName: string
    reason: string
    candidates: EngRef[]
  }[]
  deliverablesCreated: (EngRef & { type: DeliverableType })[]
  evidenceUpdated: (EngRef & { type: DeliverableType; keys: string[] })[]
  stripe: {
    skipped: boolean
    customersLoaded: number
    matched: (EngRef & { customerId: string; matchedOn: 'email' | 'phone' })[]
    unmatched: (EngRef & { reason: string })[]
    synced: (EngRef & {
      customerId: string
      subscriptionId: string | null
      subscriptionStatus: string
      monthlyAmount: number | null
      monthlyStartedAt: string | null
      upfrontAmount: number | null
      upfrontPaidAt: string | null
      /** Where monthlyAmount came from this run; 'none' = Stripe had nothing, the stored value stands. */
      amountSource: 'subscriptions' | 'schedule' | 'invoice' | 'none'
      /** Every subscription on the customer with its monthly amount. */
      subscriptions: SubscriptionAmount[]
    })[]
    unmatchedPayingCustomers: {
      customerId: string
      name: string | null
      email: string | null
      lastPaymentAt: string
      total: number
    }[]
    errors: string[]
  }
  /** Engagements moved to 'active' because Stripe shows an active subscription. */
  promotions: (EngRef & { from: string })[]
  checksWritten: number
  checkTally: Record<string, { passed: number; failed: number; couldNotRun: number }>
  deliverableStatusChanges: (EngRef & { type: DeliverableType; from: string; to: DeliverableStatus })[]
}

// ── In-memory rows ──────────────────────────────────────────────────────────

type Eng = {
  id: string
  businessId: string | null
  pipelinePersonId: string | null
  displayName: string
  email: string | null
  phone: string | null
  stage: string
  services: ServiceKey[]
  createdAt: Date
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeSubscriptionStatus: string | null
  upfrontPaidAt: Date | null
  upfrontAmount: number | null
  monthlyAmount: number | null
  monthlyStartedAt: Date | null
  /** Inserted by this run: the only rows whose stage, name and services the sync may still settle. */
  createdThisRun: boolean
}

type Del = {
  id: string
  engagementId: string
  type: DeliverableType
  computedStatus: string
  evidence: Record<string, unknown>
}

type CheckResult = { key: OpsCheckKey; passed: boolean | null; detail: string | null }

// ── Helpers ─────────────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{6,14}$/

/** E.164 or null. Uses the repo's lenient normalizer, which returns '' for junk. */
function phoneKey(raw: string | null | undefined): string | null {
  return normalizeToE164(raw) || null
}

function emailKey(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase()
  return e || null
}

function noteLine(notes: string | null | undefined, label: string): string | null {
  const m = notes?.match(new RegExp(`^${label}: (.+)$`, 'm'))
  return m?.[1]?.trim() || null
}

function asServices(v: Prisma.JsonValue): ServiceKey[] {
  if (!Array.isArray(v)) return []
  return v.filter((s): s is ServiceKey => typeof s === 'string' && (SERVICE_KEYS as readonly string[]).includes(s))
}

function asObject(v: Prisma.JsonValue): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  !v ? null : typeof v === 'string' ? v : v.id

/**
 * Run `fn` over `items`, at most `limit` at a time. Stripe calls are the bulk
 * of the sync's time, and one at a time does not fit the cron's 60s.
 */
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const STRIPE_CONCURRENCY = 5
/** Matches Prisma's default pool on a small lambda; more would only queue. */
const DB_CONCURRENCY = 5

const fromUnix = (s: number | null | undefined): Date | null => (s ? new Date(s * 1000) : null)
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)
const dollars = (cents: number) => Math.round(cents) / 100

const STAGE_FOR_SUBSCRIPTION: Record<string, EngagementStage> = {
  active: 'active',
  past_due: 'active',
  canceled: 'churned',
  trialing: 'onboarding',
}

type ServiceSource = {
  telnyxPhoneNumber: string | null
  googleAdsCustomerId: string | null
  googleAdsEnabled: boolean
  id: string
}

/** Services a Business row implies. Used once, when an engagement gets its services. */
function inferServices(b: ServiceSource, hasWebsiteLead: Set<string>): ServiceKey[] {
  const services: ServiceKey[] = []
  if (b.telnyxPhoneNumber) services.push('missedcall')
  if (b.googleAdsCustomerId || b.googleAdsEnabled) services.push('ads')
  if (hasWebsiteLead.has(b.id)) services.push('website')
  return services
}

/** Stages an active Stripe subscription promotes to 'active'. Never the reverse. */
const PROMOTABLE_STAGES = ['prospect', 'paid_upfront', 'onboarding']

/**
 * Promotion only: an active Stripe subscription moves prospect / paid_upfront /
 * onboarding to 'active' and logs it. Nothing ever demotes automatically; a
 * canceled subscription on an active client stays a red alert for Jacob.
 * Returns the old stage when it promoted, else null.
 */
async function promoteIfActive(eng: Eng, dryRun: boolean): Promise<string | null> {
  if (eng.stripeSubscriptionStatus !== 'active' || !PROMOTABLE_STAGES.includes(eng.stage)) return null
  const from = eng.stage
  if (!dryRun && !eng.id.startsWith('dry:')) {
    await db.$transaction([
      db.engagement.update({ where: { id: eng.id }, data: { stage: 'active' } }),
      db.opsActivity.create({
        data: { engagementId: eng.id, kind: 'status_change', body: `stage: ${from} -> active (Stripe subscription active)` },
      }),
    ])
  }
  eng.stage = 'active'
  return from
}

/**
 * Stage for an engagement inserted this run, from what the Stripe phase
 * learned. null = Stripe found nothing decisive, keep the insert stage.
 */
function stageFromStripe(e: Pick<Eng, 'stripeSubscriptionStatus' | 'upfrontPaidAt'>): EngagementStage | null {
  const s = e.stripeSubscriptionStatus
  if (s === 'active' || s === 'trialing' || s === 'past_due') return 'active'
  if (s === 'canceled') return 'churned'
  if (s === 'none' && e.upfrontPaidAt) return 'paid_upfront'
  return null
}

/** Per the rules in CLAUDE.md §21: no rows unknown, all pass live, all fail not_started. */
export function deriveDeliverableStatus(results: { key?: string; passed: boolean | null }[]): DeliverableStatus {
  const ran = results.filter((r) => r.passed !== null && !isInformationalCheck(r.key))
  if (ran.length === 0) return 'unknown'
  if (ran.every((r) => r.passed)) return 'live'
  if (ran.every((r) => !r.passed)) return 'not_started'
  return 'in_progress'
}

type EngagementRow = Prisma.EngagementGetPayload<Record<string, never>>

/** A pre-existing row as the sync's in-memory engagement. */
function toEng(e: EngagementRow): Eng {
  return {
    id: e.id,
    businessId: e.businessId,
    pipelinePersonId: e.pipelinePersonId,
    displayName: e.displayName,
    email: e.email,
    phone: e.phone,
    stage: e.stage,
    services: asServices(e.services),
    createdAt: e.createdAt,
    stripeCustomerId: e.stripeCustomerId,
    stripeSubscriptionId: e.stripeSubscriptionId,
    stripeSubscriptionStatus: e.stripeSubscriptionStatus,
    upfrontPaidAt: e.upfrontPaidAt,
    upfrontAmount: e.upfrontAmount,
    monthlyAmount: e.monthlyAmount,
    monthlyStartedAt: e.monthlyStartedAt,
    createdThisRun: false,
  }
}

// ── Sync ────────────────────────────────────────────────────────────────────

export async function runOpsSync({ dryRun }: { dryRun: boolean }): Promise<OpsSyncSummary> {
  const started = Date.now()
  const now = new Date(started)
  const summary: OpsSyncSummary = {
    dryRun,
    startedAt: now.toISOString(),
    durationMs: 0,
    notes: [],
    engagementsCreated: [],
    createdBySource: {},
    links: [],
    ambiguities: [],
    deliverablesCreated: [],
    evidenceUpdated: [],
    stripe: {
      skipped: false,
      customersLoaded: 0,
      matched: [],
      unmatched: [],
      synced: [],
      unmatchedPayingCustomers: [],
      errors: [],
    },
    promotions: [],
    checksWritten: 0,
    checkTally: {},
    deliverableStatusChanges: [],
  }
  let dryIds = 0
  const nextDryId = () => `dry:${++dryIds}`
  const ref = (e: Eng): EngRef => ({ engagementId: e.id, displayName: e.displayName })

  const marketing = await getMarketingBusiness()
  if (!marketing) summary.notes.push('No marketing business configured: no Business row is excluded from phase b.')

  const existing = await db.engagement.findMany({ include: { deliverables: { include: { checks: true } } } })
  const engs: Eng[] = existing.map(toEng)
  const createdEntries = new Map<string, OpsSyncSummary['engagementsCreated'][number]>()
  const dels: Del[] = existing.flatMap((e) =>
    e.deliverables.map((d) => ({
      id: d.id,
      engagementId: d.engagementId,
      type: d.type as DeliverableType,
      computedStatus: d.computedStatus,
      evidence: asObject(d.evidence),
    }))
  )
  // Existing check rows, so status derivation sees checks this run did not write,
  // and so an unchanged result can skip its upsert (keyed `${deliverableId}|${key}`).
  const checksByDel = new Map<string, Map<string, boolean | null>>()
  const existingChecks = new Map<string, { id: string; passed: boolean | null; detail: string | null }>()
  for (const e of existing) {
    for (const d of e.deliverables) {
      checksByDel.set(d.id, new Map(d.checks.map((c) => [c.key, c.passed])))
      for (const c of d.checks) existingChecks.set(`${d.id}|${c.key}`, { id: c.id, passed: c.passed, detail: c.detail })
    }
  }

  async function createEngagement(data: Prisma.EngagementUncheckedCreateInput, source: EngagementSource): Promise<Eng> {
    if (isIgnoredOnCreate(data.displayName)) data = { ...data, stage: 'ignored' }
    let id = nextDryId()
    if (!dryRun) {
      // update: {} — if a concurrent run already created it, change nothing.
      const row = data.pipelinePersonId
        ? await db.engagement.upsert({ where: { pipelinePersonId: data.pipelinePersonId }, create: data, update: {} })
        : await db.engagement.upsert({ where: { businessId: data.businessId as string }, create: data, update: {} })
      id = row.id
    }
    const eng: Eng = {
      id,
      businessId: data.businessId ?? null,
      pipelinePersonId: data.pipelinePersonId ?? null,
      displayName: data.displayName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      stage: data.stage ?? 'prospect',
      services: (data.services as ServiceKey[] | undefined) ?? [],
      createdAt: now,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      upfrontPaidAt: null,
      upfrontAmount: data.upfrontAmount ?? null,
      monthlyAmount: data.monthlyAmount ?? null,
      monthlyStartedAt: null,
      createdThisRun: true,
    }
    engs.push(eng)
    const entry = {
      ...ref(eng),
      source,
      stage: eng.stage as EngagementStage,
      services: eng.services,
      businessId: eng.businessId,
      pipelinePersonId: eng.pipelinePersonId,
    }
    createdEntries.set(eng.id, entry)
    summary.engagementsCreated.push(entry)
    summary.createdBySource[source] = (summary.createdBySource[source] ?? 0) + 1
    return eng
  }

  // ── a. Backfill from pipeline ───────────────────────────────────────────
  const wonPeople = await db.pipelinePerson.findMany({ where: { status: 'won', engagement: { is: null } } })
  for (const person of wonPeople) {
    const leadId = person.personKey.startsWith('lead:') ? person.personKey.slice(5) : null
    const [lead, appt] = await Promise.all([
      db.websiteLead.findFirst({
        where: {
          businessId: person.businessId,
          status: { not: 'spam' },
          ...(leadId ? { id: leadId } : { phone: person.personKey }),
        },
        orderBy: { createdAt: 'desc' },
      }),
      leadId
        ? null
        : db.appointment.findFirst({
            where: { businessId: person.businessId, customerPhone: person.personKey },
            orderBy: { createdAt: 'desc' },
          }),
    ])

    const displayName =
      lead?.businessName?.trim() ||
      noteLine(appt?.notes, 'Company') ||
      lead?.name?.trim() ||
      appt?.customerName?.trim() ||
      person.personKey
    await createEngagement(
      {
        pipelinePersonId: person.id,
        displayName,
        contactName: lead?.name?.trim() || appt?.customerName?.trim() || null,
        email: lead?.email || appt?.customerEmail || null,
        phone: E164.test(person.personKey) ? person.personKey : null,
        trade: lead?.tradeOther?.trim() || noteLine(appt?.notes, 'Trade'),
        source: 'pipeline_won',
        stage: 'paid_upfront',
        services: [],
        upfrontAmount: person.setupFee,
        monthlyAmount: person.mrr,
      },
      'pipeline_won'
    )
  }

  // ── b. Backfill from Business rows ──────────────────────────────────────
  const allBusinesses = await db.business.findMany({
    select: {
      id: true,
      name: true,
      ownerEmail: true,
      ownerPhone: true,
      forwardingNumber: true,
      businessType: true,
      subscriptionStatus: true,
      telnyxPhoneNumber: true,
      googleAdsCustomerId: true,
      googleAdsEnabled: true,
      setupFee: true,
      monthlyFee: true,
    },
  })
  const businessById = new Map(allBusinesses.map((b) => [b.id, b]))
  const leadCounts = await db.websiteLead.groupBy({ by: ['businessId'], _count: true })
  const hasWebsiteLead = new Set(leadCounts.filter((r) => r._count > 0).map((r) => r.businessId))

  const unlinkedBusinesses = allBusinesses.filter(
    (b) => b.id !== marketing?.id && !engs.some((e) => e.businessId === b.id)
  )

  // Decide every business's candidates before linking anything, so one
  // engagement matched by two businesses is an ambiguity, not first-come.
  const matchesFor = (b: (typeof allBusinesses)[number]) => {
    const phones = new Set([phoneKey(b.ownerPhone), phoneKey(b.forwardingNumber)].filter(Boolean))
    const email = emailKey(b.ownerEmail)
    return engs
      .filter((e) => !e.businessId)
      .map((e) => {
        const on: string[] = []
        const p = phoneKey(e.phone)
        if (p && phones.has(p)) on.push('phone')
        if (email && emailKey(e.email) === email) on.push('email')
        return { eng: e, on }
      })
      .filter((m) => m.on.length > 0)
  }
  const plan = unlinkedBusinesses.map((b) => ({ b, matches: matchesFor(b) }))
  const claims = new Map<string, number>()
  for (const { matches } of plan) {
    for (const m of matches) claims.set(m.eng.id, (claims.get(m.eng.id) ?? 0) + 1)
  }

  for (const { b, matches } of plan) {
    if (matches.length > 1) {
      summary.ambiguities.push({
        businessId: b.id,
        businessName: b.name,
        reason: 'several unlinked engagements match this business',
        candidates: matches.map((m) => ref(m.eng)),
      })
      continue
    }
    if (matches.length === 1) {
      const { eng, on } = matches[0]
      if ((claims.get(eng.id) ?? 0) > 1) {
        summary.ambiguities.push({
          businessId: b.id,
          businessName: b.name,
          reason: 'the matching engagement also matches another business',
          candidates: [ref(eng)],
        })
        continue
      }
      // An engagement inserted by this run takes the platform's name, and its
      // services if it has none yet. A pre-existing row only gains businessId:
      // its name and services may already be hand-edited.
      const link: OpsSyncSummary['links'][number] = { ...ref(eng), businessId: b.id, businessName: b.name, matchedOn: on }
      const data: Prisma.EngagementUncheckedUpdateManyInput = { businessId: b.id }
      if (eng.createdThisRun) {
        if (eng.displayName !== b.name) {
          link.previousDisplayName = eng.displayName
          data.displayName = b.name
          eng.displayName = b.name
        }
        if (eng.services.length === 0) {
          const inferred = inferServices(b, hasWebsiteLead)
          if (inferred.length > 0) {
            link.servicesInferred = inferred
            data.services = inferred
            eng.services = inferred
          }
        }
        const entry = createdEntries.get(eng.id)
        if (entry) Object.assign(entry, { displayName: eng.displayName, services: eng.services, businessId: b.id })
      }
      if (!dryRun) {
        // Conditional so it can only ever link, never repoint a linked row.
        await db.engagement.updateMany({ where: { id: eng.id, businessId: null }, data })
      }
      eng.businessId = b.id
      link.displayName = eng.displayName
      summary.links.push(link)
      continue
    }

    const services = inferServices(b, hasWebsiteLead)
    const stage = STAGE_FOR_SUBSCRIPTION[b.subscriptionStatus]
    if (!stage) summary.notes.push(`${b.name}: unknown subscriptionStatus "${b.subscriptionStatus}", stage set to onboarding.`)
    await createEngagement(
      {
        businessId: b.id,
        displayName: b.name,
        email: b.ownerEmail,
        phone: b.ownerPhone || b.forwardingNumber || null,
        trade: b.businessType,
        source: 'business_row',
        stage: stage ?? 'onboarding',
        services,
        upfrontAmount: b.setupFee,
        monthlyAmount: b.monthlyFee,
      },
      'business_row'
    )
  }

  // ── c. Deliverables ─────────────────────────────────────────────────────
  // Planned first, written DB_CONCURRENCY at a time after the loop. A new
  // deliverable gets its real id from its upsert before phase e needs it.
  const newDels: Del[] = []
  const toInsert: Del[] = []
  const evidenceWrites: (() => Promise<unknown>)[] = []
  for (const eng of engs) {
    const business = eng.businessId ? businessById.get(eng.businessId) : undefined
    const known: Partial<Record<DeliverableType, Record<string, unknown>>> = {}
    if (business?.telnyxPhoneNumber) known.missedcall = { telnyxNumber: business.telnyxPhoneNumber }
    if (business?.googleAdsCustomerId) known.ads = { adsCustomerId: business.googleAdsCustomerId }

    const types = Array.from(new Set(eng.services.flatMap((s) => DELIVERABLE_TYPES_FOR_SERVICE[s])))
    for (const type of types) {
      const sync = known[type] ?? {}
      const del = dels.find((d) => d.engagementId === eng.id && d.type === type)
      if (!del) {
        const fresh: Del = { id: nextDryId(), engagementId: eng.id, type, computedStatus: 'unknown', evidence: { ...sync } }
        dels.push(fresh)
        newDels.push(fresh)
        if (!dryRun && !eng.id.startsWith('dry:')) toInsert.push(fresh)
        summary.deliverablesCreated.push({ ...ref(eng), type })
        continue
      }
      // Merge: set sync-owned keys, keep every other key as it is.
      const changed = Object.keys(sync).filter((k) => del.evidence[k] !== sync[k])
      if (changed.length === 0) continue
      del.evidence = { ...del.evidence, ...sync }
      if (!dryRun) {
        const { id, evidence } = del
        evidenceWrites.push(() => db.deliverable.update({ where: { id }, data: { evidence: evidence as Prisma.InputJsonObject } }))
      }
      summary.evidenceUpdated.push({ ...ref(eng), type, keys: changed })
    }
  }
  await eachLimited(toInsert, DB_CONCURRENCY, async (d) => {
    const row = await db.deliverable.upsert({
      where: { engagementId_type: { engagementId: d.engagementId, type: d.type } },
      create: { engagementId: d.engagementId, type: d.type, evidence: d.evidence as Prisma.InputJsonObject },
      update: {},
    })
    d.id = row.id
  })
  for (const d of newDels) checksByDel.set(d.id, new Map())
  await eachLimited(evidenceWrites, DB_CONCURRENCY, async (write) => {
    await write()
  })

  // ── d. Stripe (read only) ───────────────────────────────────────────────
  const stripe = getStripe()
  if (!stripe) {
    summary.stripe.skipped = true
    summary.notes.push('STRIPE_SECRET_KEY is not set: Stripe phase skipped.')
  } else {
    try {
      await syncStripe(stripe, engs, summary, dryRun, now, ref)
    } catch (err) {
      summary.stripe.errors.push(`stripe phase aborted: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Stage finalization: rows inserted this run only ─────────────────────
  // The insert stage is a placeholder until Stripe has been read. Ignored rows
  // stay ignored, and a row Stripe found nothing for keeps its insert stage.
  // Rows that existed before this run are never touched.
  for (const eng of engs) {
    if (!eng.createdThisRun || eng.stage === 'ignored') continue
    const next = stageFromStripe(eng)
    if (!next || next === eng.stage) continue
    if (!dryRun) await db.engagement.update({ where: { id: eng.id }, data: { stage: next } })
    const entry = createdEntries.get(eng.id)
    if (entry) {
      entry.stageAtInsert = entry.stageAtInsert ?? (eng.stage as EngagementStage)
      entry.stage = next
    }
    eng.stage = next
  }

  // ── Promotion: any row, any age; see promoteIfActive ─────────────────────
  for (const eng of engs) {
    const from = await promoteIfActive(eng, dryRun)
    if (from) {
      summary.promotions.push({ ...ref(eng), from })
      const entry = createdEntries.get(eng.id)
      if (entry) entry.stage = 'active'
    }
  }

  // ── e. Checks (database only) ───────────────────────────────────────────
  const d30 = new Date(now.getTime() - 30 * DAY_MS)
  const d7 = new Date(now.getTime() - 7 * DAY_MS)
  const [calls30, inbound30, testRows, realLeads30, snaps7] = await Promise.all([
    db.conversation.groupBy({ by: ['businessId'], where: { callSid: { not: null }, createdAt: { gte: d30 } }, _count: true }),
    db.conversation.groupBy({
      by: ['businessId'],
      where: { messages: { some: { direction: 'inbound', createdAt: { gte: d30 } } } },
      _count: true,
    }),
    db.websiteLead.groupBy({
      by: ['businessId'],
      where: { name: { startsWith: 'ZZTEST', mode: 'insensitive' } },
      _count: true,
    }),
    db.websiteLead.groupBy({
      by: ['businessId'],
      where: {
        createdAt: { gte: d30 },
        status: { notIn: ['spam', 'partial'] },
        NOT: { name: { startsWith: 'ZZTEST', mode: 'insensitive' } },
      },
      _count: true,
    }),
    db.googleAdsSnapshot.groupBy({ by: ['businessId'], where: { date: { gte: d7 } }, _count: true, _sum: { cost: true } }),
  ])
  const has = (rows: { businessId: string; _count: number }[]) =>
    new Set(rows.filter((r) => r._count > 0).map((r) => r.businessId))
  const activeCalls = has(calls30)
  const activeInbound = has(inbound30)
  const withTestRow = has(testRows)
  const withRealLead = has(realLeads30)
  const snapByBusiness = new Map(snaps7.map((r) => [r.businessId, r]))

  const checksFor = (del: Del, eng: Eng): CheckResult[] => {
    const b = eng.businessId ? businessById.get(eng.businessId) : undefined
    const na = (key: OpsCheckKey): CheckResult => ({ key, passed: null, detail: NO_ACCOUNT })
    const yes = (key: OpsCheckKey, passed: boolean, detail: string | null = null): CheckResult => ({ key, passed, detail })

    // Shared by missedcall and website: both notify the owner of a lead.
    const ownerContact = (biz: NonNullable<typeof b>): CheckResult => {
      const missing: string[] = []
      if (!biz.ownerPhone && !biz.forwardingNumber) missing.push('owner phone or forwarding number')
      if (!biz.ownerEmail) missing.push('owner email')
      return yes('business.owner_contact_set', missing.length === 0, missing.length ? `missing ${missing.join(' and ')}` : null)
    }

    switch (del.type) {
      case 'missedcall': {
        if (!b) return [na('business.number_assigned'), na('business.owner_contact_set'), na('missedcall.activity_30d')]
        return [
          yes('business.number_assigned', Boolean(b.telnyxPhoneNumber), b.telnyxPhoneNumber ?? 'no Telnyx number'),
          ownerContact(b),
          yes(
            'missedcall.activity_30d',
            activeCalls.has(b.id) || activeInbound.has(b.id),
            activeCalls.has(b.id) || activeInbound.has(b.id) ? null : 'no calls or inbound texts in 30 days'
          ),
        ]
      }
      case 'website': {
        if (!b) {
          return [
            yes('website.business_row', false, NO_ACCOUNT),
            na('business.owner_contact_set'),
            na('lead.test_row'),
            na('website.real_lead_30d'),
          ]
        }
        return [
          yes('website.business_row', true),
          ownerContact(b),
          yes('lead.test_row', withTestRow.has(b.id), withTestRow.has(b.id) ? null : 'no ZZTEST lead found'),
          yes('website.real_lead_30d', withRealLead.has(b.id), withRealLead.has(b.id) ? null : 'no real lead in 30 days'),
        ]
      }
      case 'ads': {
        if (!b) return [na('ads.customer_linked'), na('ads.snapshot_7d'), na('ads.spend_7d')]
        const snap = snapByBusiness.get(b.id)
        const spend = snap?._sum.cost ?? 0
        return [
          yes('ads.customer_linked', Boolean(b.googleAdsCustomerId), b.googleAdsCustomerId ?? 'no Google Ads customer id'),
          yes('ads.snapshot_7d', Boolean(snap && snap._count > 0), snap ? `${snap._count} snapshot rows` : 'no snapshot in 7 days'),
          yes('ads.spend_7d', spend > 0, `$${spend.toFixed(2)} in 7 days`),
        ]
      }
      default:
        return [] // domain, email, gbp: no checks this phase
    }
  }

  // Writes are collected, not awaited one by one: a check whose result did
  // not change only needs lastRunAt, which one updateMany covers for all of
  // them; everything else runs DB_CONCURRENCY at a time.
  const unchangedCheckIds: string[] = []
  const writes: (() => Promise<unknown>)[] = []

  for (const del of dels) {
    const eng = engs.find((e) => e.id === del.engagementId)
    if (!eng) continue
    const results = checksFor(del, eng)
    const rows = checksByDel.get(del.id) ?? new Map<string, boolean | null>()
    checksByDel.set(del.id, rows)
    for (const r of results) {
      if (!dryRun && !del.id.startsWith('dry:')) {
        const prev = existingChecks.get(`${del.id}|${r.key}`)
        if (prev && prev.passed === r.passed && prev.detail === r.detail) {
          unchangedCheckIds.push(prev.id)
        } else {
          writes.push(() =>
            db.opsCheck.upsert({
              where: { deliverableId_key: { deliverableId: del.id, key: r.key } },
              create: { deliverableId: del.id, key: r.key, passed: r.passed, detail: r.detail, lastRunAt: now },
              update: { passed: r.passed, detail: r.detail, lastRunAt: now },
            })
          )
        }
      }
      rows.set(r.key, r.passed)
      summary.checksWritten++
      const t = (summary.checkTally[r.key] ??= { passed: 0, failed: 0, couldNotRun: 0 })
      if (r.passed === null) t.couldNotRun++
      else if (r.passed) t.passed++
      else t.failed++
    }

    // ── f. Status derivation (manualStatus is never read or written) ─────
    const next = deriveDeliverableStatus(Array.from(rows.entries()).map(([key, passed]) => ({ key, passed })))
    if (next !== del.computedStatus) {
      if (!dryRun && !del.id.startsWith('dry:')) {
        const id = del.id
        writes.push(() => db.deliverable.update({ where: { id }, data: { computedStatus: next } }))
      }
      summary.deliverableStatusChanges.push({ ...ref(eng), type: del.type, from: del.computedStatus, to: next })
      del.computedStatus = next
    }
  }

  if (unchangedCheckIds.length > 0) {
    await db.opsCheck.updateMany({ where: { id: { in: unchangedCheckIds } }, data: { lastRunAt: now } })
  }
  await eachLimited(writes, DB_CONCURRENCY, async (write) => {
    await write()
  })

  // Photos dropped in the HQ chat and never filed: gone after INBOX_MAX_AGE_DAYS.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const inbox = await cleanInbox({ dryRun, now })
      if (inbox.found) summary.notes.push(`HQ inbox: ${dryRun ? 'would delete' : 'deleted'} ${inbox.found} unfiled chat photo${inbox.found === 1 ? '' : 's'} older than 7 days.`)
    } catch (err) {
      summary.notes.push(`HQ inbox cleanup failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  summary.durationMs = Date.now() - started
  return summary
}

// ── Stripe phase ────────────────────────────────────────────────────────────

/**
 * Charge and PaymentIntent ids that paid an invoice. API 2026-09-30 has no
 * charge.invoice, so the link is read from the invoice's payments instead.
 * Only invoices that took money can have any.
 */
async function invoicePaymentRefs(stripe: Stripe, invoices: Stripe.Invoice[]) {
  const charges = new Set<string>()
  const intents = new Set<string>()
  const paying = invoices.filter((inv) => inv.id && inv.amount_paid)
  await eachLimited(paying, STRIPE_CONCURRENCY, async (inv) => {
    const payments = await stripe.invoicePayments.list({ invoice: inv.id!, limit: 100 }).autoPagingToArray({ limit: 1000 })
    for (const p of payments) {
      const c = idOf(p.payment.charge)
      const pi = idOf(p.payment.payment_intent)
      if (c) charges.add(c)
      if (pi) intents.add(pi)
    }
  })
  return { charges, intents }
}

/** Upfront money: paid non-subscription invoices plus succeeded charges that paid no invoice. */
async function upfrontPayments(stripe: Stripe, invoices: Stripe.Invoice[], charges: Stripe.Charge[]) {
  const refs = await invoicePaymentRefs(stripe, invoices)
  const payments: { at: Date; amount: number }[] = []
  for (const inv of invoices) {
    if (inv.status !== 'paid' || inv.parent?.subscription_details) continue
    payments.push({ at: fromUnix(inv.status_transitions.paid_at ?? inv.created)!, amount: inv.amount_paid })
  }
  for (const ch of charges) {
    if (ch.status !== 'succeeded') continue
    if (refs.charges.has(ch.id) || refs.intents.has(idOf(ch.payment_intent) ?? '')) continue
    // Net of refunds: a refunded charge is still status 'succeeded'.
    const net = ch.amount - ch.amount_refunded
    if (net > 0) payments.push({ at: fromUnix(ch.created)!, amount: net })
  }
  return payments
}

function pickSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  const newest = (a: Stripe.Subscription, b: Stripe.Subscription) => b.created - a.created
  for (const status of SUB_PRIORITY) {
    const hit = subs.filter((s) => s.status === status).sort(newest)[0]
    if (hit) return hit
  }
  return [...subs].sort(newest)[0] ?? null // incomplete / paused only
}

async function loadCustomers(stripe: Stripe): Promise<Stripe.Customer[]> {
  return (await stripe.customers.list({ limit: 100 }).autoPagingToArray({ limit: 10000 })).filter(
    (c) => !(c as Stripe.Customer & { deleted?: boolean }).deleted
  )
}

/** Email first, then phone. One unclaimed hit is a match; anything else carries the reason. */
function decideCustomerMatch(
  eng: Pick<Eng, 'email' | 'phone'>,
  customers: Stripe.Customer[],
  taken: Set<string>
): { customerId: string; on: 'email' | 'phone' } | { reason: string } {
  const email = emailKey(eng.email)
  const phone = phoneKey(eng.phone)
  if (!email && !phone) return { reason: 'no email or phone on the engagement' }
  const byEmail = email ? customers.filter((c) => emailKey(c.email) === email) : []
  const byPhone = phone ? customers.filter((c) => phoneKey(c.phone) === phone) : []
  const [hits, on] = byEmail.length > 0 ? [byEmail, 'email' as const] : [byPhone, 'phone' as const]
  if (hits.length === 0) return { reason: 'no Stripe customer with this email or phone' }
  if (hits.length > 1) return { reason: `${hits.length} Stripe customers share this ${on}: ${hits.map((c) => c.id).join(', ')}` }
  if (taken.has(hits[0].id)) return { reason: `${hits[0].id} is already linked to another engagement` }
  return { customerId: hits[0].id, on }
}

/** A subscription in one of these states is live; anything else lets a schedule speak. */
const LIVE_SUB_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due', 'unpaid']

/**
 * The customer's upcoming or running subscription schedule (status not_started
 * or active), earliest first phase first. A failure here is recorded in
 * `warnings` and treated as "no schedule": it never fails the customer or the
 * run (a restricted key without Subscription Schedules read lands here).
 */
async function upcomingSchedule(stripe: Stripe, customer: string, warnings: string[]): Promise<Stripe.SubscriptionSchedule | null> {
  try {
    const schedules = await stripe.subscriptionSchedules
      .list({ customer, limit: 100, expand: ['data.phases.items.price'] })
      .autoPagingToArray({ limit: 1000 })
    const firstStart = (s: Stripe.SubscriptionSchedule) => s.phases[0]?.start_date ?? Number.MAX_SAFE_INTEGER
    return (
      schedules
        .filter((s) => s.status === 'not_started' || s.status === 'active')
        .sort((a, b) => firstStart(a) - firstStart(b))[0] ?? null
    )
  } catch (err) {
    const kind = (err as { type?: string })?.type === 'StripePermissionError' ? 'permission error' : 'error'
    warnings.push(`subscription schedules skipped (${kind}): ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** One subscription's contribution to monthlyAmount, for the sync summary. */
export type SubscriptionAmount = { id: string; status: string; live: boolean; monthly: number; notes: string[] }

/** Months per interval: a year price is /12, a week price x52/12, a day price x30. */
const MONTHS_PER_INTERVAL: Record<string, number> = { month: 1, year: 1 / 12, week: 52 / 12, day: 30 }

/**
 * Monthly dollars for one subscription: the sum over its items of
 * unit_amount x quantity, divided by interval_count and normalised to a month,
 * then any percent_off discount on the subscription. Tiered and metered prices
 * cannot be priced from the subscription alone, so they count 0 and are named
 * in `notes`; so is an amount_off discount, which is not applied.
 */
export function subscriptionMonthly(sub: Stripe.Subscription): { monthly: number; notes: string[] } {
  const notes: string[] = []
  let cents = 0
  for (const item of sub.items.data) {
    const p = item.price
    if (!p.recurring) {
      notes.push(`${p.id}: one-time price on a subscription, counted 0`)
      continue
    }
    if (p.billing_scheme === 'tiered' || p.recurring.usage_type === 'metered' || p.unit_amount == null) {
      notes.push(`${p.id}: ${p.billing_scheme === 'tiered' ? 'tiered' : 'metered'} price, counted 0`)
      continue
    }
    const perMonth = MONTHS_PER_INTERVAL[p.recurring.interval]
    if (perMonth === undefined) {
      notes.push(`${p.id}: unknown interval ${p.recurring.interval}, counted 0`)
      continue
    }
    cents += ((p.unit_amount * (item.quantity ?? 1)) / (p.recurring.interval_count || 1)) * perMonth
  }
  for (const d of sub.discounts ?? []) {
    if (typeof d === 'string') {
      notes.push(`discount ${d} not expanded, not applied`)
      continue
    }
    const coupon = d.source?.coupon
    if (!coupon || typeof coupon === 'string') {
      notes.push(`discount ${d.id}: coupon not expanded, not applied`)
    } else if (coupon.percent_off) {
      cents *= 1 - coupon.percent_off / 100
      notes.push(`${coupon.percent_off}% off (${coupon.id})`)
    } else if (coupon.amount_off) {
      notes.push(`amount_off ${coupon.amount_off / 100} (${coupon.id}) not applied`)
    }
  }
  return { monthly: dollars(Math.round(cents)), notes }
}

/**
 * Every subscription for the customer, discounts expanded so percent_off can
 * be applied. A key that cannot expand coupons falls back to the plain list
 * with a warning rather than losing the subscriptions.
 */
async function listSubscriptions(stripe: Stripe, customer: string, warnings: string[]): Promise<Stripe.Subscription[]> {
  const list = (expand?: string[]) =>
    stripe.subscriptions.list({ customer, status: 'all', limit: 100, ...(expand ? { expand } : {}) }).autoPagingToArray({ limit: 1000 })
  try {
    return await list(['data.discounts.source.coupon'])
  } catch (err) {
    if ((err as { type?: string })?.type !== 'StripePermissionError') throw err
    warnings.push(`subscription discounts not expanded (permission error), percent_off not applied: ${err instanceof Error ? err.message : String(err)}`)
    return list()
  }
}

/**
 * An open or draft invoice that bills later and belongs to no subscription
 * (a hand-made "first month" invoice), with the future date it bills on:
 * due_date if that is ahead, else automatically_finalizes_at.
 */
function upcomingInvoice(invoices: Stripe.Invoice[], now: Date): { invoice: Stripe.Invoice; at: number } | null {
  const nowSec = Math.floor(now.getTime() / 1000)
  const candidates = invoices
    .filter((i) => (i.status === 'open' || i.status === 'draft') && !i.parent?.subscription_details)
    .map((i) => {
      const at = i.due_date && i.due_date > nowSec ? i.due_date : i.automatically_finalizes_at && i.automatically_finalizes_at > nowSec ? i.automatically_finalizes_at : null
      return at ? { invoice: i, at } : null
    })
    .filter((x): x is { invoice: Stripe.Invoice; at: number } => x !== null)
    .sort((a, b) => a.at - b.at)
  return candidates[0] ?? null
}

/**
 * Subscription and upfront payments for the engagement's linked customer.
 * Mutates `eng` and returns the update to write, the per-subscription amounts
 * (summary only) and non-fatal warnings. Stripe never clears a value: a money
 * field is in the update only when Stripe found something for it.
 *
 * - stripeSubscriptionStatus / Id: the highest-priority subscription (SUB_PRIORITY).
 * - monthlyAmount: the sum over every live subscription (active, trialing,
 *   past_due, unpaid) of subscriptionMonthly; monthlyStartedAt the earliest
 *   live start_date.
 * - With no live subscription, 'scheduled' comes from a not_started or active
 *   subscription schedule (first phase start and monthly price), else from an
 *   upcomingInvoice (its date and total).
 */
async function stripeFieldsFor(
  stripe: Stripe,
  eng: Eng,
  now: Date
): Promise<{
  data: Prisma.EngagementUncheckedUpdateInput
  warnings: string[]
  subscriptions: SubscriptionAmount[]
  amountSource: 'subscriptions' | 'schedule' | 'invoice' | 'none'
}> {
  const warnings: string[] = []
  const customer = eng.stripeCustomerId!
  const [subs, invoices, charges] = await Promise.all([
    listSubscriptions(stripe, customer, warnings),
    stripe.invoices.list({ customer, limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.charges.list({ customer, limit: 100 }).autoPagingToArray({ limit: 1000 }),
  ])

  const data: Prisma.EngagementUncheckedUpdateInput = { stripeSyncedAt: now }
  let amountSource: 'subscriptions' | 'schedule' | 'invoice' | 'none' = 'none'

  const sub = pickSubscription(subs)
  eng.stripeSubscriptionId = sub?.id ?? null
  eng.stripeSubscriptionStatus = sub?.status ?? 'none'
  data.stripeSubscriptionId = eng.stripeSubscriptionId
  data.stripeSubscriptionStatus = eng.stripeSubscriptionStatus

  const subscriptions: SubscriptionAmount[] = subs.map((s) => {
    const { monthly, notes } = subscriptionMonthly(s)
    return { id: s.id, status: s.status, live: LIVE_SUB_STATUSES.includes(s.status), monthly, notes }
  })
  const live = subs.filter((s) => LIVE_SUB_STATUSES.includes(s.status))
  if (live.length > 0) {
    amountSource = 'subscriptions'
    eng.monthlyAmount = data.monthlyAmount = dollars(
      Math.round(subscriptions.filter((x) => x.live).reduce((sum, x) => sum + x.monthly * 100, 0))
    )
    eng.monthlyStartedAt = data.monthlyStartedAt = fromUnix(Math.min(...live.map((s) => s.start_date)))
  } else {
    const schedule = await upcomingSchedule(stripe, customer, warnings)
    const invoice = schedule ? null : upcomingInvoice(invoices, now)
    if (schedule) {
      amountSource = 'schedule'
      eng.stripeSubscriptionStatus = data.stripeSubscriptionStatus = 'scheduled'
      const phase = schedule.phases[0]
      if (phase) {
        eng.monthlyStartedAt = data.monthlyStartedAt = fromUnix(phase.start_date)
        const price = phase.items[0]?.price
        if (
          price &&
          typeof price === 'object' &&
          !(price as { deleted?: boolean }).deleted &&
          (price as Stripe.Price).recurring?.interval === 'month' &&
          (price as Stripe.Price).unit_amount != null
        ) {
          eng.monthlyAmount = data.monthlyAmount = dollars((price as Stripe.Price).unit_amount!)
        }
      }
    } else if (invoice) {
      amountSource = 'invoice'
      eng.stripeSubscriptionStatus = data.stripeSubscriptionStatus = 'scheduled'
      eng.monthlyStartedAt = data.monthlyStartedAt = fromUnix(invoice.at)
      eng.monthlyAmount = data.monthlyAmount = dollars(invoice.invoice.total)
    }
  }

  const upfront = await upfrontPayments(stripe, invoices, charges)
  if (upfront.length > 0) {
    eng.upfrontAmount = data.upfrontAmount = dollars(upfront.reduce((s, p) => s + p.amount, 0))
    eng.upfrontPaidAt = data.upfrontPaidAt = new Date(Math.min(...upfront.map((p) => p.at.getTime())))
  }
  return { data, warnings, subscriptions, amountSource }
}

async function syncStripe(
  stripe: Stripe,
  engs: Eng[],
  summary: OpsSyncSummary,
  dryRun: boolean,
  now: Date,
  ref: (e: Eng) => EngRef
) {
  const customers = await loadCustomers(stripe)
  summary.stripe.customersLoaded = customers.length
  const taken = new Set(engs.map((e) => e.stripeCustomerId).filter((id): id is string => Boolean(id)))

  // Match: email first, then phone. Decided for every engagement before any is
  // written, so one customer matched by two engagements links neither.
  const proposals: { eng: Eng; customerId: string; on: 'email' | 'phone' }[] = []
  for (const eng of engs) {
    // Ignored (test/junk) rows never claim a customer: stripeCustomerId is
    // unique, and a junk row holding one would block the real client.
    if (eng.stripeCustomerId || eng.stage === 'prospect' || eng.stage === 'ignored') continue
    const decision = decideCustomerMatch(eng, customers, taken)
    if ('reason' in decision) summary.stripe.unmatched.push({ ...ref(eng), reason: decision.reason })
    else proposals.push({ eng, customerId: decision.customerId, on: decision.on })
  }
  for (const p of proposals) {
    const rivals = proposals.filter((q) => q.customerId === p.customerId)
    if (rivals.length > 1) {
      summary.stripe.unmatched.push({
        ...ref(p.eng),
        reason: `${p.customerId} also matches ${rivals.filter((q) => q !== p).map((q) => q.eng.displayName).join(', ')}`,
      })
      continue
    }
    if (!dryRun && !p.eng.id.startsWith('dry:')) {
      await db.engagement.updateMany({ where: { id: p.eng.id, stripeCustomerId: null }, data: { stripeCustomerId: p.customerId } })
    }
    p.eng.stripeCustomerId = p.customerId
    taken.add(p.customerId)
    summary.stripe.matched.push({ ...ref(p.eng), customerId: p.customerId, matchedOn: p.on })
  }

  // Per linked customer: subscription and upfront payments.
  await eachLimited(engs.filter((e) => e.stripeCustomerId), STRIPE_CONCURRENCY, async (eng) => {
    const customer = eng.stripeCustomerId!
    try {
      const { data, warnings, subscriptions, amountSource } = await stripeFieldsFor(stripe, eng, now)
      for (const w of warnings) summary.stripe.errors.push(`${eng.displayName} (${customer}): ${w}`)

      if (!dryRun && !eng.id.startsWith('dry:')) {
        await db.engagement.update({ where: { id: eng.id }, data })
      }
      summary.stripe.synced.push({
        ...ref(eng),
        customerId: customer,
        subscriptionId: eng.stripeSubscriptionId,
        subscriptionStatus: eng.stripeSubscriptionStatus ?? 'none', // always set by stripeFieldsFor
        monthlyAmount: eng.monthlyAmount,
        monthlyStartedAt: iso(eng.monthlyStartedAt),
        upfrontAmount: eng.upfrontAmount,
        upfrontPaidAt: iso(eng.upfrontPaidAt),
        amountSource,
        subscriptions,
      })
    } catch (err) {
      summary.stripe.errors.push(`${eng.displayName} (${customer}): ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Paying customers no engagement points at, last UNPAID_LOOKBACK_DAYS days.
  // Reported only; /admin/ops links or creates them.
  const linked = new Set(engs.map((e) => e.stripeCustomerId).filter((id): id is string => Boolean(id)))
  summary.stripe.unmatchedPayingCustomers = await unmatchedPayingCustomers(stripe, customers, linked, now)
}

export type UnmatchedPayingCustomer = OpsSyncSummary['stripe']['unmatchedPayingCustomers'][number]

/** Customers with a succeeded charge or paid invoice in the window that no engagement points at. */
async function unmatchedPayingCustomers(
  stripe: Stripe,
  customers: Stripe.Customer[],
  linked: Set<string>,
  now: Date
): Promise<UnmatchedPayingCustomer[]> {
  const cutoff = Math.floor((now.getTime() - UNPAID_LOOKBACK_DAYS * DAY_MS) / 1000)
  const [recentCharges, recentInvoices] = await Promise.all([
    stripe.charges.list({ created: { gte: cutoff }, limit: 100 }).autoPagingToArray({ limit: 10000 }),
    stripe.invoices.list({ status: 'paid', created: { gte: cutoff }, limit: 100 }).autoPagingToArray({ limit: 10000 }),
  ])
  const orphan = (c: string | null) => Boolean(c && !linked.has(c))
  const orphanCharges = recentCharges.filter((c) => c.status === 'succeeded' && orphan(idOf(c.customer)))
  const orphanInvoices = recentInvoices.filter((i) => orphan(idOf(i.customer)))
  const refs = await invoicePaymentRefs(stripe, orphanInvoices)

  const totals = new Map<string, { last: number; cents: number }>()
  const add = (customer: string, at: number, cents: number) => {
    const t = totals.get(customer) ?? { last: 0, cents: 0 }
    t.last = Math.max(t.last, at)
    t.cents += cents
    totals.set(customer, t)
  }
  for (const inv of orphanInvoices) {
    add(idOf(inv.customer)!, inv.status_transitions.paid_at ?? inv.created, inv.amount_paid)
  }
  for (const ch of orphanCharges) {
    if (refs.charges.has(ch.id) || refs.intents.has(idOf(ch.payment_intent) ?? '')) continue
    add(idOf(ch.customer)!, ch.created, ch.amount - ch.amount_refunded)
  }
  const byId = new Map(customers.map((c) => [c.id, c]))
  return Array.from(totals.entries())
    .map(([customerId, t]) => ({
      customerId,
      name: byId.get(customerId)?.name ?? null,
      email: byId.get(customerId)?.email ?? null,
      lastPaymentAt: new Date(t.last * 1000).toISOString(),
      total: dollars(t.cents),
    }))
    .sort((a, b) => b.lastPaymentAt.localeCompare(a.lastPaymentAt))
}

// ── Single-engagement entry points (/admin/ops) ─────────────────────────────
// The same rules as the full run, applied to one row right after a hand edit.

/**
 * Create any missing Deliverable for these services. Create only, never
 * delete, with the same sync-owned evidence phase c sets. Returns the types
 * it created.
 */
export async function ensureDeliverables(engagementId: string, services: ServiceKey[]): Promise<DeliverableType[]> {
  const eng = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      deliverables: { select: { type: true } },
      business: { select: { telnyxPhoneNumber: true, googleAdsCustomerId: true } },
    },
  })
  if (!eng) return []
  const have = new Set(eng.deliverables.map((d) => d.type))
  const known: Partial<Record<DeliverableType, Record<string, unknown>>> = {}
  if (eng.business?.telnyxPhoneNumber) known.missedcall = { telnyxNumber: eng.business.telnyxPhoneNumber }
  if (eng.business?.googleAdsCustomerId) known.ads = { adsCustomerId: eng.business.googleAdsCustomerId }

  const missing = Array.from(new Set(services.flatMap((s) => DELIVERABLE_TYPES_FOR_SERVICE[s] ?? []))).filter(
    (t) => !have.has(t)
  )
  await eachLimited(missing, DB_CONCURRENCY, async (type) => {
    await db.deliverable.upsert({
      where: { engagementId_type: { engagementId, type } },
      create: { engagementId, type, evidence: (known[type] ?? {}) as Prisma.InputJsonObject },
      update: {},
    })
  })
  return missing
}

/** The sync summary's unmatched paying customers, computed on demand. null = no Stripe key. */
export async function listUnmatchedStripeCustomers(): Promise<UnmatchedPayingCustomer[] | null> {
  const stripe = getStripe()
  if (!stripe) return null
  const [customers, rows] = await Promise.all([
    loadCustomers(stripe),
    db.engagement.findMany({ where: { stripeCustomerId: { not: null } }, select: { stripeCustomerId: true } }),
  ])
  const linked = new Set(rows.map((r) => r.stripeCustomerId!))
  return unmatchedPayingCustomers(stripe, customers, linked, new Date())
}

export type StripeEngagementResult =
  | {
      ok: true
      customerId: string
      matchedOn: 'email' | 'phone' | 'linked'
      subscriptionStatus: string
      warnings: string[]
      /** The stage it was promoted from, when an active subscription promoted it. */
      promotedFrom: string | null
    }
  | { ok: false; reason: string }

/**
 * Stripe match (when the row has no customer yet) and update for one
 * engagement: the sync's per-engagement logic, read only against Stripe. A
 * match that another unlinked engagement would also make is refused, exactly
 * as the full run refuses it.
 */
export async function syncStripeForEngagement(engagementId: string): Promise<StripeEngagementResult> {
  const stripe = getStripe()
  if (!stripe) return { ok: false, reason: 'STRIPE_SECRET_KEY is not set' }
  const row = await db.engagement.findUnique({ where: { id: engagementId } })
  if (!row) return { ok: false, reason: 'engagement not found' }
  const eng = toEng(row)
  const now = new Date()
  let matchedOn: 'email' | 'phone' | 'linked' = 'linked'

  if (!eng.stripeCustomerId) {
    if (eng.stage === 'prospect' || eng.stage === 'ignored') return { ok: false, reason: `stage ${eng.stage} is not matched` }
    const [customers, all] = await Promise.all([loadCustomers(stripe), db.engagement.findMany()])
    const taken = new Set(all.map((e) => e.stripeCustomerId).filter((id): id is string => Boolean(id)))
    const decision = decideCustomerMatch(eng, customers, taken)
    if ('reason' in decision) return { ok: false, reason: decision.reason }
    const rivals = all
      .filter((e) => e.id !== eng.id && !e.stripeCustomerId && e.stage !== 'prospect' && e.stage !== 'ignored')
      .filter((e) => {
        const d = decideCustomerMatch(e, customers, taken)
        return 'customerId' in d && d.customerId === decision.customerId
      })
    if (rivals.length > 0) {
      return { ok: false, reason: `${decision.customerId} also matches ${rivals.map((e) => e.displayName).join(', ')}` }
    }
    const claimed = await db.engagement.updateMany({
      where: { id: eng.id, stripeCustomerId: null },
      data: { stripeCustomerId: decision.customerId },
    })
    if (claimed.count === 0) return { ok: false, reason: 'engagement was linked by someone else meanwhile' }
    eng.stripeCustomerId = decision.customerId
    matchedOn = decision.on
  }

  const { data, warnings } = await stripeFieldsFor(stripe, eng, now)
  await db.engagement.update({ where: { id: eng.id }, data })
  const promotedFrom = await promoteIfActive(eng, false)
  return {
    promotedFrom,
    ok: true,
    customerId: eng.stripeCustomerId!,
    matchedOn,
    subscriptionStatus: eng.stripeSubscriptionStatus ?? 'none',
    warnings,
  }
}
