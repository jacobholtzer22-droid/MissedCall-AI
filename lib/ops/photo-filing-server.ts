// ===========================================
// /admin/ops HQ: filing chat photos onto a client's intake (server only)
// ===========================================
// The chief's file_photos tool. The rules are in ./photo-filing (planFiling);
// this copies each inbox blob to ops-intake/{engagementId}/, appends the
// assets under the intake row lock (the same lock the intake page's uploads
// take, so the duplicate-name suffix holds against both), marks the chat
// attachments filed, deletes the inbox blobs and logs one OpsActivity note.
// Also the ops sync's cleanup of unfiled inbox blobs.

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { copy, del, list } from '@vercel/blob'
import { db } from '@/lib/db'
import { uniqueFilename, type IntakeAsset } from './intake'
import { isOwnAssetUrl, loadIntake, updateIntake } from './intake-server'
import { INBOX_MAX_AGE_DAYS, INBOX_PREFIX, filedNote, planFiling, readAttachments, type ChatAttachment } from './photo-filing'

/** Chat messages from the last INBOX_MAX_AGE_DAYS with attachments (unfiled ones still exist in Blob). */
async function recentAttachmentMessages() {
  const since = new Date(Date.now() - INBOX_MAX_AGE_DAYS * 86_400_000)
  const rows = await db.opsMessage.findMany({
    where: { role: 'jacob', createdAt: { gte: since }, attachments: { not: Prisma.DbNull } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, attachments: true },
  })
  return rows.map((r) => ({ id: r.id, attachments: readAttachments(r.attachments) }))
}

export type FiledPhoto = { filename: string; kind: IntakeAsset['kind']; caption: string; service: string | null; heroCandidate: boolean; beforeAfter: string | null; url: string }

export async function filePhotos(engagementId: string, photos: unknown): Promise<{ client: string; filed: FiledPhoto[] }> {
  const loaded = await loadIntake(engagementId)
  if (!loaded) throw new Error(`no client with id ${engagementId}`)
  const messages = await recentAttachmentMessages()
  const inbox: ChatAttachment[] = messages.flatMap((m) => m.attachments)
  const plan = planFiling({ engagementId, intake: loaded.intake, photos, inbox, uuid: randomUUID })

  // Copy everything first; on any failure, remove what was copied and stop.
  const copied: string[] = []
  try {
    for (const p of plan) {
      const res = await copy(p.source.url, p.pathname, { access: 'public', addRandomSuffix: false })
      copied.push(res.url)
    }
  } catch (err) {
    if (copied.length) await del(copied).catch(() => undefined)
    throw new Error(`could not copy the photos: ${err instanceof Error ? err.message : String(err)}`)
  }

  const replacingLogo = plan.some((p) => p.asset.kind === 'logo')
  let oldLogos: string[] = []
  let assets: IntakeAsset[] = []
  try {
    await updateIntake(engagementId, (cur) => {
      const kept = (cur.assets ?? []).filter((a) => !(replacingLogo && a.kind === 'logo'))
      oldLogos = (cur.assets ?? []).filter((a) => replacingLogo && a.kind === 'logo').map((a) => a.url)
      // Suffixes again under the lock: an intake-page upload may have landed since the plan.
      const taken = kept.map((a) => a.filename)
      assets = plan.map((p, n) => {
        const filename = uniqueFilename(p.source.filename, taken)
        taken.push(filename)
        return { ...p.asset, filename, url: copied[n] }
      })
      return { ...cur, assets: [...kept, ...assets], updatedAt: new Date().toISOString() }
    })
  } catch (err) {
    await del(copied).catch(() => undefined)
    throw err
  }

  const filedUrls = new Set(plan.map((p) => p.source.url))
  await Promise.all(
    messages
      .filter((m) => m.attachments.some((a) => filedUrls.has(a.url)))
      .map((m) =>
        db.opsMessage.update({
          where: { id: m.id },
          data: { attachments: m.attachments.map((a) => (filedUrls.has(a.url) ? { ...a, filedTo: engagementId } : a)) as unknown as Prisma.InputJsonValue },
        })
      )
  )
  await del([...Array.from(filedUrls), ...oldLogos.filter((u) => isOwnAssetUrl(u, engagementId))]).catch((err) =>
    console.error('[hq/file_photos] could not delete inbox blobs:', err instanceof Error ? err.message : err)
  )
  await db.opsActivity.create({ data: { engagementId, kind: 'note', body: filedNote(assets.length) } })

  return {
    client: loaded.name,
    filed: assets.map((a) => ({
      filename: a.filename,
      kind: a.kind,
      caption: a.caption ?? '',
      service: a.service ?? null,
      heroCandidate: Boolean(a.heroCandidate),
      beforeAfter: a.beforeAfter ?? null,
      url: a.url,
    })),
  }
}

/** Delete inbox blobs older than INBOX_MAX_AGE_DAYS (filed ones are already gone). For the ops sync. */
export async function cleanInbox({ dryRun, now = new Date() }: { dryRun: boolean; now?: Date }): Promise<{ found: number; deleted: number }> {
  const cutoff = now.getTime() - INBOX_MAX_AGE_DAYS * 86_400_000
  const old: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: INBOX_PREFIX, cursor, limit: 1000 })
    for (const b of page.blobs) if (b.uploadedAt.getTime() < cutoff) old.push(b.url)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  if (!dryRun && old.length) await del(old)
  return { found: old.length, deleted: dryRun ? 0 : old.length }
}
