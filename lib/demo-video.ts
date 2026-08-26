// ===========================================
// FOUNDER DEMO VIDEO URL
// ===========================================
// Single source of truth for where the founder video lives.
//
// Ships pointing at Vercel Blob via NEXT_PUBLIC_DEMO_VIDEO_URL. The
// public/founder-video.mp4 path is kept as a fallback so the funnel still works
// if the env var is missing, but the MP4 is gitignored and is NOT in the repo,
// so that fallback only resolves if someone drops the file in manually.

const PUBLIC_FALLBACK_PATH = '/founder-video.mp4'

/** Relative or absolute URL, for the <video> element. */
export function getDemoVideoUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim()
  return configured || PUBLIC_FALLBACK_PATH
}

/** Always absolute. For SMS and calendar invites, where relative paths are useless. */
export function getDemoVideoAbsoluteUrl(): string {
  const url = getDemoVideoUrl()
  if (/^https?:\/\//i.test(url)) return url
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.alignandacquire.com'
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * Poster frame shown before playback. Matters more than a normal poster here:
 * the <video> element is not rendered until the gate clears, so this image is
 * also the background of the placeholder play button. Empty string when unset,
 * in which case the placeholder falls back to a plain gradient.
 */
export function getDemoPosterUrl(): string {
  return process.env.NEXT_PUBLIC_DEMO_POSTER_URL?.trim() || ''
}

export const WATCH_BEFORE_LINE = 'Watch this before we talk, takes 2 minutes.'
