// ===========================================
// /admin/ops: creating a client on demand
// ===========================================
// Shared by POST /api/admin/ops/engagements (the "New client" form), POST
// /api/admin/businesses and the chief's create_client. A client paid through a
// checkout link may have no Stripe customer and no signup, so neither is
// required: the Engagement is created by hand (source 'manual'), and with
// createBusiness the platform Business row too, linked in the same transaction
// so the sync never sees an unlinked Business and makes a second client.
//
// The Business has no User. The client claims it by signing up with the same
// email (app/onboarding attaches a verified email to an unclaimed Business).

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
import { slugify } from '@/lib/utils'
import { ensureDeliverables, syncStripeForEngagement, type StripeEngagementResult } from './sync'
import { ENGAGEMENT_STAGES, SERVICE_KEYS, type ServiceKey } from './types'
import { BadRequest, STRIPE_CUSTOMER_ID, listOf, nullableDate, nullableNumber, nullableString, oneOf, optionalString, rejectUnknownKeys } from './validate'

export const NEW_CLIENT_FIELDS = [
  'displayName',
  'contactName',
  'email',
  'phone',
  'trade',
  'location',
  'services',
  'stage',
  'upfrontAmount',
  'upfrontPaidAt',
  'monthlyAmount',
  'stripeCustomerId',
  'createBusiness',
  'notes',
] as const

export type NewClient = {
  displayName: string
  contactName: string | null
  email: string | null
  phone: string | null
  trade: string | null
  location: string | null
  services: ServiceKey[]
  stage: string
  upfrontAmount: number | null
  upfrontPaidAt: Date | null
  monthlyAmount: number | null
  stripeCustomerId: string | null
  createBusiness: boolean
  notes: string | null
}

/** Validate the new-client body (the form, the route and the chief send the same shape). */
export function parseNewClient(body: Record<string, unknown>): NewClient {
  rejectUnknownKeys(body, NEW_CLIENT_FIELDS)
  const displayName = optionalString(body.displayName, 'displayName', 200)
  if (!displayName) throw new BadRequest('displayName is required')
  const stripe = body.stripeCustomerId == null || body.stripeCustomerId === '' ? null : String(body.stripeCustomerId).trim()
  if (stripe && !STRIPE_CUSTOMER_ID.test(stripe)) throw new BadRequest('stripeCustomerId must be a cus_ id')
  const email = optionalString(body.email, 'email', 200)?.toLowerCase() ?? null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('email is not an email address')
  const rawPhone = optionalString(body.phone, 'phone', 40)
  const phone = rawPhone ? normalizeToE164(rawPhone) || null : null
  if (rawPhone && !phone) throw new BadRequest('phone is not a US phone number')
  return {
    displayName,
    contactName: optionalString(body.contactName, 'contactName', 200),
    email,
    phone,
    trade: optionalString(body.trade, 'trade', 200),
    location: optionalString(body.location, 'location', 200),
    services: body.services === undefined ? [] : listOf(body.services, SERVICE_KEYS, 'services'),
    stage: body.stage === undefined ? 'onboarding' : oneOf(body.stage, ENGAGEMENT_STAGES, 'stage'),
    upfrontAmount: body.upfrontAmount === undefined ? null : nullableNumber(body.upfrontAmount, 'upfrontAmount'),
    upfrontPaidAt: body.upfrontPaidAt === undefined ? null : nullableDate(body.upfrontPaidAt, 'upfrontPaidAt'),
    monthlyAmount: body.monthlyAmount === undefined ? null : nullableNumber(body.monthlyAmount, 'monthlyAmount'),
    stripeCustomerId: stripe,
    createBusiness: body.createBusiness === true,
    notes: optionalString(body.notes, 'notes', 20000),
  }
}

export type NewBusiness = { name: string; ownerEmail?: string | null; ownerPhone?: string | null; businessType?: string | null; timezone?: string | null }

/**
 * A platform Business without a signup. Every flag at its schema default
 * except two: missedCallAiEnabled is on only when missedcall is among the
 * services (a web-only client must not get the SMS flow by accident), and
 * subscriptionStatus is 'active'. The slug is the name, with a short suffix
 * when taken.
 */
export async function createBusinessRow(tx: Prisma.TransactionClient, b: NewBusiness, services: string[]) {
  const base = slugify(b.name).replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'client'
  let slug = base
  for (let n = 0; await tx.business.findUnique({ where: { slug }, select: { id: true } }); n++) {
    if (n > 5) throw new Error(`could not find a free slug for ${b.name}`)
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  return tx.business.create({
    data: {
      name: b.name,
      slug,
      ownerEmail: b.ownerEmail?.toLowerCase() || null,
      ownerPhone: b.ownerPhone ? normalizeToE164(b.ownerPhone) || null : null,
      businessType: b.businessType || null,
      ...(b.timezone ? { timezone: b.timezone } : {}),
      missedCallAiEnabled: services.includes('missedcall'),
      subscriptionStatus: 'active',
    },
    select: { id: true, name: true, slug: true },
  })
}

export class Conflict extends Error {}

export type CreatedClient = {
  engagementId: string
  displayName: string
  business: { id: string; name: string; slug: string } | null
  deliverables: string[]
  stripe: StripeEngagementResult | null
}

/**
 * Create the client: Engagement (source manual, stage onboarding unless set),
 * the Business when asked, deliverables for the services, an OpsActivity
 * "Created from HQ" (with `via`), and the Stripe link and sync when a customer
 * id is given. Refuses a second client with the same name, email or Stripe id.
 */
export async function createClient(input: NewClient, via: string): Promise<CreatedClient> {
  const clash = await db.engagement.findFirst({
    where: {
      OR: [
        { displayName: { equals: input.displayName, mode: 'insensitive' } },
        ...(input.email ? [{ email: { equals: input.email, mode: 'insensitive' as const } }] : []),
        ...(input.stripeCustomerId ? [{ stripeCustomerId: input.stripeCustomerId }] : []),
      ],
    },
    select: { id: true, displayName: true },
  })
  if (clash) throw new Conflict(`${clash.displayName.trim()} is already on the board (${clash.id})`)
  if (input.createBusiness && input.email) {
    const owned = await db.business.findFirst({ where: { ownerEmail: { equals: input.email, mode: 'insensitive' } }, select: { name: true } })
    if (owned) throw new Conflict(`a platform account already uses ${input.email} (${owned.name}); link it instead`)
  }

  const { engagement, business } = await db.$transaction(async (tx) => {
    const business = input.createBusiness
      ? await createBusinessRow(tx, { name: input.displayName, ownerEmail: input.email, ownerPhone: input.phone, businessType: input.trade }, input.services)
      : null
    const engagement = await tx.engagement.create({
      data: {
        displayName: input.displayName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        trade: input.trade,
        location: input.location,
        services: input.services,
        stage: input.stage,
        source: 'manual',
        upfrontAmount: input.upfrontAmount,
        upfrontPaidAt: input.upfrontPaidAt,
        monthlyAmount: input.monthlyAmount,
        notes: input.notes,
        businessId: business?.id ?? null,
        stripeCustomerId: input.stripeCustomerId,
      },
      select: { id: true, displayName: true },
    })
    const parts = [
      `Created from HQ (${via})`,
      input.services.length ? `services ${input.services.join(', ')}` : 'no services yet',
      input.upfrontAmount != null ? `upfront $${input.upfrontAmount}` : null,
      input.monthlyAmount != null ? `monthly $${input.monthlyAmount}` : null,
      business ? `platform account ${business.slug}` : null,
    ].filter(Boolean)
    await tx.opsActivity.create({ data: { engagementId: engagement.id, kind: 'system', body: parts.join('; ') } })
    return { engagement, business }
  })

  const deliverables = await ensureDeliverables(engagement.id, input.services)
  const stripe = input.stripeCustomerId ? await syncStripeForEngagement(engagement.id) : null
  return { engagementId: engagement.id, displayName: engagement.displayName, business, deliverables, stripe }
}
