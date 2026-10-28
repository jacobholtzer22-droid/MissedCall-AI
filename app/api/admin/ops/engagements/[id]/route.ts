// ===========================================
// PATCH /api/admin/ops/engagements/[id] — hand edits to one client
// ===========================================
// Allowlist only (ALLOWED); any other key is a 400, never silently dropped.
// Side effects, all on Ops tables:
//   services changed     -> ensureDeliverables (create only, never delete)
//   stage changed        -> OpsActivity status_change "stage: a -> b"
//   stripeCustomerId set -> syncStripeForEngagement (read only against Stripe)
// stripeCustomerId: null unlinks: it clears the link plus stripeSubscriptionId,
// stripeSubscriptionStatus and stripeSyncedAt. The amounts stay.

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { ensureDeliverables, syncStripeForEngagement } from '@/lib/ops/sync'
import { ENGAGEMENT_STAGES, SERVICE_KEYS } from '@/lib/ops/types'
import {
  BadRequest,
  STRIPE_CUSTOMER_ID,
  listOf,
  nullableDate,
  nullableNumber,
  nullableString,
  oneOf,
  readJsonObject,
  rejectUnknownKeys,
} from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED = [
  'displayName',
  'contactName',
  'email',
  'phone',
  'trade',
  'location',
  'services',
  'stage',
  'notes',
  'brief',
  'nextFollowUpAt',
  'lastContactedAt',
  'monthlyAmount',
  'upfrontAmount',
  'stripeCustomerId',
] as const

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = context.params.id

  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ALLOWED)

    const current = await db.engagement.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const data: Prisma.EngagementUncheckedUpdateInput = {}
    if ('displayName' in body) {
      const name = nullableString(body.displayName, 'displayName', 200)
      if (!name) throw new BadRequest('displayName cannot be empty')
      data.displayName = name
    }
    for (const key of ['contactName', 'email', 'phone', 'trade', 'location'] as const) {
      if (key in body) data[key] = nullableString(body[key], key, 200)
    }
    if ('notes' in body) data.notes = nullableString(body.notes, 'notes', 20000)
    if ('brief' in body) data.brief = nullableString(body.brief, 'brief', 60000)
    if ('services' in body) data.services = listOf(body.services, SERVICE_KEYS, 'services')
    if ('stage' in body) data.stage = oneOf(body.stage, ENGAGEMENT_STAGES, 'stage')
    if ('nextFollowUpAt' in body) data.nextFollowUpAt = nullableDate(body.nextFollowUpAt, 'nextFollowUpAt')
    if ('lastContactedAt' in body) data.lastContactedAt = nullableDate(body.lastContactedAt, 'lastContactedAt')
    if ('monthlyAmount' in body) data.monthlyAmount = nullableNumber(body.monthlyAmount, 'monthlyAmount')
    if ('upfrontAmount' in body) data.upfrontAmount = nullableNumber(body.upfrontAmount, 'upfrontAmount')

    let linkTo: string | null = null
    if ('stripeCustomerId' in body) {
      const v = body.stripeCustomerId
      if (v !== null && (typeof v !== 'string' || !STRIPE_CUSTOMER_ID.test(v.trim()))) {
        throw new BadRequest('stripeCustomerId must be a cus_ id or null')
      }
      const next = v === null ? null : (v as string).trim()
      if (next && next !== current.stripeCustomerId) {
        const owner = await db.engagement.findFirst({ where: { stripeCustomerId: next, id: { not: id } }, select: { displayName: true } })
        if (owner) {
          return NextResponse.json({ error: `${next} is already linked to ${owner.displayName.trim()}` }, { status: 409 })
        }
        linkTo = next
      }
      data.stripeCustomerId = next
      // Unlink drops the subscription the link brought with it, so an unlinked
      // row never shows a live status. Amounts stay: they may be hand-entered.
      if (next === null && current.stripeCustomerId) {
        data.stripeSubscriptionId = null
        data.stripeSubscriptionStatus = null
        data.stripeSyncedAt = null
      }
    }

    const stageChanged = typeof data.stage === 'string' && data.stage !== current.stage
    await db.$transaction(async (tx) => {
      await tx.engagement.update({ where: { id }, data })
      if (stageChanged) {
        await tx.opsActivity.create({
          data: { engagementId: id, kind: 'status_change', body: `stage: ${current.stage} -> ${data.stage}` },
        })
      }
    })

    const created = Array.isArray(data.services) ? await ensureDeliverables(id, data.services as never) : []
    const stripe = linkTo ? await syncStripeForEngagement(id) : null

    return NextResponse.json({ ok: true, deliverablesCreated: created, stripe })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'That Stripe customer is already linked to another engagement' }, { status: 409 })
    }
    console.error('[admin/ops/engagements] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
