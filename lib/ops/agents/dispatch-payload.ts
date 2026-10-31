// ===========================================
// /admin/ops agents: the repository_dispatch payload (pure)
// ===========================================
// GitHub caps client_payload at 10 top-level keys and about 64 KB. A brief
// fits; a long asset list does not (113 photos went out empty once). So the
// asset list, the GBP lookup and the extras are written to Vercel Blob as
// ops-dispatch/{runId}/assets.json, gbp.json and extras.json, and the
// payload's `assets` and `extras` keys carry those files' URLs instead of
// base64. extras.json names gbp.json as gbp_url. aa-build.yml tells the two
// apart by the https:// prefix and still reads base64, so a repo whose
// workflow predates URLs keeps working.
//
// A repo's aa-build.yml reads URLs when it carries URL_MARKER. One that does
// not gets the inline base64 payload as before, and a payload too large for it
// is refused rather than sent without its assets.

import type { BuildExtras } from '@/lib/ops/build-style'

/** What dispatch refuses above, in bytes of JSON (GitHub's own cap is about 64 KB). */
export const PAYLOAD_LIMIT = 60_000
export const DISPATCH_BLOB_PREFIX = 'ops-dispatch/'
/** In aa-build.yml once it fetches assets and extras by URL. */
export const URL_MARKER = 'aa-payload-files: url'

/** Longer than any real blob URL, so a size check with it holds for the real one. */
const PLACEHOLDER_URL = `https://${'x'.repeat(40)}.public.blob.vercel-storage.com/${DISPATCH_BLOB_PREFIX}${'x'.repeat(25)}/extras.json`

export type PayloadBase = {
  kind: string
  run_id: string
  brief: string
  instructions: string
  business_slug: string
  callback_url: string
  old_site: string
  with_stock: string
}
export type DispatchPayload = PayloadBase & { assets: string; extras: string }

export type DispatchFiles = { assets: unknown[]; extras: BuildExtras | null }
export type DispatchMode = 'url' | 'inline'

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
export const payloadBytes = (p: DispatchPayload) => Buffer.byteLength(JSON.stringify(p), 'utf8')

/** The old payload: the asset list and the extras (GBP inside) as base64 JSON. */
export function inlineFields(files: DispatchFiles) {
  return { assets: files.assets.length ? b64(JSON.stringify(files.assets)) : '', extras: files.extras ? b64(JSON.stringify(files.extras)) : '' }
}

/** The blob files a URL dispatch writes, '' bodies left out. gbp leaves extras for its own file. */
export function blobFiles(files: DispatchFiles) {
  const { gbp, ...rest } = files.extras ?? {}
  return {
    assets: files.assets.length ? JSON.stringify(files.assets) : null,
    gbp: gbp ? JSON.stringify(gbp) : null,
    /** extras.json without gbp_url; extrasBody adds it once gbp.json has a URL. */
    extras: Object.keys(rest).length || gbp ? rest : null,
  }
}

export const extrasBody = (extras: Record<string, unknown>, gbpUrl: string | null) => JSON.stringify({ ...extras, ...(gbpUrl ? { gbp_url: gbpUrl } : {}) })

/**
 * Which payload a dispatch sends, or why it cannot. readsUrls: the repo's
 * aa-build.yml carries URL_MARKER.
 */
export function choosePayloadMode(base: PayloadBase, files: DispatchFiles, readsUrls: boolean): { mode: DispatchMode; bytes: number; blocked?: string } {
  const kb = (n: number) => `${Math.ceil(n / 1000)} KB`
  if (readsUrls) {
    const b = blobFiles(files)
    const bytes = payloadBytes({ ...base, assets: b.assets ? PLACEHOLDER_URL : '', extras: b.extras ? PLACEHOLDER_URL : '' })
    if (bytes > PAYLOAD_LIMIT) return { mode: 'url', bytes, blocked: `the dispatch payload is ${kb(bytes)}, over the ${kb(PAYLOAD_LIMIT)} limit, even with the files sent by URL: shorten the brief or instructions` }
    return { mode: 'url', bytes }
  }
  const bytes = payloadBytes({ ...base, ...inlineFields(files) })
  if (bytes > PAYLOAD_LIMIT) {
    return {
      mode: 'inline',
      bytes,
      blocked: `the dispatch payload is ${kb(bytes)}, over the ${kb(PAYLOAD_LIMIT)} limit (${files.assets.length} assets inline), and this repo's aa-build.yml predates file URLs: update its workflow from AA-Template first`,
    }
  }
  return { mode: 'inline', bytes }
}
