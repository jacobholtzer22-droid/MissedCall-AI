// ===========================================
// /admin/ops GBP lookup tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { namesMatch, nameWords, ownerPhotos, pickPlace, toIntakeGbp, type Place } from './gbp'

test('names match on the word level, ignoring suffixes and numbering', () => {
  assert.equal(namesMatch('Yualex Painting', 'Yualex Painting 2 LLC'), true)
  assert.equal(namesMatch('Helper Property Pros', 'Helper Property Pros'), true)
  assert.equal(namesMatch("Brad's Lawn Services", 'Brads Lawn Services LLC'), true)
  assert.equal(namesMatch('S&G Construction Inc.', 'S and G Construction'), true)
  assert.equal(namesMatch('Helper Property Pros', 'Pro Painting Helpers'), false)
  assert.equal(namesMatch('Yualex Painting', 'Ogden Painting Co'), false)
  assert.equal(namesMatch('LLC', 'Anything'), false)
  assert.deepEqual(nameWords('The Oliveira Drywall Co. 2'), ['oliveira', 'drywall'])
})

test('only owner-posted photos, at most 12, compared case-insensitively', () => {
  const photo = (n: number, by: string) => ({ name: `places/x/photos/${n}`, authorAttributions: [{ displayName: by }] })
  const photos = [photo(1, 'Yualex Painting'), photo(2, 'A Customer'), photo(3, ' yualex painting '), ...Array.from({ length: 15 }, (_, i) => photo(10 + i, 'YUALEX PAINTING'))]
  const own = ownerPhotos(photos, ['Yualex Painting'])
  assert.equal(own.length, 12)
  assert.ok(own.every((p) => p.name !== 'places/x/photos/2'))
  assert.deepEqual(ownerPhotos(undefined, ['x']), [])
})

const place: Place = {
  id: 'ChIJ1',
  displayName: { text: 'Yualex Painting' },
  formattedAddress: '123 Main St, Ogden, UT 84401, USA',
  nationalPhoneNumber: '(801) 824-0835',
  googleMapsUri: 'https://maps.google.com/?cid=1',
  rating: 5,
  userRatingCount: 12,
  regularOpeningHours: { weekdayDescriptions: ['Monday: 8:00 AM to 6:00 PM'] },
  reviews: [
    { rating: 5, originalText: { text: 'Great work on our kitchen.' }, authorAttribution: { displayName: 'Ann B', uri: 'https://maps.google.com/r1' }, publishTime: '2026-09-01T00:00:00Z' },
    { rating: 4, text: { text: '' } },
  ],
  photos: [{ name: 'places/ChIJ1/photos/a', authorAttributions: [{ displayName: 'Yualex Painting' }] }],
}

test('toIntakeGbp keeps the facts and the reviews with text', () => {
  const g = toIntakeGbp(place, new Date('2026-10-29T00:00:00Z'))
  assert.equal(g.placeId, 'ChIJ1')
  assert.equal(g.hours?.[0], 'Monday: 8:00 AM to 6:00 PM')
  assert.equal(g.reviews.length, 1)
  assert.deepEqual(g.reviews[0], { author: 'Ann B', rating: 5, text: 'Great work on our kitchen.', publishTime: '2026-09-01T00:00:00Z', uri: 'https://maps.google.com/r1' })
  assert.equal(g.website, null)
})

test('pickPlace takes the top result only when the name matches', () => {
  const m = pickPlace('Yualex Painting 2 LLC', [place])
  assert.equal(m.status, 'matched')
  if (m.status === 'matched') assert.equal(m.photos.length, 1)
  const other: Place = { id: 'x', displayName: { text: 'Ogden Pro Painters' } }
  const a = pickPlace('Yualex Painting', [other, place])
  assert.equal(a.status, 'ambiguous')
  assert.equal(a.status === 'ambiguous' ? a.candidates.length : -1, 2)
  assert.equal(pickPlace('Yualex Painting', []).status, 'none')
})
