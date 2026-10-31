// ===========================================
// /admin/ops intake: what a video file says about itself
// ===========================================
// Pure and client-safe. Reads the container, never decodes a frame: for MP4
// and MOV the top-level boxes are walked by their headers (so a 300 MB file
// costs a few small reads, wherever its moov sits), then the moov is read
// whole for the movie duration and the first video track's size and sample
// entry (avc1, hvc1, hev1, av01, vp09...). WebM is matched on its CodecID.
// The browser's <video> element is the better source for size and duration
// (it applies rotation); this is the codec, and the fallback when the browser
// cannot play the file at all (HEVC outside Safari and Apple Chrome).

export type VideoMeta = {
  codec: string | null
  duration: number | null
  width: number | null
  height: number | null
}

/** Reads bytes [start, end) of the file. */
export type ByteReader = (start: number, end: number) => Promise<Uint8Array>

const EMPTY: VideoMeta = {
  codec: null,
  duration: null,
  width: null,
  height: null,
}
/** A moov bigger than this is not read (a sane one is well under it). */
const MAX_MOOV = 16 * 1024 * 1024

const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4)

/** The boxes directly inside b[from, to): type, payload start, end. */
function children(b: Uint8Array, from: number, to: number): { type: string; start: number; end: number }[] {
  const out: { type: string; start: number; end: number }[] = []
  let at = from
  while (at + 8 <= to) {
    let size = u32(b, at)
    let header = 8
    if (size === 1) {
      if (at + 16 > to) break
      size = u64(b, at + 8)
      header = 16
    } else if (size === 0) size = to - at
    if (size < header || at + size > to) break
    out.push({ type: fourcc(b, at + 4), start: at + header, end: at + size })
    at += size
  }
  return out
}

const child = (b: Uint8Array, from: number, to: number, type: string) => children(b, from, to).find((c) => c.type === type)

/** Duration (seconds), first video track size and codec from a whole moov payload. */
export function readMoov(b: Uint8Array): VideoMeta {
  const out: VideoMeta = { ...EMPTY }
  const mvhd = child(b, 0, b.length, 'mvhd')
  if (mvhd) {
    const v = b[mvhd.start]
    const scale = v === 1 ? u32(b, mvhd.start + 20) : u32(b, mvhd.start + 12)
    const dur = v === 1 ? u64(b, mvhd.start + 24) : u32(b, mvhd.start + 16)
    if (scale > 0 && dur > 0) out.duration = Math.round((dur / scale) * 100) / 100
  }
  for (const trak of children(b, 0, b.length).filter((c) => c.type === 'trak')) {
    const mdia = child(b, trak.start, trak.end, 'mdia')
    const hdlr = mdia && child(b, mdia.start, mdia.end, 'hdlr')
    if (!hdlr || fourcc(b, hdlr.start + 8) !== 'vide') continue
    const tkhd = child(b, trak.start, trak.end, 'tkhd')
    if (tkhd) {
      // width and height are the last 8 bytes, 16.16 fixed point.
      const w = Math.round(u32(b, tkhd.end - 8) / 65536)
      const h = Math.round(u32(b, tkhd.end - 4) / 65536)
      // The display matrix sits just before them: a = 0 means a quarter turn (an iPhone held upright).
      const quarterTurn = tkhd.end - 44 >= tkhd.start && u32(b, tkhd.end - 44) === 0 && u32(b, tkhd.end - 40) !== 0
      if (w > 0 && h > 0) {
        out.width = quarterTurn ? h : w
        out.height = quarterTurn ? w : h
      }
    }
    const minf = child(b, mdia.start, mdia.end, 'minf')
    const stbl = minf && child(b, minf.start, minf.end, 'stbl')
    const stsd = stbl && child(b, stbl.start, stbl.end, 'stsd')
    // stsd: version/flags (4), entry count (4), then the first sample entry's size (4) and type (4).
    if (stsd && stsd.start + 16 <= stsd.end) out.codec = fourcc(b, stsd.start + 12).trim() || null
    break
  }
  return out
}

/** WebM: the first video CodecID string in the header ("V_VP9" becomes "vp9"). */
export function readWebmCodec(b: Uint8Array): string | null {
  const text = new TextDecoder('latin1').decode(b)
  const m = text.match(/V_(VP8|VP9|AV1|MPEG4\/ISO\/AVC|MPEGH\/ISO\/HEVC)/)
  if (!m) return null
  return (
    (
      {
        VP8: 'vp8',
        VP9: 'vp9',
        AV1: 'av1',
        'MPEG4/ISO/AVC': 'avc1',
        'MPEGH/ISO/HEVC': 'hevc',
      } as Record<string, string>
    )[m[1]] ?? null
  )
}

/** Sniff a video file. Never throws: an unreadable container answers all nulls. */
export async function sniffVideo(read: ByteReader, size: number): Promise<VideoMeta> {
  try {
    const head = await read(0, Math.min(size, 64 * 1024))
    if (head.length >= 4 && u32(head, 0) === 0x1a45dfa3) return { ...EMPTY, codec: readWebmCodec(head) }
    let at = 0
    for (let n = 0; n < 64 && at + 8 <= size; n++) {
      const h = await read(at, Math.min(size, at + 16))
      if (h.length < 8) break
      let boxSize = u32(h, 0)
      let header = 8
      if (boxSize === 1 && h.length >= 16) {
        boxSize = u64(h, 8)
        header = 16
      } else if (boxSize === 0) boxSize = size - at
      if (boxSize < header) break
      if (fourcc(h, 4) === 'moov') {
        if (boxSize - header > MAX_MOOV) return EMPTY
        return readMoov(await read(at + header, at + boxSize))
      }
      at += boxSize
    }
  } catch {
    // fall through
  }
  return EMPTY
}

/** Friendly codec names for people: hvc1 and hev1 are HEVC, avc1 is H.264. */
export function codecLabel(codec: string | null | undefined): string {
  if (!codec) return 'unknown codec'
  const c = codec.toLowerCase()
  if (c === 'hvc1' || c === 'hev1' || c === 'hevc') return 'HEVC'
  if (c === 'avc1' || c === 'avc3') return 'H.264'
  if (c === 'av01' || c === 'av1') return 'AV1'
  if (c === 'vp09' || c === 'vp9') return 'VP9'
  if (c === 'vp08' || c === 'vp8') return 'VP8'
  return codec
}

/** "0:42", "1:05:10". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Where the three poster frames are taken: 1 second in, the middle, and the
 * last second. Short clips are clamped inside the clip.
 */
export function frameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0]
  const last = Math.max(0, duration - 1)
  const first = Math.min(1, duration / 4)
  const t = [first, duration / 2, last].map((x) => Math.round(Math.min(Math.max(0, x), Math.max(0, duration - 0.05)) * 100) / 100)
  return t
}
