// Arm attribution ledger writer. See the ArmEvent model for why this is
// separate from FunnelEvent.
//
// Never awaited by callers and never throws: losing an analytics row must not
// cost a lead.

import { db } from '@/lib/db'

export async function logArmView(input: {
  arm: string | null
  visitorId?: string | null
}): Promise<void> {
  try {
    await db.armEvent.create({
      data: { type: 'view', arm: input.arm || 'unassigned', visitorId: input.visitorId ?? null },
    })
  } catch (err) {
    console.error('[arm-log] view failed:', err)
  }
}

export async function logArmVerifiedLead(input: {
  arm: string | null
  trade?: string | null
  businessName?: string | null
  phone?: string | null
  visitorId?: string | null
  leadId?: string | null
}): Promise<void> {
  try {
    await db.armEvent.create({
      data: {
        type: 'verified_lead',
        arm: input.arm || 'unassigned',
        trade: input.trade ?? null,
        businessName: input.businessName ?? null,
        phone: input.phone ?? null,
        visitorId: input.visitorId ?? null,
        leadId: input.leadId ?? null,
      },
    })
  } catch (err) {
    console.error('[arm-log] verified_lead failed:', err)
  }
}

/** A confirmed booking, written in the same request that fires Schedule. */
export async function logArmSchedule(input: {
  arm: string | null
  trade?: string | null
  businessName?: string | null
  phone?: string | null
  visitorId?: string | null
  leadId?: string | null
}): Promise<void> {
  try {
    await db.armEvent.create({
      data: {
        type: 'schedule',
        arm: input.arm || 'unassigned',
        trade: input.trade ?? null,
        businessName: input.businessName ?? null,
        phone: input.phone ?? null,
        visitorId: input.visitorId ?? null,
        leadId: input.leadId ?? null,
      },
    })
  } catch (err) {
    console.error('[arm-log] schedule failed:', err)
  }
}
