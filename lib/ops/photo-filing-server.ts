// ===========================================
// /admin/ops HQ: filing chat photos onto a client's intake (server only)
// ===========================================
// The chief's file_photos tool. The rules are in ./photo-filing (planFiling);
// this copies each inbox blob to ops-intake/{engagementId}/, appends the
// assets under the intake row lock (the same lock the intake page's uploads
// take, so the duplicate-name suffix holds against both), marks the chat
// attachments filed, deletes the inbox blobs and logs one OpsActivity note.
// fileAllPhotos is file_photos all:true: the list is built from the photo
// run's stored captions (planAll). A video's poster frames are copied and
// deleted with it, and a new heroVideo clears it on every other video
// (setHeroVideo sets it on one already filed). Also the ops sync's cleanup of
// unfiled inbox blobs.

import { randomUUID } from 'node:crypto'
import { copy, del, list } from '@vercel/blob'
import { db } from '@/lib/db'
import { uniqueFilename, type IntakeAsset } from './intake'
import { isOwnAssetUrl, loadIntake, updateIntake } from './intake-server'
import { INBOX_MAX_AGE_DAYS, INBOX_PREFIX, InvalidAttachments, attachmentUrls, filedNote, planAll, planFiling, type ChatAttachment, type PlannedFile } from './photo-filing'
import { inboxMessages, listInbox, updateAttachments } from './hq/inbox'
import { activePhotoRun } from './hq/photo'

const COPY_CONCURRENCY = 5

/**
 * Copy every planned blob (a video's frames too), COPY_CONCURRENCY at a time;
 * on any failure remove what was copied and throw. Returns the new URLs per
 * planned file: the file, then its frames in order.
 */
async function copyAll(plan: PlannedFile[]): Promise<string[][]> {
  const jobs = plan.flatMap((p, i) => [{ i, from: p.source.url, to: p.pathname }, ...p.frames.map((f) => ({ i, from: f.from, to: f.pathname }))])
  const urls: string[] = new Array(jobs.length)
  let next = 0
  let failed: unknown = null
  const worker = async () => {
    while (!failed && next < jobs.length) {
      const n = next++
      try {
        urls[n] = (await copy(jobs[n].from, jobs[n].to, { access: 'public', addRandomSuffix: false })).url
      } catch (err) {
        failed = err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(COPY_CONCURRENCY, jobs.length) }, worker))
  if (failed) {
    const done = urls.filter(Boolean)
    if (done.length) await del(done).catch(() => undefined)
    throw new Error(`could not copy the photos: ${failed instanceof Error ? failed.message : String(failed)}`)
  }
  return plan.map((_, i) => jobs.flatMap((j, n) => (j.i === i ? [urls[n]] : [])))
}

export type FiledPhoto = { filename: string; kind: IntakeAsset['kind']; caption: string; service: string | null; heroCandidate: boolean; beforeAfter: string | null; url: string; happens?: string | null; heroVideo?: boolean }

export async function filePhotos(engagementId: string, photos: unknown, opts: { limit?: number } = {}): Promise<{ client: string; filed: FiledPhoto[] }> {
  const loaded = await loadIntake(engagementId)
  if (!loaded) throw new Error(`no client with id ${engagementId}`)
  const messages = await inboxMessages()
  const inbox: ChatAttachment[] = messages.flatMap((m) => m.attachments)
  const plan = planFiling({ engagementId, intake: loaded.intake, photos, inbox, uuid: randomUUID, limit: opts.limit })

  // Copy everything first; on any failure, remove what was copied and stop.
  const copied = await copyAll(plan)

  const replacingLogo = plan.some((p) => p.asset.kind === 'logo')
  const newHeroVideo = plan.some((p) => p.asset.heroVideo)
  let oldLogos: string[] = []
  let assets: IntakeAsset[] = []
  try {
    await updateIntake(engagementId, (cur) => {
      const kept = (cur.assets ?? []).filter((a) => !(replacingLogo && a.kind === 'logo')).map((a) => (newHeroVideo && a.heroVideo ? { ...a, heroVideo: undefined } : a))
      oldLogos = (cur.assets ?? []).filter((a) => replacingLogo && a.kind === 'logo').map((a) => a.url)
      // Suffixes again under the lock: an intake-page upload may have landed since the plan.
      const taken = kept.map((a) => a.filename)
      assets = plan.map((p, n) => {
        const filename = uniqueFilename(p.source.filename, taken)
        taken.push(filename)
        const [url, ...frameUrls] = copied[n]
        if (p.asset.kind !== 'video') return { ...p.asset, filename, url }
        const frames = p.frames.map((f, i) => ({ url: frameUrls[i], time: f.time }))
        // The poster keeps its place among the frames (the middle one unless the upload said otherwise).
        const posterAt = p.source.frames?.findIndex((f) => f.url === p.source.posterUrl) ?? -1
        const posterUrl = frames[posterAt >= 0 ? posterAt : Math.min(1, frames.length - 1)]?.url
        return { ...p.asset, filename, url, frames, ...(posterUrl ? { posterUrl } : {}) }
      })
      return { ...cur, assets: [...kept, ...assets], updatedAt: new Date().toISOString() }
    })
  } catch (err) {
    await del(copied.flat()).catch(() => undefined)
    throw err
  }

  const filedUrls = new Set(plan.map((p) => p.source.url))
  for (const m of messages.filter((m) => m.attachments.some((a) => filedUrls.has(a.url)))) {
    await updateAttachments(m.id, (list) => list.map((a) => (filedUrls.has(a.url) ? { ...a, filedTo: engagementId } : a)))
  }
  await del([...plan.flatMap((p) => attachmentUrls(p.source)), ...oldLogos.filter((u) => isOwnAssetUrl(u, engagementId))]).catch((err) =>
    console.error('[hq/file_photos] could not delete inbox blobs:', err instanceof Error ? err.message : err)
  )
  await db.opsActivity.create({ data: { engagementId, kind: 'note', body: filedNote(assets.length, assets.filter((a) => a.kind === 'video').length) } })

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
      ...(a.kind === 'video' ? { happens: a.happens ?? null, heroVideo: Boolean(a.heroVideo) } : {}),
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

/**
 * set_hero_video: mark one of the client's filed videos as the site hero (by
 * filename, case-insensitive), clearing it on every other video; null clears
 * it. Only when Jacob says so.
 */
export async function setHeroVideo(engagementId: string, filename: string | null): Promise<{ client: string; heroVideo: string | null; videos: string[] }> {
  const loaded = await loadIntake(engagementId)
  if (!loaded) throw new Error(`no client with id ${engagementId}`)
  const want = filename?.trim().toLowerCase() || null
  const videos = (loaded.intake.assets ?? []).filter((a) => a.kind === 'video')
  if (want && !videos.some((v) => v.filename.toLowerCase() === want)) {
    throw new InvalidAttachments(videos.length ? `no video named ${filename} on file; the videos are: ${videos.map((v) => v.filename).join(', ')}` : 'this client has no videos on file; file one first')
  }
  let hero: string | null = null
  await updateIntake(engagementId, (cur) => ({
    ...cur,
    assets: (cur.assets ?? []).map((a) => {
      if (a.kind !== 'video') return a
      const on = want !== null && a.filename.toLowerCase() === want
      if (on) hero = a.filename
      return { ...a, heroVideo: on || undefined }
    }),
    updatedAt: new Date().toISOString(),
  }))
  await db.opsActivity.create({ data: { engagementId, kind: 'note', body: hero ? `Hero video: ${hero}` : 'Hero video cleared' } })
  return { client: loaded.name, heroVideo: hero, videos: videos.map((v) => v.filename) }
}
