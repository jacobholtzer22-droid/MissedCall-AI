// ===========================================
// /admin/ops: intake reads and writes (server only)
// ===========================================
// Every write locks the engagement row (SELECT ... FOR UPDATE) so parallel
// photo uploads cannot overwrite each other's asset entries.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { mergeIntake, readIntake, type Intake } from './intake'

/**
 * HEIC is never stored: the intake page converts it to JPEG in the browser
 * (this sharp build cannot decode it, so neither could the build).
 */
export const HEIC_MESSAGE = 'HEIC must be converted to JPG before it is saved. Upload it again from the intake page, which converts it.'

/** The blob path every upload for this client must use. */
export const assetPrefix = (engagementId: string) => `ops-intake/${engagementId}/`

/** A Blob URL is accepted only when it is a public Blob URL under this client's own prefix. */
export function isOwnAssetUrl(url: string, engagementId: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith(`/${assetPrefix(engagementId)}`)
  } catch {
    return false
  }
}

export async function updateIntake(engagementId: string, change: (current: Intake) => Intake): Promise<Intake> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ intake: unknown }[]>`SELECT "intake" FROM "Engagement" WHERE "id" = ${engagementId} FOR UPDATE`
    if (!rows.length) throw new Error('Engagement not found')
    const next = change(readIntake(rows[0].intake))
    await tx.engagement.update({ where: { id: engagementId }, data: { intake: next as unknown as Prisma.InputJsonObject } })
    return next
  })
}

export async function patchIntake(engagementId: string, patch: Record<string, unknown>) {
  return updateIntake(engagementId, (cur) => mergeIntake(cur, patch))
}

export async function loadIntake(engagementId: string): Promise<{ name: string; intake: Intake } | null> {
  const e = await db.engagement.findUnique({ where: { id: engagementId }, select: { displayName: true, intake: true } })
  return e ? { name: e.displayName.trim(), intake: readIntake(e.intake) } : null
}
