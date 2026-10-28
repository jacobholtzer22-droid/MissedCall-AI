// ===========================================
// /admin/ops: intake reads and writes (server only)
// ===========================================
// Every write locks the engagement row (SELECT ... FOR UPDATE) so parallel
// photo uploads cannot overwrite each other's asset entries.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { mergeIntake, readIntake, type Intake, type IntakeAsset } from './intake'

export const MAX_ASSET_BYTES = 15 * 1024 * 1024

/** Content types per kind. HEIC is not here: this sharp build cannot decode it. */
export const ASSET_TYPES: Record<IntakeAsset['kind'], string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  logo: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  document: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
}

export const HEIC_MESSAGE = 'HEIC photos cannot be converted here. Export them as JPG (on iPhone: Settings > Camera > Formats > Most Compatible, or share the photo as JPG) and upload again.'

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
