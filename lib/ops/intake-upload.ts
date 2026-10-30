// ===========================================
// /admin/ops intake: preparing files in the browser before upload
// ===========================================
// Browser only (canvas, createImageBitmap, heic2any). HEIC and HEIF become
// JPEG; any raster over UPLOAD_LONG_EDGE on its long side is shrunk and saved
// as JPEG at UPLOAD_JPEG_QUALITY; everything else goes up untouched. The
// original filename is kept with the extension changed. Also reads a drop,
// walking dropped folders. The rules themselves live in ./intake.

import { UPLOAD_JPEG_QUALITY, fileType, fitWithin, isHeic, withExtension } from './intake'

export type Prepared = { file: Blob; filename: string; contentType: string; width: number | null; height: number | null }

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

/** HEIC to a decodable image: Safari reads HEIC itself, other browsers go through heic2any (loaded only when needed). */
async function decodeHeic(file: File): Promise<ImageBitmap> {
  try {
    return await decode(file)
  } catch {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 })
    return decode(Array.isArray(out) ? out[0] : out)
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

/** What to upload for this file. Throws with a readable reason when it cannot be read. */
export async function prepareFile(file: File): Promise<Prepared> {
  const type = fileType(file.name, file.type)
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
