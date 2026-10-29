// ===========================================
// /admin/ops: Google Business Profile lookup (Places API, New)
// ===========================================
// One searchText call for "<business name> <city> <state>". The top result is
// taken only when its name matches the business on the word level; otherwise
// the candidates go back to the chief, who asks Jacob. Reading is all this file
// does: lib/ops/gbp-server.ts writes the intake and stores owner photos.
//
// Env, read by name only: GOOGLE_PLACES_API_KEY (unset means the lookup is
// offline). The key is sent as X-Goog-Api-Key, never in a logged URL.

import { fetchWithTimeout } from '@/lib/ops/checks/limit'

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'rating',
  'userRatingCount',
  'reviews',
  'photos',
  'primaryType',
  'googleMapsUri',
  'businessStatus',
]

export const MAX_GBP_PHOTOS = 12

export class GbpOffline extends Error {}

export const placesKey = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || null

export type Attribution = { displayName?: string; uri?: string; photoUri?: string }
export type PlacePhoto = { name: string; widthPx?: number; heightPx?: number; authorAttributions?: Attribution[] }
export type PlaceReview = {
  rating?: number
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: Attribution
  publishTime?: string
  relativePublishTimeDescription?: string
}
export type Place = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  rating?: number
  userRatingCount?: number
  reviews?: PlaceReview[]
  photos?: PlacePhoto[]
  primaryType?: string
  googleMapsUri?: string
  businessStatus?: string
}

/** What lands in Engagement.intake.gbp next to the questionnaire's Q15/Q16 answers. */
export type IntakeGbp = {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  mapsUri: string | null
  rating: number | null
  userRatingCount: number | null
  hours: string[] | null
  primaryType: string | null
  businessStatus: string | null
  reviews: { author: string; rating: number | null; text: string; publishTime: string | null; uri: string | null }[]
  lookedUpAt: string
}

/** Words that do not identify a business: entity suffixes, joiners, numbering. */
const NOISE = new Set(['llc', 'inc', 'co', 'corp', 'company', 'ltd', 'the', 'and', 'of', 'a', 'pllc', 'lp'])

export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w))
}

/**
 * The business and a place name match on the word level: every significant
 * word of the shorter one appears in the longer one, and at least one word is
 * shared. "Yualex Painting" matches "Yualex Painting 2 LLC"; "Helper Pros"
 * does not match "Pro Painting Helpers".
 */
export function namesMatch(business: string, place: string): boolean {
  const a = nameWords(business)
  const b = nameWords(place)
  if (!a.length || !b.length) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const set = new Set(long)
  return short.every((w) => set.has(w))
}

const sameName = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()

/** Photos the business posted itself (the attribution is the business), at most 12. */
export function ownerPhotos(photos: PlacePhoto[] | undefined, names: string[]): PlacePhoto[] {
  const wanted = names.filter((n) => n.trim())
  return (photos ?? []).filter((p) => (p.authorAttributions ?? []).some((a) => wanted.some((n) => sameName(a.displayName, n)))).slice(0, MAX_GBP_PHOTOS)
}

export function toIntakeGbp(p: Place, now = new Date()): IntakeGbp {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    mapsUri: p.googleMapsUri ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    hours: p.regularOpeningHours?.weekdayDescriptions?.length ? p.regularOpeningHours.weekdayDescriptions : null,
    primaryType: p.primaryType ?? null,
    businessStatus: p.businessStatus ?? null,
    reviews: (p.reviews ?? [])
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? '',
        rating: typeof r.rating === 'number' ? r.rating : null,
        text: (r.originalText?.text ?? r.text?.text ?? '').trim(),
        publishTime: r.publishTime ?? null,
        uri: r.authorAttribution?.uri ?? null,
      }))
      .filter((r) => r.text),
    lookedUpAt: now.toISOString(),
  }
}

export type GbpSearch =
  | { status: 'matched'; place: Place; gbp: IntakeGbp; photos: PlacePhoto[]; candidates: string[] }
  | { status: 'ambiguous' | 'none'; candidates: { name: string; address: string | null; mapsUri: string | null }[] }

/** Pick the top result when its name matches; otherwise list what Google returned. */
export function pickPlace(business: string, places: Place[], now = new Date()): GbpSearch {
  const top = places[0]
  if (top && namesMatch(business, top.displayName?.text ?? '')) {
    const gbp = toIntakeGbp(top, now)
    return { status: 'matched', place: top, gbp, photos: ownerPhotos(top.photos, [gbp.name, business]), candidates: places.slice(1).map((p) => p.displayName?.text ?? '') }
  }
  return {
    status: places.length ? 'ambiguous' : 'none',
    candidates: places.map((p) => ({ name: p.displayName?.text ?? '', address: p.formattedAddress ?? null, mapsUri: p.googleMapsUri ?? null })),
  }
}

/** Places API (New) searchText. Throws GbpOffline without a key. */
export async function searchPlaces(textQuery: string): Promise<Place[]> {
  const key = placesKey()
  if (!key) throw new GbpOffline('GBP lookup is offline: GOOGLE_PLACES_API_KEY is not set')
  const res = await fetchWithTimeout(
    SEARCH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS.map((f) => `places.${f}`).join(',') },
      body: JSON.stringify({ textQuery, maxResultCount: 5 }),
    },
    15_000
  )
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`Places searchText: HTTP ${res.status} ${data?.error?.message ?? ''}`.trim())
  return (data?.places ?? []) as Place[]
}

/** The image bytes of one place photo (Places API media endpoint, redirect followed). */
export async function fetchPlacePhoto(photoName: string, maxWidthPx = 1600): Promise<{ bytes: Buffer; contentType: string }> {
  const key = placesKey()
  if (!key) throw new GbpOffline('GBP lookup is offline: GOOGLE_PLACES_API_KEY is not set')
  const res = await fetchWithTimeout(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}`, { headers: { 'X-Goog-Api-Key': key }, redirect: 'follow' }, 20_000)
  if (!res.ok) throw new Error(`Places photo: HTTP ${res.status}`)
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' }
}
