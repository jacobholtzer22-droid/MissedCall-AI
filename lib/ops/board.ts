// ===========================================
// /admin/ops — board loader
// ===========================================
// Single source for the /admin/ops page (initial SSR) and GET
// /api/admin/ops/board (refresh after every write). Same discipline as
// lib/admin-stats.ts: a fixed number of cross-tenant queries, never a query per
// row. Read only.
//
// Every date leaves here as an ISO string so the result crosses the server /
// client boundary as plain JSON. Stage 'ignored' rows are left out of every
// list and total and returned on their own as `ignored`.

import { TZDate } from '@date-fns/tz'
import { endOfDay, startOfDay, startOfMonth } from 'date-fns'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { computeEngagementAlerts, type OpsAlert, type OpsHealth } from '@/lib/ops/alerts'
import type { DeliverableStatus } from '@/lib/ops/types'
import { isVerifiedMrr, mrrBucketOf } from '@/lib/ops/money'
import { effectiveStatusOf, stepFor, type StepOwner } from '@/lib/ops/steps'

/** Ops runs on Jacob's day: "today" and "this month" are America/Detroit. */
export const OPS_TIMEZONE = 'America/Detroit'

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

export type BoardCheck = { key: string; passed: boolean | null; detail: string | null; lastRunAt: string }

export type BoardDeliverable = {
  id: string
  type: string
  computedStatus: string
  manualStatus: string | null
  manualStatusNote: string | null
  manualStatusAt: string | null
  /** effectiveStatusOf (lib/ops/steps.ts): manualStatus, else the step, else computedStatus. */
  effectiveStatus: DeliverableStatus
  /** Waiting-on step (lib/ops/steps.ts). */
  step: string | null
  stepLabel: string | null
  /** Catalog owner of the step: jacob | client | vendor | none. */
  stepOwner: StepOwner | null
  stepTerminal: boolean
  /** Who it waits on now: the step's owner unless overridden by hand. */
  waitingOn: string | null
  waitingNote: string | null
  stepUpdatedAt: string | null
  evidence: Record<string, unknown>
  checks: BoardCheck[]
}

export type BoardActivity = { id: string; kind: string; body: string; followUpAt: string | null; createdAt: string }

export type BoardBusiness = {
  id: string
  name: string
  slug: string
  subscriptionStatus: string
  ownerEmail: string | null
  ownerPhone: string | null
  forwardingNumber: string | null
  telnyxPhoneNumber: string | null
  googleAdsCustomerId: string | null
  createdAt: string
}

export type BoardEngagement = {
  id: string
  displayName: string
  contactName: string | null
  email: string | null
  phone: string | null
  trade: string | null
  location: string | null
  source: string
  stage: string
  services: string[]
  businessId: string | null
  pipelinePersonId: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeSubscriptionStatus: string | null
  upfrontPaidAt: string | null
  upfrontAmount: number | null
  monthlyAmount: number | null
  monthlyStartedAt: string | null
  stripeSyncedAt: string | null
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  deliverables: BoardDeliverable[]
  /** Newest first, at most 5. */
  activities: BoardActivity[]
  lastActivityAt: string | null
  business: BoardBusiness | null
  pipelinePerson: { status: string; nextFollowUpAt: string | null; lastContactedAt: string | null } | null
  alerts: OpsAlert[]
  health: OpsHealth
}

export type BoardFollowUp = {
  kind: 'client' | 'prospect'
  /** engagementId for a client, personKey for a prospect. */
  id: string
  name: string
  phone: string | null
  dueAt: string
}

export type BoardBooking = {
  id: string
  customerName: string
  customerPhone: string
  scheduledAt: string
  status: string
  showStatus: string
  googleMeetLink: string | null
}

export type MoneyBucket = { total: number; count: number; noStripe: number }

/**
 * An MRR figure split by how sure it is. Verified: the Stripe subscription is
 * active or past_due. Projected: every other row with a monthlyAmount (no
 * subscription yet, scheduled, trialing, canceled, or not linked to Stripe).
 */
export type MrrSplit = { verified: MoneyBucket; projected: MoneyBucket }

export type BoardMoney = {
  mrrActive: MrrSplit
  mrrPending: MrrSplit
  mrrChurned: MrrSplit
  oneTimeTotal: MoneyBucket
  oneTimeThisMonth: MoneyBucket
  countsByStage: Record<string, number>
  /** Distinct rows summed into any bucket above that have no stripeCustomerId. */
  summedWithoutStripe: number
}

export type BoardAgentRun = {
  id: string
  engagementId: string
  engagementName: string
  kind: string
  status: string
  output: Record<string, unknown> | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export type OpsBoard = {
  generatedAt: string
  lastSyncAt: string | null
  engagements: BoardEngagement[]
  ignored: BoardEngagement[]
  followUpsDue: BoardFollowUp[]
  bookedToday: BoardBooking[]
  money: BoardMoney
  agentRuns: BoardAgentRun[]
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

export async function getOpsBoard(): Promise<OpsBoard> {
  const now = new Date()
  const zoned = new TZDate(now, OPS_TIMEZONE)
  const dayStart = startOfDay(zoned)
  const dayEnd = endOfDay(zoned)
  const monthStart = startOfMonth(zoned)
  const marketing = await getMarketingBusiness()

  const [rows, prospects, bookings, runs] = await Promise.all([
    db.engagement.findMany({
      include: {
        deliverables: { include: { checks: true }, orderBy: { type: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 5 },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            subscriptionStatus: true,
            ownerEmail: true,
            ownerPhone: true,
            forwardingNumber: true,
            telnyxPhoneNumber: true,
            googleAdsCustomerId: true,
            createdAt: true,
          },
        },
        pipelinePerson: { select: { status: true, nextFollowUpAt: true, lastContactedAt: true } },
      },
    }),
    marketing
      ? db.pipelinePerson.findMany({
          where: { businessId: marketing.id, status: { in: ['pending', 'working'] }, nextFollowUpAt: { lte: now } },
          select: { personKey: true, nextFollowUpAt: true },
        })
      : [],
    marketing
      ? db.appointment.findMany({
          where: { businessId: marketing.id, scheduledAt: { gte: dayStart, lte: dayEnd } },
          orderBy: { scheduledAt: 'asc' },
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            scheduledAt: true,
            status: true,
            showStatus: true,
            googleMeetLink: true,
          },
        })
      : [],
    db.agentRun.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { engagement: { select: { displayName: true } } } }),
  ])

  // Prospect names: the latest lead or booking per person, two queries total.
  const phoneKeys = prospects.map((p) => p.personKey).filter((k) => !k.startsWith('lead:'))
  const leadIds = prospects.map((p) => p.personKey).filter((k) => k.startsWith('lead:')).map((k) => k.slice(5))
  const [leads, appts] =
    marketing && prospects.length > 0
      ? await Promise.all([
          db.websiteLead.findMany({
            where: { businessId: marketing.id, OR: [{ phone: { in: phoneKeys } }, { id: { in: leadIds } }] },
            select: { id: true, name: true, phone: true, createdAt: true },
          }),
          db.appointment.findMany({
            where: { businessId: marketing.id, customerPhone: { in: phoneKeys } },
            select: { customerName: true, customerPhone: true, createdAt: true },
          }),
        ])
      : [[], []]

  const engagements: BoardEngagement[] = rows.map((e) => {
    const deliverables: BoardDeliverable[] = e.deliverables.map((d) => ({
      id: d.id,
      type: d.type,
      computedStatus: d.computedStatus,
      manualStatus: d.manualStatus,
      manualStatusNote: d.manualStatusNote,
      manualStatusAt: iso(d.manualStatusAt),
      effectiveStatus: effectiveStatusOf(d),
      step: d.step,
      stepLabel: stepFor(d.type, d.step)?.label ?? null,
      stepOwner: stepFor(d.type, d.step)?.owner ?? null,
      stepTerminal: stepFor(d.type, d.step)?.terminal ?? false,
      waitingOn: d.waitingOn,
      waitingNote: d.waitingNote,
      stepUpdatedAt: iso(d.stepUpdatedAt),
      evidence: asObject(d.evidence),
      checks: d.checks
        .map((c) => ({ key: c.key, passed: c.passed, detail: c.detail, lastRunAt: c.lastRunAt.toISOString() }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    }))
    const { alerts, health } = computeEngagementAlerts(e, e.deliverables, e.business, now)
    const activities = e.activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      followUpAt: iso(a.followUpAt),
      createdAt: a.createdAt.toISOString(),
    }))
    return {
      id: e.id,
      displayName: e.displayName.trim(),
      contactName: e.contactName,
      email: e.email,
      phone: e.phone,
      trade: e.trade,
      location: e.location,
      source: e.source,
      stage: e.stage,
      services: Array.isArray(e.services) ? (e.services as string[]) : [],
      businessId: e.businessId,
      pipelinePersonId: e.pipelinePersonId,
      stripeCustomerId: e.stripeCustomerId,
      stripeSubscriptionId: e.stripeSubscriptionId,
      stripeSubscriptionStatus: e.stripeSubscriptionStatus,
      upfrontPaidAt: iso(e.upfrontPaidAt),
      upfrontAmount: e.upfrontAmount,
      monthlyAmount: e.monthlyAmount,
      monthlyStartedAt: iso(e.monthlyStartedAt),
      stripeSyncedAt: iso(e.stripeSyncedAt),
      lastContactedAt: iso(e.lastContactedAt),
      nextFollowUpAt: iso(e.nextFollowUpAt),
      notes: e.notes,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      deliverables,
      activities,
      lastActivityAt: activities[0]?.createdAt ?? null,
      business: e.business ? { ...e.business, createdAt: e.business.createdAt.toISOString() } : null,
      pipelinePerson: e.pipelinePerson
        ? {
            status: e.pipelinePerson.status,
            nextFollowUpAt: iso(e.pipelinePerson.nextFollowUpAt),
            lastContactedAt: iso(e.pipelinePerson.lastContactedAt),
          }
        : null,
      alerts,
      health,
    }
  })

  const live = engagements.filter((e) => e.stage !== 'ignored')
  const ignored = engagements.filter((e) => e.stage === 'ignored')

  // ── Follow-ups due: clients and prospects, one list, oldest first ────────
  const prospectName = (key: string) => {
    const candidates = [
      ...leads
        .filter((l) => (key.startsWith('lead:') ? l.id === key.slice(5) : l.phone === key))
        .map((l) => ({ name: l.name, phone: l.phone, at: l.createdAt })),
      ...appts.filter((a) => a.customerPhone === key).map((a) => ({ name: a.customerName, phone: a.customerPhone, at: a.createdAt })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime())
    return candidates[0] ?? null
  }
  const followUpsDue: BoardFollowUp[] = [
    ...live
      .filter((e) => e.nextFollowUpAt && new Date(e.nextFollowUpAt) <= now)
      .map((e) => ({ kind: 'client' as const, id: e.id, name: e.displayName, phone: e.phone, dueAt: e.nextFollowUpAt! })),
    ...prospects.map((p) => {
      const who = prospectName(p.personKey)
      return {
        kind: 'prospect' as const,
        id: p.personKey,
        name: who?.name?.trim() || p.personKey,
        phone: p.personKey.startsWith('lead:') ? who?.phone ?? null : p.personKey,
        dueAt: p.nextFollowUpAt!.toISOString(),
      }
    }),
  ].sort((a, b) => a.dueAt.localeCompare(b.dueAt))

  // ── Money ───────────────────────────────────────────────────────────────
  const summed = new Set<string>()
  const bucket = (list: BoardEngagement[], value: (e: BoardEngagement) => number | null): MoneyBucket => {
    const withValue = list.filter((e) => value(e) != null)
    for (const e of withValue) if (!e.stripeCustomerId) summed.add(e.id)
    return {
      total: withValue.reduce((s, e) => s + (value(e) ?? 0), 0),
      count: withValue.length,
      noStripe: withValue.filter((e) => !e.stripeCustomerId).length,
    }
  }
  const split = (which: 'active' | 'pending' | 'churned'): MrrSplit => {
    const rowsIn = live.filter((e) => mrrBucketOf(e) === which)
    return {
      verified: bucket(rowsIn.filter((e) => isVerifiedMrr(e.stripeSubscriptionStatus)), (e) => e.monthlyAmount),
      projected: bucket(rowsIn.filter((e) => !isVerifiedMrr(e.stripeSubscriptionStatus)), (e) => e.monthlyAmount),
    }
  }
  const money: BoardMoney = {
    mrrActive: split('active'),
    mrrPending: split('pending'),
    mrrChurned: split('churned'),
    oneTimeTotal: bucket(live, (e) => e.upfrontAmount),
    oneTimeThisMonth: bucket(
      live.filter((e) => e.upfrontPaidAt && new Date(e.upfrontPaidAt) >= monthStart),
      (e) => e.upfrontAmount
    ),
    countsByStage: live.reduce<Record<string, number>>((acc, e) => {
      acc[e.stage] = (acc[e.stage] ?? 0) + 1
      return acc
    }, {}),
    summedWithoutStripe: 0,
  }
  money.summedWithoutStripe = summed.size

  const synced = engagements.map((e) => e.stripeSyncedAt).filter((d): d is string => Boolean(d)).sort()

  return {
    generatedAt: now.toISOString(),
    lastSyncAt: synced[synced.length - 1] ?? null,
    engagements: live,
    ignored,
    followUpsDue,
    bookedToday: bookings.map((b) => ({ ...b, scheduledAt: b.scheduledAt.toISOString() })),
    money,
    agentRuns: runs.map((r) => ({
      id: r.id,
      engagementId: r.engagementId,
      engagementName: r.engagement.displayName.trim(),
      kind: r.kind,
      status: r.status,
      output: r.output && typeof r.output === 'object' && !Array.isArray(r.output) ? (r.output as Record<string, unknown>) : null,
      error: r.error,
      startedAt: iso(r.startedAt),
      finishedAt: iso(r.finishedAt),
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
