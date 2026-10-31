// ===========================================
// /admin/ops: a client's intake (answers, old site, photos, logo)
// ===========================================
// Pure and client-safe. Engagement.intake holds everything Jacob has for a
// site build: the client's answers, the old site and how to use it, and the
// files (Vercel Blob URLs). The intake page edits it, the chief reads and
// fills it, the brief is written from it, and the build gets its assets.
//
// The fields follow the onboarding questionnaire Jacob texts every client
// (docs/ops/onboarding-questionnaire.md, numbered 1 to 28); its table says
// which question lands where. Every key is optional and additive: mergeIntake merges the top-level keys
// (one level deep for objects; arrays are replaced whole) and never drops a
// key it was not given. Assets are only ever read from the engagement's own
// intake, never from a free-text URL list.

/**
 * gbp: an owner-posted photo from the Google Business Profile (lookup_gbp), with its attribution.
 * video: a clip as uploaded (never transcoded here); the build transcodes it (AA-Template's aa-build).
 */
export type IntakeAssetKind = 'logo' | 'photo' | 'document' | 'gbp' | 'video'
/** One poster frame the browser grabbed from a video before upload: a JPEG in Blob, and where in the clip it was taken. */
export type VideoFrame = { url: string; time: number }
export type IntakeAsset = {
  id: string
  url: string
  filename: string
  kind: IntakeAssetKind
  caption?: string
  heroCandidate?: boolean
  service?: string
  beforeAfter?: 'before' | 'after'
  /** gbp photos: who posted it on the profile (the business itself). */
  attribution?: string
  /** Pixel size, recorded by the browser upload (absent on older entries and gbp photos). */
  width?: number
  height?: number
  // ── video only ──
  /** The poster: one of frames (the middle one unless set otherwise). */
  posterUrl?: string
  /** Three frames: 1 second in, the middle, the last second (lib/ops/video-meta frameTimes). */
  frames?: VideoFrame[]
  /** Seconds. */
  duration?: number
  /** The sample entry as the container names it: hvc1, avc1, vp09... */
  codec?: string
  /** File size as uploaded. */
  bytes?: number
  /** One line: what happens in the clip (the Photo desk, or the chief). */
  happens?: string
  /** The clip the site's hero plays. At most one per client, and only when Jacob says so. */
  heroVideo?: boolean
  uploadedAt: string
}

export type OldSiteUse = 'verbatim' | 'facts_only' | 'ignore'

export type Intake = {
  business?: {
    legalName?: string
    displayName?: string
    trade?: string
    phone?: string
    email?: string
    serviceArea?: string[]
    hours?: string
    yearsInBusiness?: string
    licenses?: string
    languages?: string
    /** Q5: residential, commercial or both. */
    customerType?: string
    /** Q9: home base, for the Google listing; not shown publicly unless the client says so. */
    address?: string
    /** Q10: where they want the most jobs. */
    priorityArea?: string
    /** Q10: the farthest they will drive. */
    maxDistance?: string
    /** Q12: who picks up the phone. */
    whoAnswers?: string
    /** Q13: emergency or after-hours work, in their words. */
    emergency?: string
  }
  /** Q2 and Q4: moneyMaker marks the 2 or 3 they want more of. */
  services?: { name: string; description?: string; priceNote?: string; moneyMaker?: boolean; avgJobValue?: string }[]
  about?: string
  differentiators?: string[]
  /** Q8: a promo they would run. */
  offer?: string
  /** Q3, Q17 to Q19, Q21: what the ads are built from. */
  ads?: { exclusions?: string[]; accountEmail?: string; budgetMonthly?: number; goal?: string; seasons?: string; competitors?: string[] }
  /**
   * Q15 and Q16: the Google Business Profile and where the reviews are, plus
   * what lookup_gbp read from the profile (lib/ops/gbp.ts IntakeGbp). The
   * build receives it as GBP.json.
   */
  gbp?: {
    exists?: boolean
    verified?: boolean
    managerAccess?: boolean
    reviewCount?: string
    notes?: string
    placeId?: string
    name?: string
    address?: string | null
    phone?: string | null
    website?: string | null
    mapsUri?: string | null
    rating?: number | null
    userRatingCount?: number | null
    hours?: string[] | null
    primaryType?: string | null
    businessStatus?: string | null
    reviews?: { author: string; rating: number | null; text: string; publishTime: string | null; uri: string | null }[]
    lookedUpAt?: string
  }
  reviews?: { gbpUrl?: string; quotes?: { text: string; author: string }[] }
  oldSite?: { url?: string; use?: OldSiteUse; notes?: string }
  socials?: { facebook?: string; instagram?: string; yelp?: string; nextdoor?: string }
  /** Q23 and Q25. sitesLiked and brandColors are the build's names for referenceSites and colors; either is read. */
  style?: { referenceSites?: string[]; colors?: string[]; sitesLiked?: string[]; brandColors?: string[]; avoid?: string }
  domain?: { current?: string; wanted?: string; registrar?: string; ownerHasAccess?: boolean }
  assets?: IntakeAsset[]
  rawNotes?: string
  updatedAt?: string
}

export const INTAKE_KEYS = ['business', 'services', 'about', 'differentiators', 'offer', 'ads', 'gbp', 'reviews', 'oldSite', 'socials', 'style', 'domain', 'assets', 'rawNotes'] as const

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** Read whatever is stored as an Intake (bad shapes become empty). */
export function readIntake(v: unknown): Intake {
  return isObj(v) ? (v as Intake) : {}
}

/**
 * Merge a partial intake into the stored one. Top-level keys only, one level
 * deep for objects (so { business: { phone } } keeps the business name);
 * arrays are replaced whole. assets is never merged from a patch: it changes
 * only through the asset routes.
 */
export function mergeIntake(current: Intake, patch: Record<string, unknown>, now = new Date()): Intake {
  const out: Record<string, unknown> = { ...current }
  for (const key of INTAKE_KEYS) {
    if (key === 'assets' || !(key in patch)) continue
    const v = patch[key]
    out[key] = isObj(v) && isObj(out[key]) ? { ...(out[key] as Record<string, unknown>), ...v } : v
  }
  out.updatedAt = now.toISOString()
  return out as Intake
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null)

/** The five things a build cannot do without, and which are still empty. */
export function intakeMissing(i: Intake): string[] {
  const missing: string[] = []
  if (!filled(i.business?.phone)) missing.push('phone')
  if (!filled(i.services)) missing.push('services')
  if (!filled(i.business?.serviceArea)) missing.push('service area')
  if (!filled(i.about)) missing.push('about')
  if (!(i.assets ?? []).some((a) => a.kind === 'photo')) missing.push('photos')
  return missing
}

/** What get_client shows the chief: which parts are filled, counts, the old site. */
export function intakeSummary(i: Intake) {
  const photos = (i.assets ?? []).filter((a) => a.kind === 'photo')
  return {
    filled: INTAKE_KEYS.filter((k) => k !== 'assets' && filled(i[k as keyof Intake] as unknown)),
    missing: intakeMissing(i),
    photos: photos.length,
    heroCandidates: photos.filter((p) => p.heroCandidate).length,
    videos: (i.assets ?? []).filter((a) => a.kind === 'video').length,
    heroVideo: (i.assets ?? []).find((a) => a.kind === 'video' && a.heroVideo)?.filename ?? null,
    logo: (i.assets ?? []).some((a) => a.kind === 'logo'),
    gbpPhotos: (i.assets ?? []).filter((a) => a.kind === 'gbp').length,
    documents: (i.assets ?? []).filter((a) => a.kind === 'document').length,
    oldSite: i.oldSite?.url ? { url: i.oldSite.url, use: i.oldSite.use ?? 'facts_only' } : null,
    updatedAt: i.updatedAt ?? null,
  }
}

/** The asset list the build receives (no ids, no upload times). Videos carry their poster, frames and probe. */
export function payloadAssets(i: Intake) {
  return (i.assets ?? []).map((a) => ({
    url: a.url,
    kind: a.kind,
    filename: a.filename,
    caption: a.caption ?? null,
    heroCandidate: a.kind !== 'video' && Boolean(a.heroCandidate),
    service: a.service ?? null,
    beforeAfter: a.beforeAfter ?? null,
    attribution: a.attribution ?? null,
    ...(a.kind === 'video'
      ? {
          posterUrl: a.posterUrl ?? null,
          posterTime: a.frames?.find((f) => f.url === a.posterUrl)?.time ?? null,
          frames: a.frames ?? [],
          duration: a.duration ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
          codec: a.codec ?? null,
          bytes: a.bytes ?? null,
          happens: a.happens ?? null,
          heroVideo: Boolean(a.heroVideo),
        }
      : {}),
  }))
}

export function payloadOldSite(i: Intake) {
  return i.oldSite?.url ? { url: i.oldSite.url, use: i.oldSite.use ?? 'facts_only', notes: i.oldSite.notes ?? null } : null
}

/**
 * The brief's last two sections, written from the intake so the asset list in
 * the brief is always the engagement's own. Replaces any earlier copy of them
 * and leaves every other section where it was.
 */
export function withAssetSections(brief: string, i: Intake): string {
  // Drop any earlier Assets or Old site section, and only those: every other
  // section (Standards applied among them) keeps its place.
  const body = brief
    .split(/(?=^## )/m)
    .filter((part) => !/^## (Assets|Old site)\s*$/m.test(part.split('\n')[0]))
    .join('')
    .trimEnd()
  const rows = (i.assets ?? []).map((a) =>
    a.kind === 'video'
      ? `- video | ${a.url} | ${a.caption?.trim() || a.filename}${a.happens ? ` (${a.happens.trim()})` : ''}${a.duration ? `, ${Math.round(a.duration)}s` : ''} | ${a.heroVideo ? 'hero video' : '-'} | ${a.service || '-'} | ${a.beforeAfter || '-'}`
      : `- ${a.kind} | ${a.url} | ${a.caption?.trim() || a.filename} | ${a.heroCandidate ? 'hero candidate' : '-'} | ${a.service || '-'} | ${a.beforeAfter || '-'}`
  )
  const old = payloadOldSite(i)
  return [
    body,
    '',
    '## Assets',
    '',
    'kind | url | caption | heroCandidate (hero video for a video) | service | before/after',
    '',
    ...(rows.length ? rows : ['- none on file']),
    '',
    '## Old site',
    '',
    old ? `- ${old.url} | use: ${old.use}${old.notes ? ` | ${old.notes}` : ''}` : '- none',
    '',
  ].join('\n')
}

// ── Uploads (shared by the intake page and the asset routes) ────────────────
// The browser converts HEIC to JPEG and shrinks anything over UPLOAD_LONG_EDGE
// before the file goes straight to Vercel Blob; no file passes through a
// function body. These are the rules both sides agree on.

/** chat: the HQ composer, which takes photos, a logo and videos. */
export type UploadKind = 'photo' | 'logo' | 'document' | 'chat'

/** Biggest image or document the page will even try (before conversion). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024
/** Biggest video: uploaded as is (never transcoded in the browser). */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024
export const UPLOAD_LONG_EDGE = 2400
export const UPLOAD_JPEG_QUALITY = 0.85
export const UPLOAD_CONCURRENCY = 3

const RASTER = ['image/jpeg', 'image/png', 'image/webp']
const HEIC = ['image/heic', 'image/heif']
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** Content types the token allows per kind (what lands in Blob after conversion, plus HEIC). Photos and chat take videos too. */
export const UPLOAD_TYPES: Record<UploadKind, string[]> = {
  photo: [...RASTER, ...HEIC, ...VIDEO_TYPES],
  logo: [...RASTER, ...HEIC, 'image/svg+xml'],
  document: ['application/pdf', ...RASTER, ...HEIC, 'image/svg+xml'],
  chat: [...RASTER, ...HEIC, 'image/svg+xml', ...VIDEO_TYPES],
}

const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
}

/** The file's type, from the browser or (when the browser leaves it blank, as it often does for HEIC) the extension. */
export function fileType(name: string, type: string): string {
  const t = type.toLowerCase()
  if (t && t !== 'application/octet-stream') return t === 'image/jpg' ? 'image/jpeg' : t
  return EXT_TYPE[name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

export const isHeic = (type: string) => HEIC.includes(type)
export const isVideoType = (type: string) => VIDEO_TYPES.includes(type)
/** A Blob path or filename that names a video, by its extension. */
export const isVideoName = (name: string) => /\.(mp4|m4v|mov|qt|webm)$/i.test(name)
/** The size cap for one file of this type. */
export const maxBytesFor = (type: string) => (isVideoType(type) ? MAX_VIDEO_BYTES : MAX_SOURCE_BYTES)

/** Why a file cannot be uploaded as this kind, or null when it can. */
export function rejectReason(f: { name: string; type: string; size: number }, kind: UploadKind): string | null {
  const t = fileType(f.name, f.type)
  if (f.size === 0) return 'Empty file (or a folder this browser cannot open)'
  if (!UPLOAD_TYPES[kind].includes(t)) {
    const allowed =
      kind === 'photo' ? 'JPG, PNG, WebP, HEIC, MP4, MOV or WebM' : kind === 'logo' ? 'JPG, PNG, WebP, HEIC or SVG' : kind === 'chat' ? 'a photo, an SVG, MP4, MOV or WebM' : 'PDF or an image'
    return `Bad type (${t || 'unknown'}): ${allowed} only`
  }
  const cap = maxBytesFor(t)
  if (f.size > cap) return `Too large: ${formatBytes(f.size)}, the limit is ${formatBytes(cap)}${isVideoType(t) ? ' for a video' : ''}`
  return null
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** The same name with the extension changed (IMG_1.HEIC -> IMG_1.jpg). */
export function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`
}

/** Scale (w, h) down so the long side is at most max; never up. */
export function fitWithin(w: number, h: number, max = UPLOAD_LONG_EDGE): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= max) return { width: w, height: h }
  const s = max / long
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

/** A filename not already used: IMG_1.jpg, then IMG_1 (2).jpg, IMG_1 (3).jpg. Case-insensitive. */
export function uniqueFilename(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (t) => t.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const next = `${stem} (${n})${ext}`
    if (!used.has(next.toLowerCase())) return next
  }
}

/** A filename as it goes into a Blob path: lower case, letters, digits, dot, dash and underscore. */
export const safeBlobName = (filename: string) => filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'

/** A video's poster frame n (1 to 3), uploaded next to it: <video path>.frame-<n>.jpg. */
export const framePathFor = (videoPath: string, n: number) => `${videoPath}.frame-${n}.jpg`
/** True for a poster frame's Blob path or URL. */
export const isFramePath = (p: string) => /\.frame-\d\.jpg$/i.test(p)

/** The Blob path for one upload. The uuid keeps every path unique, so nothing is ever overwritten. */
export function uploadPath(engagementId: string, uuid: string, filename: string): string {
  return `ops-intake/${engagementId}/${uuid}-${safeBlobName(filename)}`
}

// ── Video fields (shared by POST .../assets and the HQ message route) ────────

export type VideoFields = { frames: VideoFrame[]; posterUrl?: string; duration?: number; codec?: string; bytes?: number }

/**
 * Read the video fields of a request body: frames ([{ url, time }], at most
 * 3, each a frame path beside the video and accepted by ownUrl), posterUrl
 * (one of the frames; the middle one when left out), duration (seconds),
 * codec (a short container name) and bytes (up to MAX_VIDEO_BYTES). Calls
 * fail(message) on anything else.
 */
export function readVideoFields(o: Record<string, unknown>, videoUrl: string, ownUrl: (u: string) => boolean, fail: (message: string) => never, label = ''): VideoFields {
  const at = (f: string) => `${label}${f}`
  const raw = o.frames === undefined || o.frames === null ? [] : o.frames
  if (!Array.isArray(raw) || raw.length > 3) fail(`${at('frames')} must be a list of at most 3`)
  const frames = (raw as unknown[]).map((f, n): VideoFrame => {
    const x = (f ?? {}) as Record<string, unknown>
    const url = typeof x.url === 'string' ? x.url : ''
    if (!ownUrl(url) || !isFramePath(url) || !url.startsWith(videoUrl)) fail(`${at(`frames[${n}].url`)} is not a poster frame of this video`)
    const time = x.time
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > 86_400) fail(`${at(`frames[${n}].time`)} must be seconds`)
    return { url, time: Math.round((time as number) * 100) / 100 }
  })
  let posterUrl: string | undefined
  if (o.posterUrl !== undefined && o.posterUrl !== null) {
    if (typeof o.posterUrl !== 'string' || !frames.some((f) => f.url === o.posterUrl)) fail(`${at('posterUrl')} must be one of the frames`)
    posterUrl = o.posterUrl as string
  } else posterUrl = frames[Math.min(1, frames.length - 1)]?.url
  const num = (v: unknown, field: string, max: number) => {
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) fail(`${at(field)} is out of range`)
    return v as number
  }
  const duration = num(o.duration, 'duration', 86_400)
  const bytes = num(o.bytes, 'bytes', MAX_VIDEO_BYTES)
  let codec: string | undefined
  if (o.codec !== undefined && o.codec !== null) {
    if (typeof o.codec !== 'string' || !/^[A-Za-z0-9._-]{1,16}$/.test(o.codec)) fail(`${at('codec')} must be a short codec name`)
    codec = o.codec as string
  }
  return {
    frames,
    ...(posterUrl ? { posterUrl } : {}),
    ...(duration ? { duration: Math.round(duration * 100) / 100 } : {}),
    ...(codec ? { codec } : {}),
    ...(bytes ? { bytes: Math.round(bytes) } : {}),
  }
}

/** Every Blob URL an asset owns: the file, then a video's frames. */
export const assetUrls = (a: Pick<IntakeAsset, 'url' | 'frames'>) => [a.url, ...(a.frames ?? []).map((f) => f.url)]
