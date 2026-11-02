// ===========================================
// The intake wizard, server side (PORTAL_INTAKE_WIZARD)
// ===========================================
// Scoping. A portal session reaches exactly one record: the signed-in Clerk
// user -> their User row -> their Business -> the Engagement linked to that
// Business. Nothing in a request body or query names an engagement. A signup
// whose Business has no Engagement yet gets its own (what the sync would make
// for it, source business_row), never someone else's.
//
// A likely match to a client Jacob created (lib/ops/duplicate-guard.ts, the
// same matching) is read only: it never links. It becomes one "Link to
// existing <name>?" card (action merge_portal) for Jacob's Push, and the plan
// is pre-filled from that client only when the match is on an email Clerk
// verified, so a look-alike signup learns nothing about someone else's plan.

import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { readIntake } from '@/lib/ops/intake'
import { updateIntake } from '@/lib/ops/intake-server'
import { createRun } from '@/lib/ops/hq/runs'
import { LINK_CARD_KIND } from '@/lib/ops/duplicate-guard'
import { findLikely, proposeLink } from '@/lib/ops/duplicate-guard-server'
import { mergeIntakes, planFromBoard, portalIntakeWizardEnabled, setupUnfinished, withBoardPlan, type IntakeWithWizard } from '@/lib/ops/intake-wizard'

export type PortalClient = { id: string; displayName: string; contactName: string | null; intake: IntakeWithWizard; businessId: string }

/** Per-user and per-IP limits per route, per minute. */
export const PORTAL_LIMITS = { page: 30, save: 60, token: 240, register: 120, finish: 10, billing: 10 } as const
export type PortalRoute = keyof typeof PORTAL_LIMITS

export function portalRateOk(route: PortalRoute, userId: string, ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const u = rateLimit(`portal-intake:${route}:u:${userId}`, PORTAL_LIMITS[route], 60_000)
  const i = rateLimit(`portal-intake:${route}:ip:${ip}`, PORTAL_LIMITS[route] * 2, 60_000)
  return { allowed: u.allowed && i.allowed, retryAfterSeconds: Math.max(u.retryAfterSeconds ?? 0, i.retryAfterSeconds ?? 0) }
}

/**
 * The signed-in user's own record, created for their Business when it has none.
 * null when the user has no Business yet (they finish /onboarding first).
 */
export async function portalClientFor(userId: string, verifiedEmails: string[]): Promise<PortalClient | null> {
  const user = await db.user.findUnique({
    where: { clerkId: userId },
    select: { email: true, firstName: true, lastName: true, business: { select: { id: true, name: true, ownerEmail: true, ownerPhone: true, forwardingNumber: true, businessType: true } } },
  })
  const b = user?.business
  if (!b) return null
  const select = { id: true, displayName: true, contactName: true, intake: true, stage: true, services: true, deliverables: { select: { type: true } } } as const
  let e = await db.engagement.findUnique({ where: { businessId: b.id }, select })
  if (e) {
    if (e.stage === 'ignored' || e.stage === 'churned') return null
    const plan = planFromBoard(Array.isArray(e.services) ? (e.services as string[]) : [], e.deliverables.map((d) => d.type))
    const intake = readIntake(e.intake) as IntakeWithWizard
    const next = plan && !intake.wizard?.plan ? ((await updateIntake(e.id, (cur) => withBoardPlan(cur as IntakeWithWizard, plan, 'board'))) as IntakeWithWizard) : intake
    return { id: e.id, displayName: e.displayName, contactName: e.contactName, intake: next, businessId: b.id }
  }

  // No record yet: the client's own, then a read-only look for a client Jacob created.
  const email = verifiedEmails[0] ?? b.ownerEmail ?? user?.email ?? null
  const contactName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null
  e = await db.engagement.upsert({
    where: { businessId: b.id },
    create: { businessId: b.id, displayName: b.name, contactName, email, phone: b.ownerPhone || b.forwardingNumber || null, trade: b.businessType, source: 'business_row', stage: 'onboarding', services: [] },
    update: {},
    select,
  })
  const created = e
  await db.opsActivity.create({ data: { engagementId: created.id, kind: 'system', body: 'Created from the client portal sign-up (the client signed up and started the intake).' } })

  const matches = (await findLikely({ name: b.name, email, phones: [b.ownerPhone, b.forwardingNumber] }, { businessId: b.id, engagementId: created.id })).filter(
    (m) => m.entry.kind === 'engagement' && !m.entry.businessId
  )
  let intake = readIntake(created.intake) as IntakeWithWizard
  const m = matches[0]
  if (m && m.entry.engagementId) {
    const verified = m.on.includes('email') && verifiedEmails.some((v) => v.toLowerCase() === (email ?? '').toLowerCase())
    if (verified) {
      const src = await db.engagement.findUnique({ where: { id: m.entry.engagementId }, select: { services: true, deliverables: { select: { type: true } } } })
      const plan = src ? planFromBoard(Array.isArray(src.services) ? (src.services as string[]) : [], src.deliverables.map((d) => d.type)) : null
      if (plan) intake = (await updateIntake(created.id, (cur) => withBoardPlan(cur as IntakeWithWizard, plan, 'matched'))) as IntakeWithWizard
    }
    await proposePortalMerge(created.id, b.id, b.name, m)
  }
  return { id: created.id, displayName: created.displayName, contactName: created.contactName, intake, businessId: b.id }
}

/** The merge card, once per portal record. */
async function proposePortalMerge(portalEngagementId: string, businessId: string, name: string, m: Parameters<typeof proposeLink>[2]) {
  const existing = await db.opsApproval.findFirst({ where: { kind: LINK_CARD_KIND, detail: { path: ['portalEngagementId'], equals: portalEngagementId } }, select: { id: true } })
  if (existing) return
  const job = await db.opsJob.create({ data: { prompt: `Client portal sign-up looks like an existing client: ${name}`, status: 'running', engagementIds: m.entry.engagementId ? [m.entry.engagementId] : [] } })
  const run = await createRun({ agent: 'chief', kind: 'chief', mode: 'work', engagementId: portalEngagementId, jobId: job.id, input: { portalIntakeWizard: true, businessId } })
  await proposeLink({ jobId: job.id, runId: run.id }, name, m, { action: 'merge_portal', businessId, portalEngagementId })
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** Every /api/portal/intake route: flag, signed in, rate limit, then the user's own record. */
export async function portalGuard(request: Request, route: PortalRoute): Promise<{ client: PortalClient } | { response: NextResponse }> {
  if (!portalIntakeWizardEnabled()) return { response: notFound() }
  const { userId } = await auth()
  if (!userId) return { response: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) }
  const limit = portalRateOk(route, userId, getClientIp(request))
  if (!limit.allowed) {
    return { response: NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }) }
  }
  const client = await portalClientFor(userId, await verifiedEmailsOf())
  if (!client) return { response: notFound() }
  return { client }
}

export async function verifiedEmailsOf(): Promise<string[]> {
  const u = await currentUser()
  return (u?.emailAddresses ?? []).filter((e) => e.verification?.status === 'verified').map((e) => e.emailAddress.trim().toLowerCase())
}

/**
 * Push on a merge_portal card: the client Jacob created takes over the signup's
 * platform account and the answers, files and legal details from the portal
 * record (its own answers win where both have one). The portal record keeps
 * everything and is set aside (stage ignored, account unlinked). Nothing deleted.
 */
export async function applyPortalMerge(detail: Record<string, unknown>): Promise<string> {
  const portalId = String(detail.portalEngagementId ?? '')
  const businessId = String(detail.businessId ?? '')
  const targetId = String(((detail.existing ?? {}) as Record<string, unknown>).engagementId ?? '')
  if (!portalId || !businessId || !targetId) throw new Error('the card is missing its records')
  const [portal, target] = await Promise.all([
    db.engagement.findUnique({ where: { id: portalId }, select: { businessId: true, intake: true, displayName: true } }),
    db.engagement.findUnique({ where: { id: targetId }, select: { businessId: true, displayName: true } }),
  ])
  if (!portal || !target) throw new Error('one of the two clients is gone')
  if (portal.businessId !== businessId) throw new Error('the portal record no longer holds that platform account')
  if (target.businessId && target.businessId !== businessId) throw new Error(`${target.displayName.trim()} already has a platform account; merge them by hand`)
  const from = readIntake(portal.intake) as IntakeWithWizard
  await db.$transaction([
    db.engagement.update({ where: { id: portalId }, data: { businessId: null, stage: 'ignored' } }),
    db.engagement.update({ where: { id: targetId }, data: { businessId } }),
  ])
  await updateIntake(targetId, (cur) => mergeIntakes(cur as IntakeWithWizard, from))
  const line = `Merged the client portal sign-up into ${target.displayName.trim()} (Jacob pushed the Link card): platform account linked, answers, files and legal details copied in.`
  await db.opsActivity.createMany({
    data: [
      { engagementId: targetId, kind: 'note', body: line },
      { engagementId: portalId, kind: 'system', body: `Set aside: merged into ${target.displayName.trim()} on Jacob's Push. Nothing was deleted.` },
    ],
  })
  return line
}

/** The link's client as the wizard needs it: the board's plan stored once as the prefill (the link is always Jacob's own record). */
export async function linkWizardClient(c: { id: string; displayName: string; contactName: string | null; intake: IntakeWithWizard }) {
  if (c.intake.wizard?.plan) return c
  const e = await db.engagement.findUnique({ where: { id: c.id }, select: { services: true, deliverables: { select: { type: true } } } })
  const plan = e ? planFromBoard(Array.isArray(e.services) ? (e.services as string[]) : [], e.deliverables.map((d) => d.type)) : null
  if (!plan) return c
  const intake = (await updateIntake(c.id, (cur) => withBoardPlan(cur as IntakeWithWizard, plan, 'board'))) as IntakeWithWizard
  return { ...c, intake }
}

/** PORTAL_INTAKE_WIZARD: where the dashboard's "Finish your setup" link points, or null for no link. Read only. */
export async function dashboardSetupLink(businessId: string): Promise<string | null> {
  if (!portalIntakeWizardEnabled()) return null
  const e = await db.engagement.findUnique({ where: { businessId }, select: { stage: true, intake: true } })
  return setupUnfinished(e ? { stage: e.stage, intake: readIntake(e.intake) as IntakeWithWizard } : null) ? '/onboarding/intake' : null
}
