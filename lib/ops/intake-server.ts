// ===========================================
// /admin/ops: intake reads and writes (server only)
// ===========================================
// Every write locks the engagement row (SELECT ... FOR UPDATE) so parallel
// photo uploads cannot overwrite each other's asset entries.

import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { BlobNotFoundError, del, head } from '@vercel/blob'
import { db } from '@/lib/db'
import { BadRequest, oneOf, optionalString, readJsonObject, rejectUnknownKeys } from './validate'
import {
  MAX_SOURCE_BYTES,
  MAX_VIDEO_BYTES,
  UPLOAD_TYPES,
  isVideoName,
  mergeIntake,
  readIntake,
  readVideoFields,
  uniqueFilename,
  type Intake,
  type IntakeAsset,
  type UploadKind,
} from './intake'

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

// ── Shared by the admin asset routes and the client's intake link ───────────
// One implementation of "check an upload token request" and "register an
// uploaded file", so the public link (lib/ops/client-intake-server.ts) can
// never drift from the admin rules. The admin routes call these with their
// own defaults, which reproduce exactly what they did inline before.

/** The token options for one browser upload, or a thrown Error with the reason. */
export function uploadTokenOptions(
  engagementId: string,
  pathname: string,
  clientPayload: string | null,
  allowedKinds: readonly UploadKind[] = ['photo', 'logo', 'document']
): { allowedContentTypes: string[]; maximumSizeInBytes: number; addRandomSuffix: false } {
  if (!pathname.startsWith(assetPrefix(engagementId))) throw new Error('upload path is not this client')
  const kind = (JSON.parse(clientPayload || '{}') as { kind?: string }).kind
  const types = UPLOAD_TYPES[kind as keyof typeof UPLOAD_TYPES]
  if (!types || !allowedKinds.includes(kind as UploadKind)) {
    throw new Error(`kind must be ${allowedKinds.length === 3 ? 'photo, logo or document' : allowedKinds.join(' or ')}`)
  }
  return { allowedContentTypes: types, maximumSizeInBytes: isVideoName(pathname) ? MAX_VIDEO_BYTES : MAX_SOURCE_BYTES, addRandomSuffix: false }
}

const ASSET_BODY_KEYS = ['url', 'filename', 'kind', 'width', 'height', 'caption', 'heroCandidate', 'service', 'beforeAfter', 'frames', 'posterUrl', 'duration', 'codec', 'bytes']

/** An optional pixel size: a whole number from 1 to 50000, or left out. */
function pixels(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 50_000) throw new BadRequest(`${field} must be a whole number of pixels`)
  return v
}

export type RegisterOptions = {
  /** Kinds this caller may register. Admin: photo, logo, document, video. */
  kinds?: readonly ('photo' | 'logo' | 'document' | 'video')[]
  /** Body keys this caller may send. Admin: all of ASSET_BODY_KEYS. */
  keys?: readonly string[]
  /** Refuse once the client already holds this many files. Admin: no cap. */
  maxFiles?: number
  /** Stamped on the asset (the client link sets client_link). */
  via?: IntakeAsset['via']
}

/**
 * Register one uploaded file on the client's intake: the checks and the write
 * the admin POST .../assets route has always done. Throws BadRequest for a bad
 * body and Error('Engagement not found') for an unknown client.
 */
export async function registerIntakeAsset(id: string, rawBody: unknown, opts: RegisterOptions = {}): Promise<{ asset: IntakeAsset; intake: Intake }> {
  const body = readJsonObject(rawBody)
  rejectUnknownKeys(body, opts.keys ?? ASSET_BODY_KEYS)
  const url = typeof body.url === 'string' ? body.url : ''
  if (!isOwnAssetUrl(url, id)) throw new BadRequest('url is not an upload for this client')
  const filename = optionalString(body.filename, 'filename', 200) ?? url.split('/').pop()!
  if (/\.(heic|heif)$/i.test(filename)) throw new BadRequest(HEIC_MESSAGE)
  const kind = oneOf(body.kind, (opts.kinds ?? ['photo', 'logo', 'document', 'video']) as readonly ('photo' | 'logo' | 'document' | 'video')[], 'kind')
  if ((kind === 'video') !== isVideoName(url)) throw new BadRequest(kind === 'video' ? 'a video must be an MP4, MOV or WebM file' : 'a video must be registered as kind video')
  const video =
    kind === 'video'
      ? readVideoFields(body, url, (u) => isOwnAssetUrl(u, id), (m) => {
          throw new BadRequest(m)
        })
      : null
  const width = pixels(body.width, 'width')
  const height = pixels(body.height, 'height')
  try {
    await Promise.all([url, ...(video?.frames ?? []).map((f) => f.url)].map((u) => head(u)))
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new BadRequest('That file is not in storage; upload it again')
    throw err
  }
  const asset: IntakeAsset = {
    id: randomUUID(),
    url,
    filename,
    kind,
    ...(width && height ? { width, height } : {}),
    ...(optionalString(body.caption, 'caption', 300) ? { caption: optionalString(body.caption, 'caption', 300)! } : {}),
    ...(body.heroCandidate === true && kind !== 'video' ? { heroCandidate: true } : {}),
    ...(video ?? {}),
    ...(optionalString(body.service, 'service', 200) ? { service: optionalString(body.service, 'service', 200)! } : {}),
    ...(body.beforeAfter === 'before' || body.beforeAfter === 'after' ? { beforeAfter: body.beforeAfter } : {}),
    ...(opts.via ? { via: opts.via } : {}),
    uploadedAt: new Date().toISOString(),
  }
  let replaced: string[] = []
  const intake = await updateIntake(id, (cur) => {
    if (opts.maxFiles !== undefined && (cur.assets ?? []).length >= opts.maxFiles) throw new BadRequest(`This client already has ${opts.maxFiles} files; no more can be added here`)
    const others = (cur.assets ?? []).filter((a) => !(kind === 'logo' && a.kind === 'logo'))
    replaced = (cur.assets ?? []).filter((a) => kind === 'logo' && a.kind === 'logo').map((a) => a.url)
    asset.filename = uniqueFilename(filename, others.map((a) => a.filename))
    return { ...cur, assets: [...others, asset], updatedAt: new Date().toISOString() }
  })
  if (replaced.length) await del(replaced).catch(() => undefined)
  return { asset, intake }
}
