// The real side effects behind lib/ops/ads-account.ts (ADS_ACCOUNT_CREATE).
// Google Ads through the platform's own client (lib/google-ads.ts), logged in
// as the manager (GOOGLE_ADS_MCC_ID). Every function here is reached only with
// the flag on: the chief's propose_ads_account tool and decideApproval.

import type { Prisma } from '@prisma/client'
import { enums } from 'google-ads-api'
import { db } from '@/lib/db'
import { getGoogleAdsClient } from '@/lib/google-ads'
import { mergeEvidence } from '@/lib/ops/agents/shared'
import { STEP_CATALOG, defaultWaitingOn } from '@/lib/ops/steps'
import { readIntake } from '@/lib/ops/intake'
import { isNeverTouch, missingAdsEnv } from '@/lib/ops/hq/ads-tools'
import { applyAccountCreate, applyInvite, proposeAccount, type AccountDeps, type AccountFields } from '@/lib/ops/ads-account'

function customer(customerId: string) {
  const missing = missingAdsEnv()
  if (missing.length) throw new Error(`Google Ads credentials not set: ${missing.join(', ')}`)
  return getGoogleAdsClient().Customer({
    customer_id: customerId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_MCC_ID,
  })
}

function deps(card: { runId: string; jobId: string }): AccountDeps {
  return {
    facts: async (engagementId) => {
      const e = await db.engagement.findUnique({
        where: { id: engagementId },
        select: {
          displayName: true,
          location: true,
          intake: true,
          businessId: true,
          business: { select: { googleAdsCustomerId: true } },
          deliverables: { where: { type: 'ads' }, select: { evidence: true } },
        },
      })
      if (!e) return null
      const intake = readIntake(e.intake)
      const ev = (e.deliverables[0]?.evidence ?? {}) as Record<string, unknown>
      const name = e.displayName.trim() || intake.business?.displayName?.trim() || null
      return {
        engagementId,
        displayName: name,
        location: e.location,
        intakeAddress: intake.business?.address ?? null,
        accountEmail: intake.ads?.accountEmail?.trim() || null,
        businessId: e.businessId,
        existingCustomerId: e.business?.googleAdsCustomerId || (typeof ev.adsCustomerId === 'string' && ev.adsCustomerId ? ev.adsCustomerId : null),
        neverTouch: isNeverTouch(name ?? ''),
        hasAdsDeliverable: e.deliverables.length > 0,
      }
    },
    // CustomerService.CreateCustomerClient (google-ads-api 23: customers.createCustomerClient).
    createCustomerClient: async (f: AccountFields, validateOnly: boolean) => {
      const mcc = process.env.GOOGLE_ADS_MCC_ID!.replace(/-/g, '')
      const res = await customer(mcc).customers.createCustomerClient({
        customer_id: mcc,
        customer_client: { descriptive_name: f.descriptiveName, currency_code: f.currencyCode, time_zone: f.timeZone },
        validate_only: validateOnly,
      } as never)
      return (res as { resource_name?: string | null })?.resource_name ?? null
    },
    // CustomerUserAccessInvitationService on the new account.
    invite: async (customerId, email, role) => {
      await customer(customerId).customerUserAccessInvitations.create([
        { email_address: email, access_role: role === 'STANDARD' ? enums.AccessRole.STANDARD : enums.AccessRole.ADMIN },
      ])
    },
    currentAdsStep: async (engagementId) =>
      (await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'ads' } }, select: { step: true } }))?.step ?? null,
    bind: async (engagementId, customerId, nextStep, f) => {
      const e = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { businessId: true } })
      // Only when empty: never overwrite an id already on the platform (the bind_account rule).
      const set = e.businessId
        ? await db.business.updateMany({ where: { id: e.businessId, googleAdsCustomerId: null }, data: { googleAdsCustomerId: customerId } })
        : { count: 0 }
      const ads = await db.deliverable.findUnique({ where: { engagementId_type: { engagementId, type: 'ads' } }, select: { id: true } })
      if (ads) {
        await mergeEvidence(ads.id, { adsCustomerId: customerId, adsAccountCreatedAt: new Date().toISOString() })
        if (nextStep) {
          await db.deliverable.update({
            where: { id: ads.id },
            data: { step: nextStep, stepUpdatedAt: new Date(), waitingOn: defaultWaitingOn('ads', nextStep), waitingNote: 'Account created by API; billing is the client\'s, in the Ads UI' },
          })
        }
      }
      await db.opsActivity.create({
        data: { engagementId, kind: 'system', body: `Google Ads account ${customerId} created under the manager ("${f.descriptiveName}", ${f.currencyCode}, ${f.timeZone}) and bound by id.${nextStep ? ` Ads step: ${nextStep}.` : ''} No billing, nothing enabled.` },
      })
      return { businessSet: set.count === 1 }
    },
    proposeCard: async (kind, engagementId, title, detail, expected) => {
      const a = await db.opsApproval.create({
        data: { jobId: card.jobId, runId: card.runId, agent: 'ads', kind, title, detail: { ...detail, engagementId } as Prisma.InputJsonObject, expected },
      })
      await db.opsJob.update({ where: { id: card.jobId }, data: { status: 'awaiting_approval' } })
      return a.id
    },
    activity: async (engagementId, body) => {
      if (engagementId) await db.opsActivity.create({ data: { engagementId, kind: 'note', body } })
    },
  }
}

export const proposeAccountFor = (engagementId: string, card: { runId: string; jobId: string }) => proposeAccount(engagementId, deps(card))

/** decideApproval's apply for the two card kinds. */
export async function applyAccountCard(approval: { kind: string; runId: string; jobId: string }, detail: Record<string, unknown>): Promise<string> {
  const d = deps({ runId: approval.runId, jobId: approval.jobId })
  if (approval.kind === 'ads_account_create') {
    const r = await applyAccountCreate(detail, d, STEP_CATALOG.ads)
    return `created ${r.customerId}${r.inviteApprovalId ? '; invite card waiting for Push' : ''}`
  }
  await applyInvite(detail, d)
  return 'invitation sent'
}
