// ===========================================
// /admin/ops HQ: photos dropped into the chief's chat
// ===========================================
// Pure and client-safe. Jacob drops photos on the HQ composer; they go
// browser-direct to Vercel Blob under ops-inbox/ (the same preparation as the
// intake page) and ride on his OpsMessage as attachments. The chief sees them
// and files them onto a client's intake with file_photos, which copies each
// blob to ops-intake/{engagementId}/ and appends it to intake.assets.
// This file holds the rules both sides share: what an attachment is, what the
// message route accepts, the file_photos schema, and the filing plan
// (duplicate-name suffixes, service matching, one hero per call).

import { MAX_SOURCE_BYTES, safeBlobName, uniqueFilename, type Intake, type IntakeAsset } from './intake'

export const INBOX_PREFIX = 'ops-inbox/'
/** Unfiled inbox blobs older than this are removed by the ops sync. */
export const INBOX_MAX_AGE_DAYS = 7
export const MAX_ATTACHMENTS = 20

export type ChatAttachment = {
  url: string
  filename: string
  width: number | null
  height: number | null
  bytes: number
  /** The engagement it was filed onto; set by file_photos. */
  filedTo?: string
}

/** The Blob path for one composer upload. */
export const inboxPath = (uuid: string, filename: string) => `${INBOX_PREFIX}${uuid}-${safeBlobName(filename)}`

/** A public Blob URL directly under ops-inbox/. */
export function isInboxUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') && /^\/ops-inbox\/[^/]+$/.test(u.pathname)
  } catch {
    return false
  }
}

/** Read whatever is stored on OpsMessage.attachments (bad shapes become empty). */
export function readAttachments(v: unknown): ChatAttachment[] {
  if (!Array.isArray(v)) return []
  return v.filter((a): a is ChatAttachment => Boolean(a) && typeof a === 'object' && typeof (a as ChatAttachment).url === 'string')
}

export class InvalidAttachments extends Error {}

const pixels = (v: unknown, field: string, n: number): number | null => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 50_000) throw new InvalidAttachments(`attachments[${n}].${field} must be a whole number of pixels`)
  return v
}

/**
 * The message route's body: { body?, attachments? }. Text is optional when
 * photos come along ("these are Enio's" can follow later); one of the two is
 * required. Every attachment must be a public Blob URL under ops-inbox/.
 */
export function parseChatMessage(raw: Record<string, unknown>): { text: string; attachments: ChatAttachment[] } {
  const unknown = Object.keys(raw).filter((k) => k !== 'body' && k !== 'attachments')
  if (unknown.length) throw new InvalidAttachments(`Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
  if (raw.body !== undefined && raw.body !== null && typeof raw.body !== 'string') throw new InvalidAttachments('body must be a string')
  const text = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (text.length > 10_000) throw new InvalidAttachments('body is longer than 10000 characters')
  const list = raw.attachments === undefined || raw.attachments === null ? [] : raw.attachments
  if (!Array.isArray(list)) throw new InvalidAttachments('attachments must be a list')
  if (list.length > MAX_ATTACHMENTS) throw new InvalidAttachments(`at most ${MAX_ATTACHMENTS} attachments per message`)
  const seen = new Set<string>()
  const attachments = list.map((a, n): ChatAttachment => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw new InvalidAttachments(`attachments[${n}] must be an object`)
    const o = a as Record<string, unknown>
    const extra = Object.keys(o).filter((k) => !['url', 'filename', 'width', 'height', 'bytes'].includes(k))
    if (extra.length) throw new InvalidAttachments(`attachments[${n}] has unknown fields: ${extra.join(', ')}`)
    const url = typeof o.url === 'string' ? o.url : ''
    if (!isInboxUrl(url)) throw new InvalidAttachments(`attachments[${n}].url is not an HQ inbox upload`)
    if (seen.has(url)) throw new InvalidAttachments(`attachments[${n}] is a duplicate`)
    seen.add(url)
    const filename = typeof o.filename === 'string' ? o.filename.trim() : ''
    if (!filename || filename.length > 200) throw new InvalidAttachments(`attachments[${n}].filename is required (200 characters at most)`)
    const bytes = o.bytes
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1 || bytes > MAX_SOURCE_BYTES) throw new InvalidAttachments(`attachments[${n}].bytes must be the file size`)
    return { url, filename, width: pixels(o.width, 'width', n), height: pixels(o.height, 'height', n), bytes }
  })
  if (!text && attachments.length === 0) throw new InvalidAttachments('body or attachments is required')
  return { text, attachments }
}

// ── file_photos ─────────────────────────────────────────────────────────────

export const FILE_PHOTOS_TOOL = {
  name: 'file_photos',
  description:
    "File photos Jacob dropped in this chat onto one client's intake, the way the intake page does by hand: each is copied to the client's files and added to intake.assets with your caption. Only for a client that exists (engagementId from get_board) and only after Jacob said whose they are. url is the attachment's url exactly as listed in his message. caption: what is in the frame and which service it shows, from what you see; never a town, street, customer or job you were not told. service: one of the client's intake service names exactly, or leave it out when unsure. heroCandidate on at most one photo per call. beforeAfter only when the pair is obvious. kind logo for the business logo (it replaces any logo on file). Never writes or changes the brief.",
  input_schema: {
    type: 'object',
    properties: {
      engagementId: { type: 'string', description: 'The client id from get_board.' },
      photos: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_ATTACHMENTS,
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The attachment url from the chat, exactly.' },
            filename: { type: 'string', description: 'The attachment filename from the chat.' },
            caption: { type: 'string', description: 'One short line: what the photo shows.' },
            service: { type: 'string', description: "One of the client's intake service names, exactly. Leave out when unsure." },
            heroCandidate: { type: 'boolean', description: 'At most one per call.' },
            beforeAfter: { type: 'string', enum: ['before', 'after'] },
            kind: { type: 'string', enum: ['photo', 'logo'] },
          },
          required: ['url', 'filename', 'caption', 'heroCandidate', 'kind'],
        },
      },
    },
    required: ['engagementId', 'photos'],
  },
} as const

export type PlannedFile = {
  source: ChatAttachment
  /** Target path in Blob (ops-intake/{engagementId}/{uuid}-{name}). */
  pathname: string
  asset: Omit<IntakeAsset, 'url'>
}

/**
 * Check a file_photos call against the client's intake and the unfiled chat
 * attachments, and plan every copy. Throws InvalidAttachments with a message
 * the chief can act on; nothing is copied unless the whole call is valid.
 */
export function planFiling(opts: {
  engagementId: string
  intake: Intake
  photos: unknown
  inbox: ChatAttachment[]
  uuid: () => string
  now?: Date
}): PlannedFile[] {
  const { engagementId, intake, inbox } = opts
  const now = (opts.now ?? new Date()).toISOString()
  if (!Array.isArray(opts.photos) || opts.photos.length === 0) throw new InvalidAttachments('photos must be a non-empty list')
  if (opts.photos.length > MAX_ATTACHMENTS) throw new InvalidAttachments(`at most ${MAX_ATTACHMENTS} photos per call`)
  const byUrl = new Map(inbox.filter((a) => !a.filedTo).map((a) => [a.url, a]))
  const services = (intake.services ?? []).map((s) => s.name).filter(Boolean)
  const canonical = new Map(services.map((s) => [s.trim().toLowerCase(), s]))
  const photos = opts.photos as Record<string, unknown>[]

  if (photos.filter((p) => p?.heroCandidate === true).length > 1) throw new InvalidAttachments('heroCandidate on at most one photo per call')
  if (photos.filter((p) => p?.kind === 'logo').length > 1) throw new InvalidAttachments('at most one logo per call')

  const replacingLogo = photos.some((p) => p?.kind === 'logo')
  const taken = (intake.assets ?? []).filter((a) => !(replacingLogo && a.kind === 'logo')).map((a) => a.filename)
  const seen = new Set<string>()

  return photos.map((p, n) => {
    if (!p || typeof p !== 'object') throw new InvalidAttachments(`photos[${n}] must be an object`)
    const url = typeof p.url === 'string' ? p.url.trim() : ''
    const source = byUrl.get(url)
    if (!source) throw new InvalidAttachments(`photos[${n}].url is not an unfiled photo from this chat`)
    if (seen.has(url)) throw new InvalidAttachments(`photos[${n}] is listed twice`)
    seen.add(url)
    const kind = p.kind === 'logo' ? 'logo' : p.kind === 'photo' ? 'photo' : null
    if (!kind) throw new InvalidAttachments(`photos[${n}].kind must be photo or logo`)
    const caption = typeof p.caption === 'string' ? p.caption.trim() : ''
    if (!caption) throw new InvalidAttachments(`photos[${n}].caption is required`)
    if (caption.length > 300) throw new InvalidAttachments(`photos[${n}].caption is longer than 300 characters`)
    let service: string | undefined
    if (p.service !== undefined && p.service !== null && String(p.service).trim()) {
      service = canonical.get(String(p.service).trim().toLowerCase())
      if (!service) {
        throw new InvalidAttachments(
          services.length
            ? `photos[${n}].service "${p.service}" is not one of this client's services (${services.join(', ')}); use one exactly or leave it out`
            : `photos[${n}].service: this client has no services in its intake; leave it out`
        )
      }
    }
    if (p.beforeAfter !== undefined && p.beforeAfter !== null && p.beforeAfter !== 'before' && p.beforeAfter !== 'after') {
      throw new InvalidAttachments(`photos[${n}].beforeAfter must be before or after`)
    }
    const filename = uniqueFilename(source.filename, taken)
    taken.push(filename)
    const id = opts.uuid()
    return {
      source,
      pathname: `ops-intake/${engagementId}/${id}-${safeBlobName(source.filename)}`,
      asset: {
        id,
        filename,
        kind,
        caption,
        ...(kind === 'photo' && p.heroCandidate === true ? { heroCandidate: true } : {}),
        ...(kind === 'photo' && service ? { service } : {}),
        ...(kind === 'photo' && (p.beforeAfter === 'before' || p.beforeAfter === 'after') ? { beforeAfter: p.beforeAfter } : {}),
        ...(source.width && source.height ? { width: source.width, height: source.height } : {}),
        uploadedAt: now,
      },
    }
  })
}

/** "Filed 6 photos from chat" (the logo counts as one of them). */
export const filedNote = (n: number) => `Filed ${n} photo${n === 1 ? '' : 's'} from chat`
