// ===========================================
// /admin/ops: GBP lookup into the intake (server only)
// ===========================================
// lookupGbp reads the profile (lib/ops/gbp.ts) for one client. On a match it
// writes Engagement.intake.gbp and stores the owner-posted photos (at most 12)
// in Blob under the client's intake prefix as kind 'gbp' assets with their
// attribution, replacing any earlier gbp photos. dry reads Google and returns
// what it would write; it writes nothing and uploads nothing.

import { randomUUID } from 'node:crypto'
import { del, put } from '@vercel/blob'
import { db } from '@/lib/db'
import { fetchPlacePhoto, pickPlace, searchPlaces, type IntakeGbp } from '@/lib/ops/gbp'
import type { IntakeAsset } from '@/lib/ops/intake'
import { assetPrefix, loadIntake, updateIntake } from '@/lib/ops/intake-server'

export type GbpLookupResult =
  | {
      status: 'matched'
      dry: boolean
      query: string
      gbp: IntakeGbp
      photos: { name: string; attribution: string; stored?: string }[]
      photoErrors: string[]
      line: string
    }
  | { status: 'ambiguous' | 'none'; dry: boolean; query: string; candidates: { name: string; address: string | null; mapsUri: string | null }[]; line: string }

/** "Ogden, UT" or "123 Main St, Ogden, UT 84401" → city and state (the last "City, ST" pair). */
function cityState(location: string | null | undefined): { city: string; state: string } {
  const pairs = Array.from((location ?? '').matchAll(/([^,]+),\s*([A-Za-z]{2})(?=\s*(?:\d{5}(?:-\d{4})?)?\s*(?:,|$))/g))
  const m = pairs[pairs.length - 1]
  return m ? { city: m[1].trim(), state: m[2].toUpperCase() } : { city: (location ?? '').trim(), state: '' }
}

export async function lookupGbp(engagementId: string, opts: { dry: boolean; name?: string; city?: string; state?: string }): Promise<GbpLookupResult> {
  const [e, stored] = await Promise.all([
    db.engagement.findUnique({ where: { id: engagementId }, select: { displayName: true, location: true } }),
    loadIntake(engagementId),
  ])
  if (!e || !stored) throw new Error(`no client with id ${engagementId}`)
  const intake = stored.intake
  const name = opts.name?.trim() || intake.business?.displayName?.trim() || e.displayName.trim()
  const where = opts.city ? { city: opts.city, state: opts.state ?? '' } : cityState(e.location ?? intake.business?.address ?? intake.business?.serviceArea?.[0])
  const query = [name, where.city, where.state].filter(Boolean).join(' ')
  const picked = pickPlace(name, await searchPlaces(query))

  if (picked.status !== 'matched') {
    const line = picked.status === 'none' ? `No Google profile found for "${query}".` : `No profile matched "${name}" by name; Google returned ${picked.candidates.map((c) => c.name).join(', ')}.`
    return { status: picked.status, dry: opts.dry, query, candidates: picked.candidates, line }
  }

  const g = picked.gbp
  const photos: { name: string; attribution: string; stored?: string }[] = picked.photos.map((p) => ({
    name: p.name,
    attribution: p.authorAttributions?.find((a) => a.displayName)?.displayName ?? g.name,
  }))
  const photoErrors: string[] = []
  const facts = [
    g.address ? 'address' : null,
    g.phone ? 'phone' : null,
    g.hours ? 'hours' : null,
    g.rating !== null ? `rating ${g.rating} (${g.userRatingCount ?? 0} reviews)` : null,
    g.reviews.length ? `${g.reviews.length} review${g.reviews.length === 1 ? '' : 's'} with text` : null,
    `${photos.length} owner photo${photos.length === 1 ? '' : 's'}`,
  ].filter(Boolean)

  if (!opts.dry) {
    const assets: IntakeAsset[] = []
    for (let n = 0; n < photos.length; n++) {
      const p = photos[n]
      try {
        const img = await fetchPlacePhoto(p.name)
        const ext = img.contentType.includes('png') ? 'png' : img.contentType.includes('webp') ? 'webp' : 'jpg'
        const blob = await put(`${assetPrefix(engagementId)}gbp-${Date.now()}-${n + 1}.${ext}`, img.bytes, { access: 'public', contentType: img.contentType })
        p.stored = blob.url
        assets.push({ id: randomUUID(), url: blob.url, filename: `gbp-${n + 1}.${ext}`, kind: 'gbp', attribution: p.attribution, caption: `From the Google profile (${p.attribution})`, uploadedAt: new Date().toISOString() })
      } catch (err) {
        photoErrors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    let replaced: string[] = []
    await updateIntake(engagementId, (cur) => {
      replaced = (cur.assets ?? []).filter((a) => a.kind === 'gbp').map((a) => a.url)
      const others = (cur.assets ?? []).filter((a) => a.kind !== 'gbp')
      return {
        ...cur,
        gbp: { ...(cur.gbp ?? {}), ...g, exists: true, ...(cur.gbp?.reviewCount ? {} : g.userRatingCount !== null ? { reviewCount: String(g.userRatingCount) } : {}) },
        assets: [...others, ...assets],
        updatedAt: new Date().toISOString(),
      }
    })
    if (replaced.length) await del(replaced).catch(() => undefined)
    await db.opsActivity.create({ data: { engagementId, kind: 'note', body: `Google profile read: ${g.name} (${g.mapsUri ?? g.placeId}); ${facts.join(', ')}.` } })
  }

  const line = `${opts.dry ? 'Would save' : 'Saved'} from ${g.name}'s Google profile: ${facts.join(', ')}.${photoErrors.length ? ` ${photoErrors.length} photo${photoErrors.length === 1 ? '' : 's'} failed.` : ''}`
  return { status: 'matched', dry: opts.dry, query, gbp: g, photos, photoErrors, line }
}
