// ===========================================
// /admin/ops HQ: photos dropped into the chief's chat
// ===========================================
// Pure and client-safe. Jacob drops photos on the HQ composer; they go
// browser-direct to Vercel Blob under ops-inbox/ (the same preparation as the
// intake page) and ride on his OpsMessage as attachments. The chief sees them
// and files them onto a client's intake with file_photos, which copies each
// blob to ops-intake/{engagementId}/ and appends it to intake.assets.
// This file holds the rules both sides share: what an attachment is, what the
// message route accepts, the file_photos schema, the filing plan
// (duplicate-name suffixes, service matching, one hero per call), and for
// batches: the inbox across messages, the photo run's captions on each entry,
// and file_photos all:true built from those captions.

import { MAX_SOURCE_BYTES, safeBlobName, uniqueFilename, type Intake, type IntakeAsset } from './intake'

export const INBOX_PREFIX = 'ops-inbox/'
/** Unfiled inbox blobs older than this are removed by the ops sync. */
export const INBOX_MAX_AGE_DAYS = 7
/** Photos one message can carry (one composer drop). */
export const MAX_ATTACHMENTS = 200
/** Photos one explicit file_photos call can list. all:true has no such limit. */
export const MAX_FILE_PER_CALL = 20
/** More photos than this on one message: the chief sees a count and the first few, and a photo run captions them. */
export const BATCH_THRESHOLD = 6
export const isBatch = (photos: number) => photos > BATCH_THRESHOLD

export type ChatAttachment = {
  url: string
  filename: string
  width: number | null
  height: number | null
  bytes: number
  /** The engagement it was filed onto; set by file_photos. */
  filedTo?: string
} & Partial<PhotoCaption>

/** What the photo run writes onto an inbox entry. */
export type PhotoCaption = {
  /** What is in the frame, 10 to 20 words; never a town or job it was not told. */
  caption: string
  /** Free text; file_photos all:true maps it onto the client's services by name. */
  suggestedService: string | null
  /** 0 to 5: how well it would work as the site's hero image. */
  heroScore: number
  beforeAfter: 'before' | 'after' | null
  isLogo: boolean
  /** A face or a licence plate: never the hero, never a service image. */
  hasFaceOrPlate: boolean
  captionedAt: string
}

export const isCaptioned = (a: ChatAttachment) => typeof a.caption === 'string' && a.caption.trim().length > 0

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
    "File photos Jacob dropped in this chat onto one client's intake, the way the intake page does by hand: each is copied to the client's files and added to intake.assets with your caption. Only for a client that exists (engagementId from get_board) and only after Jacob said whose they are. url is the attachment's url exactly as listed in his message. caption: what is in the frame and which service it shows, from what you see; never a town, street, customer or job you were not told. service: one of the client's intake service names exactly, or leave it out when unsure. heroCandidate on at most one photo per call. beforeAfter only when the pair is obvious. kind logo for the business logo (it replaces any logo on file). Never writes or changes the brief. For a batch the photo run captioned (list_inbox shows them), pass all: true instead of photos: it files every unfiled captioned photo with the stored captions, maps each suggested service onto the client's services by name (unmatched stays blank), picks the single best hero (none when the client already has one; never a photo with a face or plate) and files the logo as kind logo. When the inbox holds drops for more than one client, scope it with messageIds.",
  input_schema: {
    type: 'object',
    properties: {
      engagementId: { type: 'string', description: 'The client id from get_board.' },
      all: { type: 'boolean', description: 'true: file every unfiled captioned photo in the inbox (or in messageIds) for this client, from the stored captions. Leave photos out.' },
      messageIds: { type: 'array', items: { type: 'string' }, description: 'all: true only: just the photos on these messages (ids from list_inbox).' },
      photos: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_FILE_PER_CALL,
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
    required: ['engagementId'],
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
  /** Most photos in one call (default MAX_FILE_PER_CALL); all:true passes the batch size. */
  limit?: number
}): PlannedFile[] {
  const { engagementId, intake, inbox } = opts
  const now = (opts.now ?? new Date()).toISOString()
  if (!Array.isArray(opts.photos) || opts.photos.length === 0) throw new InvalidAttachments('photos must be a non-empty list')
  const limit = opts.limit ?? MAX_FILE_PER_CALL
  if (opts.photos.length > limit) throw new InvalidAttachments(`at most ${limit} photos per call; for a whole batch use all: true`)
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

// ── Batches: the inbox, captions, file_photos all:true ───────────────────────

/** One unfiled photo in the inbox. messageId null: uploaded to Blob but never sent on a message. */
export type InboxEntry = ChatAttachment & { messageId: string | null; uploadedAt: string }

/**
 * Every unfiled photo across Jacob's messages and the Blob inbox: entries on
 * messages (newest message wins a url that appears twice), then blobs no
 * message mentions at all (a drop whose send failed). Older than
 * INBOX_MAX_AGE_DAYS is left out: the sync deletes those blobs.
 */
export function collectInbox(
  messages: { id: string; createdAt: Date; attachments: ChatAttachment[] }[],
  blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[],
  now = new Date()
): InboxEntry[] {
  const cutoff = now.getTime() - INBOX_MAX_AGE_DAYS * 86_400_000
  const mentioned = new Set<string>()
  const seen = new Set<string>()
  const out: InboxEntry[] = []
  for (const m of [...messages].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    for (const a of m.attachments) {
      mentioned.add(a.url)
      if (a.filedTo || seen.has(a.url) || m.createdAt.getTime() < cutoff) continue
      seen.add(a.url)
      out.push({ ...a, messageId: m.id, uploadedAt: m.createdAt.toISOString() })
    }
  }
  const orphans = blobs
    .filter((b) => !mentioned.has(b.url) && b.uploadedAt.getTime() >= cutoff && isInboxUrl(b.url))
    .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
    .map((b): InboxEntry => ({ url: b.url, filename: orphanFilename(b.pathname), width: null, height: null, bytes: b.size, messageId: null, uploadedAt: b.uploadedAt.toISOString() }))
  // Oldest drop first, in the order Jacob dropped them.
  const byDrop = out.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
  return [...byDrop, ...orphans]
}

/** "ops-inbox/<uuid>-img_7009.jpg" → "img_7009.jpg" (the uuid prefix is 36 characters). */
export function orphanFilename(pathname: string): string {
  const name = pathname.split('/').pop() ?? pathname
  return /^[0-9a-f-]{36}-/i.test(name) ? name.slice(37) : name
}

const WORDS_MAX = 20

/** Clean one model result into a stored caption, or null when it is unusable. */
export function cleanCaption(raw: Record<string, unknown>, now: Date): PhotoCaption | null {
  const words = String(raw.caption ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length < 3) return null
  const score = Math.round(Number(raw.heroScore))
  const service = typeof raw.suggestedService === 'string' ? raw.suggestedService.trim().slice(0, 80) : ''
  return {
    caption: words.slice(0, WORDS_MAX).join(' '),
    suggestedService: service || null,
    heroScore: Number.isFinite(score) ? Math.min(5, Math.max(0, score)) : 0,
    beforeAfter: raw.beforeAfter === 'before' || raw.beforeAfter === 'after' ? raw.beforeAfter : null,
    isLogo: raw.isLogo === true,
    hasFaceOrPlate: raw.hasFaceOrPlate === true,
    captionedAt: now.toISOString(),
  }
}

/** Write captions onto a message's attachments by url (filed ones are left alone). */
export function applyCaptions(list: ChatAttachment[], captions: Map<string, PhotoCaption>): ChatAttachment[] {
  return list.map((a) => (captions.has(a.url) && !a.filedTo ? { ...a, ...captions.get(a.url)! } : a))
}

/**
 * Caption entries in chunks; each chunk's results are saved before the next
 * chunk is asked for, so a crash keeps what was done. Returns how many were
 * saved and which urls the model gave nothing usable for.
 */
export async function captionInChunks(opts: {
  entries: InboxEntry[]
  chunkSize: number
  caption: (chunk: InboxEntry[]) => Promise<Map<string, PhotoCaption>>
  save: (captions: Map<string, PhotoCaption>) => Promise<void>
  progress?: (done: number, total: number) => Promise<void> | void
  stopped?: () => Promise<boolean>
}): Promise<{ done: number; missed: string[]; stopped: boolean }> {
  let done = 0
  const missed: string[] = []
  for (let i = 0; i < opts.entries.length; i += opts.chunkSize) {
    if (opts.stopped && (await opts.stopped())) return { done, missed, stopped: true }
    const chunk = opts.entries.slice(i, i + opts.chunkSize)
    const captions = await opts.caption(chunk)
    if (captions.size) await opts.save(captions)
    done += captions.size
    for (const e of chunk) if (!captions.has(e.url)) missed.push(e.url)
    await opts.progress?.(done, opts.entries.length)
  }
  return { done, missed, stopped: false }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const GENERIC = new Set(['service', 'services', 'work', 'with', 'and', 'the', 'home', 'residential', 'commercial'])
const words = (s: string) => norm(s).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w))

/**
 * A suggested service onto one of the client's services by name: exact, else
 * the one service whose name contains it (or it contains), else the one
 * service sharing a word with it ("Roofline lighting" → "Permanent Lighting").
 * Two candidates at a step: blank.
 */
export function matchService(suggested: string | null | undefined, services: string[]): string | undefined {
  if (!suggested) return undefined
  const s = norm(suggested)
  if (!s) return undefined
  const exact = services.find((x) => norm(x) === s)
  if (exact) return exact
  const near = services.filter((x) => {
    const n = norm(x)
    return n && (n.includes(s) || s.includes(n))
  })
  if (near.length) return near.length === 1 ? near[0] : undefined
  const mine = new Set(words(suggested))
  const shared = services.filter((x) => words(x).some((w) => mine.has(w)))
  return shared.length === 1 ? shared[0] : undefined
}

const ORDER = { after: 0, none: 1, before: 2 } as const

/** One photo as file_photos lists it. */
export type PhotoInput = { url: string; filename: string; caption: string; service?: string; heroCandidate: boolean; beforeAfter?: 'before' | 'after'; kind: 'photo' | 'logo' }

/**
 * file_photos all:true: the photos list planFiling takes, built from the stored
 * captions. After photos go before before photos; one hero for the client
 * (none when the intake already has one, never a face or plate); the first
 * logo is kind logo and any other logo is left in the inbox.
 */
export function planAll(entries: InboxEntry[], intake: Intake): {
  photos: PhotoInput[]
  uncaptioned: number
  extraLogos: string[]
  hero: string | null
  unmatched: string[]
} {
  const services = (intake.services ?? []).map((s) => s.name).filter(Boolean)
  const captioned = entries.filter(isCaptioned)
  const logos = captioned.filter((e) => e.isLogo)
  const logo = logos[0] ?? null
  const photos = captioned.filter((e) => !e.isLogo)
  const hasHero = (intake.assets ?? []).some((a) => a.heroCandidate)
  let hero: InboxEntry | null = null
  if (!hasHero) for (const e of photos) if (!e.hasFaceOrPlate && (e.heroScore ?? 0) > 0 && (!hero || (e.heroScore ?? 0) > (hero.heroScore ?? 0))) hero = e
  const unmatched: string[] = []
  const rank = (e: InboxEntry) => ORDER[e.beforeAfter ?? 'none']
  const ordered = photos.map((e, n) => ({ e, n })).sort((a, b) => rank(a.e) - rank(b.e) || a.n - b.n).map((x) => x.e)
  const out = ordered.map((e): PhotoInput => {
    const service = e.hasFaceOrPlate ? undefined : matchService(e.suggestedService, services)
    if (!e.hasFaceOrPlate && e.suggestedService && !service) unmatched.push(e.suggestedService)
    return {
      url: e.url,
      filename: e.filename,
      caption: e.caption!,
      ...(service ? { service } : {}),
      heroCandidate: e === hero,
      ...(e.beforeAfter ? { beforeAfter: e.beforeAfter } : {}),
      kind: 'photo',
    }
  })
  if (logo) out.push({ url: logo.url, filename: logo.filename, caption: logo.caption!, heroCandidate: false, kind: 'logo' })
  return {
    photos: out,
    uncaptioned: entries.length - captioned.length,
    extraLogos: logos.slice(1).map((l) => l.filename),
    hero: hero?.filename ?? null,
    unmatched: Array.from(new Set(unmatched)),
  }
}

/** list_inbox's answer: counts per drop, then the first limit entries as lines. Never images. */
export function inboxText(entries: InboxEntry[], limit: number, running: { done: number; total: number } | null): { text: string; counts: { unfiled: number; captioned: number; uncaptioned: number; unsent: number } } {
  const captioned = entries.filter(isCaptioned).length
  const unsent = entries.filter((e) => !e.messageId).length
  const drops = new Map<string, InboxEntry[]>()
  for (const e of entries) drops.set(e.messageId ?? 'unsent', [...(drops.get(e.messageId ?? 'unsent') ?? []), e])
  const lines = [
    `${entries.length} unfiled photo${entries.length === 1 ? '' : 's'}: ${captioned} captioned, ${entries.length - captioned} not captioned.`,
    ...(running ? [`A photo run is captioning now: ${running.done} of ${running.total} done.`] : []),
    'Drops:',
    ...Array.from(drops, ([id, list]) =>
      id === 'unsent'
        ? `- unsent (uploaded but never sent on a message; caption_photos adopts them): ${list.length} photos, uploaded ${list[0].uploadedAt}`
        : `- messageId ${id}, sent ${list[0].uploadedAt}: ${list.length} photos, ${list.filter(isCaptioned).length} captioned`
    ),
    ...(entries.length ? [`First ${Math.min(limit, entries.length)}:`] : []),
    ...entries.slice(0, limit).map((e, n) => {
      const size = e.width && e.height ? ` ${e.width}x${e.height}` : ''
      if (!isCaptioned(e)) return `${n + 1}. ${e.filename}${size}: not captioned`
      const flags = [e.isLogo ? 'logo' : '', e.hasFaceOrPlate ? 'face or plate' : '', e.beforeAfter ?? ''].filter(Boolean).join(', ')
      return `${n + 1}. ${e.filename}${size}: "${e.caption}" service: ${e.suggestedService ?? '-'}, hero ${e.heroScore ?? 0}/5${flags ? `, ${flags}` : ''}`
    }),
  ]
  return { text: lines.join('\n'), counts: { unfiled: entries.length, captioned, uncaptioned: entries.length - captioned, unsent } }
}
