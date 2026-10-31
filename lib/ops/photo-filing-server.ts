// ===========================================
// /admin/ops HQ: filing chat photos onto a client's intake (server only)
// ===========================================
// The chief's file_photos tool. The rules are in ./photo-filing (planFiling);
// this copies each inbox blob to ops-intake/{engagementId}/, appends the
// assets under the intake row lock (the same lock the intake page's uploads
// take, so the duplicate-name suffix holds against both), marks the chat
// attachments filed, deletes the inbox blobs and logs one OpsActivity note.
// fileAllPhotos is file_photos all:true: the list is built from the photo
// run's stored captions (planAll). Also the ops sync's cleanup of unfiled
// inbox blobs.

import { randomUUID } from 'node:crypto'
import { copy, del, list } from '@vercel/blob'
import { db } from '@/lib/db'
import { uniqueFilename, type IntakeAsset } from './intake'
import { isOwnAssetUrl, loadIntake, updateIntake } from './intake-server'
import { INBOX_MAX_AGE_DAYS, INBOX_PREFIX, InvalidAttachments, filedNote, planAll, planFiling, type ChatAttachment, type PlannedFile } from './photo-filing'
import { inboxMessages, listInbox, updateAttachments } from './hq/inbox'
import { activePhotoRun } from './hq/photo'

const COPY_CONCURRENCY = 5

/** Copy every planned blob, COPY_CONCURRENCY at a time; on any failure remove what was copied and throw. */
async function copyAll(plan: PlannedFile[]): Promise<string[]> {
  const urls: string[] = new Array(plan.length)
  let next = 0
  let failed: unknown = null
  const worker = async () => {
    while (!failed && next < plan.length) {
      const n = next++
      try {
        urls[n] = (await copy(plan[n].source.url, plan[n].pathname, { access: 'public', addRandomSuffix: false })).url
      } catch (err) {
        failed = err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(COPY_CONCURRENCY, plan.length) }, worker))
  if (failed) {
    const done = urls.filter(Boolean)
    if (done.length) await del(done).catch(() => undefined)
    throw new Error(`could not copy the photos: ${failed instanceof Error ? failed.message : String(failed)}`)
  }
  return urls
}

export type FiledPhoto = { filename: string; kind: IntakeAsset['kind']; caption: string; service: string | null; heroCandidate: boolean; beforeAfter: string | null; url: string }

export async function filePhotos(engagementId: string, photos: unknown, opts: { limit?: number } = {}): Promise<{ client: string; filed: FiledPhoto[] }> {
  const loaded = await loadIntake(engagementId)
  if (!loaded) throw new Error(`no client with id ${engagementId}`)
  const messages = await inboxMessages()
  const inbox: ChatAttachment[] = messages.flatMap((m) => m.attachments)
  const plan = planFiling({ engagementId, intake: loaded.intake, photos, inbox, uuid: randomUUID, limit: opts.limit })

  // Copy everything first; on any failure, remove what was copied and stop.
  const copied = await copyAll(plan)

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
  for (const m of messages.filter((m) => m.attachments.some((a) => filedUrls.has(a.url)))) {
    await updateAttachments(m.id, (list) => list.map((a) => (filedUrls.has(a.url) ? { ...a, filedTo: engagementId } : a)))
  }
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

/**
 * file_photos all:true: every unfiled captioned photo (on messageIds when
 * given) onto one client, from the stored captions. Refused while a photo run
 * is still captioning photos in scope: the chief is woken when it ends.
 */
export async function fileAllPhotos(engagementId: string, messageIds?: string[]) {
  const loaded = await loadIntake(engagementId)
  if (!loaded) throw new Error(`no client with id ${engagementId}`)
  const scope = messageIds?.length ? new Set(messageIds) : null
  const entries = (await listInbox()).filter((e) => !scope || (e.messageId && scope.has(e.messageId)))
  if (!entries.length) throw new InvalidAttachments(scope ? 'no unfiled photos on those messages' : 'the inbox has no unfiled photos')
  const uncaptioned = entries.filter((e) => !e.caption).length
  const running = uncaptioned ? await activePhotoRun() : null
  if (running) throw new InvalidAttachments(`captioning is still running (${running.done} of ${running.total} done); you will be told when it finishes, then file them`)
  const plan = planAll(entries, loaded.intake)
  if (!plan.photos.length) throw new InvalidAttachments(`none of the ${entries.length} photos is captioned yet; start caption_photos first`)
  const res = await filePhotos(engagementId, plan.photos, { limit: plan.photos.length })
  return { ...res, uncaptioned: plan.uncaptioned, extraLogos: plan.extraLogos, hero: plan.hero, unmatchedServices: plan.unmatched }
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
