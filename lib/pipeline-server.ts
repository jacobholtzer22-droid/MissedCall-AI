// ===========================================
// /admin/pipeline — server-side loading
// ===========================================
// Stitches the marketing business's WebsiteLead and Appointment rows into one
// row per person, keyed on phone, and overlays the PipelinePerson record (if
// one exists yet) holding Jacob's status, dates, money and notes.
//
// Joined on phone rather than an FK, for the same reason /admin/leads does it:
// a landing-calendar booking can have no lead row at all, and a lead can book
// from a different device than the one that walked the funnel. The funnel
// stores both columns as E.164, so exact equality is the right comparison.
//
// Read only. Every write lives in the /api/admin/pipeline routes, and those
// write only PipelinePerson, PipelineNote and Appointment.showStatus.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'
import { isTestPhone } from '@/lib/test-allowlist'
import {
  resolveCompany,
  resolveUtmTerm,
  type PipelinePerson,
  type ShowStatus,
  type Status,
} from '@/lib/pipeline'

/** Same gate as every other /api/admin route: the Clerk user is ADMIN_USER_ID. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return null
}

export const leadKey = (lead: { id: string; phone: string | null }) => lead.phone || `lead:${lead.id}`

/** The first-name line the gate writes, else the row's name column. */
function leadName(l: { name: string; message: string | null }): string {
  return (l.message?.match(/^First name: (.+)$/m)?.[1] ?? l.name ?? '').trim()
}

const byTime = (a: { createdAt: Date }, b: { createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime()

/**
 * Every person for the marketing business, or null when it is not configured.
 * The whole funnel is well under a few hundred rows, so this loads all of it
 * in four queries and never paginates. Narrow with `onlyKey` to refresh one row.
 */
export async function loadPipeline(onlyKey?: string): Promise<{ businessId: string; people: PipelinePerson[] } | null> {
  const business = await getMarketingBusiness()
  if (!business) return null

  const [leads, appts, records] = await Promise.all([
    db.websiteLead.findMany({
      where: { businessId: business.id, status: { not: 'spam' } },
      select: {
        id: true, name: true, phone: true, email: true, message: true, createdAt: true,
        otpVerifiedAt: true, funnelVariant: true, attributionFirst: true, attributionLast: true,
        businessName: true, agencyFlagTerm: true, junk: true,
      },
    }),
    db.appointment.findMany({
      where: { businessId: business.id },
      select: {
        id: true, customerName: true, customerPhone: true, customerEmail: true, scheduledAt: true,
        createdAt: true, status: true, notes: true, bookingSurface: true, funnelVariant: true,
        attributionFirst: true, attributionLast: true, agencyFlagTerm: true, showStatus: true,
      },
    }),
    db.pipelinePerson.findMany({
      where: { businessId: business.id },
      include: { notes: { orderBy: { createdAt: 'desc' } } },
    }),
  ])

  type Group = { leads: typeof leads; appts: typeof appts }
  const groups = new Map<string, Group>()
  const group = (k: string) => {
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { leads: [], appts: [] }))
    return g
  }
  for (const l of leads) group(leadKey(l)).leads.push(l)
  for (const a of appts) group(a.customerPhone).appts.push(a)
  const recordByKey = new Map(records.map((r) => [r.personKey, r]))

  const people: PipelinePerson[] = []
  for (const [key, g] of Array.from(groups)) {
    if (onlyKey && key !== onlyKey) continue
    const ls = [...g.leads].sort(byTime) // oldest first: first touch lives there
    const as = [...g.appts].sort(byTime)
    const newestLead = ls[ls.length - 1]
    const newestAppt = as[as.length - 1]
    const rec = recordByKey.get(key)
    const verified = ls.map((l) => l.otpVerifiedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())
    const phone = key.startsWith('lead:') ? null : key

    people.push({
      key,
      name: (newestLead && leadName(newestLead)) || newestAppt?.customerName || 'Unnamed',
      company: resolveCompany({
        leadBusinessNames: [...ls].reverse().map((l) => l.businessName),
        notes: [...as.map((a) => a.notes), ...[...ls].reverse().map((l) => l.message)],
      }),
      phone,
      email: [...ls].reverse().find((l) => l.email)?.email ?? [...as].reverse().find((a) => a.customerEmail)?.customerEmail ?? null,
      leadCreatedAt: ls[0]?.createdAt.toISOString() ?? null,
      verifiedAt: verified[0]?.toISOString() ?? null,
      arm: newestLead?.funnelVariant ?? newestAppt?.funnelVariant ?? null,
      utmTerm: resolveUtmTerm({
        firstTouches: [...ls.map((l) => l.attributionFirst), ...as.map((a) => a.attributionFirst)],
        lastTouches: [...ls.map((l) => l.attributionLast), ...as.map((a) => a.attributionLast)],
        notes: as.map((a) => a.notes),
      }),
      agencyFlagTerm: as.find((a) => a.agencyFlagTerm)?.agencyFlagTerm ?? ls.find((l) => l.agencyFlagTerm)?.agencyFlagTerm ?? null,
      leadJunk: ls.some((l) => l.junk),
      isTest: isTestPhone(phone),
      bookings: [...as]
        .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
        .map((a) => ({
          id: a.id,
          scheduledAt: a.scheduledAt.toISOString(),
          createdAt: a.createdAt.toISOString(),
          calendarStatus: a.status,
          showStatus: a.showStatus as ShowStatus,
          bookingSurface: a.bookingSurface,
        })),
      status: (rec?.status as Status) ?? 'pending',
      lostReason: rec?.lostReason ?? null,
      closedAt: rec?.closedAt?.toISOString() ?? null,
      mrr: rec?.mrr ?? null,
      setupFee: rec?.setupFee ?? null,
      lastContactedAt: rec?.lastContactedAt?.toISOString() ?? null,
      nextFollowUpAt: rec?.nextFollowUpAt?.toISOString() ?? null,
      notes: (rec?.notes ?? []).map((n) => ({ id: n.id, body: n.body, kind: n.kind, createdAt: n.createdAt.toISOString() })),
    })
  }
  return { businessId: business.id, people }
}

/** One person, or null if the key matches no lead or booking of this business. */
export async function loadPerson(key: string) {
  const res = await loadPipeline(key)
  if (!res) return null
  const person = res.people[0]
  return person ? { businessId: res.businessId, person } : null
}
