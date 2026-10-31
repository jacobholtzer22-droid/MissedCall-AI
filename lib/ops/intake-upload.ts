// ===========================================
// /admin/ops intake: preparing files in the browser before upload
// ===========================================
// Browser only (canvas, createImageBitmap, heic-to). HEIC and HEIF become
// JPEG; any raster over UPLOAD_LONG_EDGE on its long side is shrunk and saved
// as JPEG at UPLOAD_JPEG_QUALITY; everything else goes up untouched. The
// original filename is kept with the extension changed. A video goes up as is
// (nothing is transcoded in the browser); a <video> element and a canvas grab
// three poster frames as JPEGs (1 second in, the middle, the last second) and
// the container gives the codec (./video-meta). A browser that cannot play
// the file (HEVC outside Safari and Apple Chrome) still uploads it, with the
// size and duration from the container and no frames. Also reads a drop,
// walking dropped folders. The rules themselves live in ./intake.

import { UPLOAD_JPEG_QUALITY, fileType, fitWithin, isHeic, isVideoType, withExtension } from './intake'
import { frameTimes, sniffVideo } from './video-meta'

/** What the browser learned about a video before upload. */
export type PreparedVideo = { duration: number | null; width: number | null; height: number | null; codec: string | null; frames: { blob: Blob; time: number }[] }

export type Prepared = { file: Blob; filename: string; contentType: string; width: number | null; height: number | null; video?: PreparedVideo }

/** Poster frames: long side at most this, JPEG. */
const FRAME_LONG_EDGE = 1600
/** A seek or a load that takes longer than this gives up (no frames, the upload still goes). */
const VIDEO_STEP_MS = 15_000

/** Decode a raster, honouring EXIF orientation. */
async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

async function toJpeg(img: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize images')
  ctx.fillStyle = '#ffffff' // PNG transparency would turn black in a JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY))
  canvas.width = canvas.height = 0
  if (!out) throw new Error('Could not encode the JPEG')
  return out
}

/**
 * HEIC to a decodable image: Safari reads HEIC itself; other browsers go
 * through heic-to (a current libheif, loaded only when needed). heic2any was
 * dropped: its libheif cannot read iOS 18 photos (iPhone 16, HDR gain maps).
 */
async function decodeHeic(file: File): Promise<ImageBitmap> {
  try {
    return await decode(file)
  } catch {
    const { heicTo } = await import('heic-to')
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } })
  }
}

async function svgSize(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function once(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`timed out waiting for ${event}`)), VIDEO_STEP_MS)
    const ok = () => done()
    const fail = () => done(new Error('this browser cannot play this video'))
    function done(err?: Error) {
      clearTimeout(timer)
      el.removeEventListener(event, ok)
      el.removeEventListener('error', fail)
      if (err) reject(err)
      else resolve()
    }
    el.addEventListener(event, ok)
    el.addEventListener('error', fail)
  })
}

/** Duration, display size and frames from a <video> element; throws when the browser cannot decode it. */
async function grabFrames(file: File): Promise<Omit<PreparedVideo, 'codec'>> {
  const url = URL.createObjectURL(file)
  const el = document.createElement('video')
  el.muted = true
  el.playsInline = true
  el.preload = 'auto'
  try {
    const loaded = once(el, 'loadeddata')
    el.src = url
    await loaded
    const duration = Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null
    if (!el.videoWidth || !el.videoHeight) throw new Error('no picture')
    const fit = fitWithin(el.videoWidth, el.videoHeight, FRAME_LONG_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = fit.width
    canvas.height = fit.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw video frames')
    const frames: PreparedVideo['frames'] = []
    for (const time of frameTimes(duration ?? 0)) {
      const seeked = once(el, 'seeked')
      el.currentTime = time
      await seeked
      ctx.drawImage(el, 0, 0, fit.width, fit.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY))
      if (blob) frames.push({ blob, time })
    }
    canvas.width = canvas.height = 0
    return { duration, width: el.videoWidth, height: el.videoHeight, frames }
  } finally {
    el.removeAttribute('src')
    el.load()
    URL.revokeObjectURL(url)
  }
}

async function prepareVideo(file: File, type: string): Promise<Prepared> {
  const sniffed = await sniffVideo(async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()), file.size)
  let seen: Omit<PreparedVideo, 'codec'> | null = null
  try {
    seen = await grabFrames(file)
  } catch {
    // Cannot play it here: upload anyway, with what the container says and no frames.
  }
  const video: PreparedVideo = {
    duration: seen?.duration ?? sniffed.duration,
    width: seen?.width ?? sniffed.width,
    height: seen?.height ?? sniffed.height,
    codec: sniffed.codec,
    frames: seen?.frames ?? [],
  }
  return { file, filename: file.name, contentType: type, width: video.width, height: video.height, video }
}

/** What to upload for this file. Throws with a readable reason when it cannot be read. */
export async function prepareFile(file: File): Promise<Prepared> {
  const type = fileType(file.name, file.type)
  if (isVideoType(type)) return prepareVideo(file, type)
  if (type === 'application/pdf') return { file, filename: file.name, contentType: type, width: null, height: null }
  if (type === 'image/svg+xml') {
    const size = await svgSize(file)
    return { file, filename: file.name, contentType: type, width: size?.width ?? null, height: size?.height ?? null }
  }

  let img: ImageBitmap
  try {
    img = isHeic(type) ? await decodeHeic(file) : await decode(file)
  } catch {
    throw new Error(isHeic(type) ? 'Could not convert this HEIC photo' : 'Could not read this image (damaged or not really an image)')
  }
  try {
    const fit = fitWithin(img.width, img.height)
    if (!isHeic(type) && fit.width === img.width && fit.height === img.height) {
      return { file, filename: file.name, contentType: type, width: img.width, height: img.height }
    }
    const jpeg = await toJpeg(img, fit.width, fit.height)
    return { file: jpeg, filename: withExtension(file.name, 'jpg'), contentType: 'image/jpeg', ...fit }
  } finally {
    img.close()
  }
}

// ── Reading a drop ──────────────────────────────────────────────────────────

type Entry = { isFile: boolean; isDirectory: boolean; name: string }
type FileEntry = Entry & { file: (ok: (f: File) => void, fail: (e: unknown) => void) => void }
type DirEntry = Entry & { createReader: () => { readEntries: (ok: (e: Entry[]) => void, fail: (e: unknown) => void) => void } }

async function walk(entry: Entry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await new Promise<File>((ok, fail) => (entry as FileEntry).file(ok, fail)))
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as DirEntry).createReader()
  // readEntries returns at most ~100 entries per call; read until it returns none.
  for (;;) {
    const batch = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail))
    if (!batch.length) break
    for (const child of batch) {
      if (!child.name.startsWith('.')) await walk(child, out)
    }
  }
}

/** Every file in a drop, folders walked (hidden files such as .DS_Store skipped). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file')
  // Entries must be taken synchronously, before the first await, or the browser drops them.
  const taken = items.map((i) => ({ entry: (i.webkitGetAsEntry?.() ?? null) as Entry | null, file: i.getAsFile() }))
  if (!taken.length) return Array.from(dt.files ?? [])
  const out: File[] = []
  for (const t of taken) {
    if (t.entry?.isDirectory) await walk(t.entry, out)
    else if (t.file) out.push(t.file)
  }
  return out
}
