import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAYLOAD_LIMIT, blobFiles, choosePayloadMode, extrasBody, inlineFields, payloadBytes, type PayloadBase } from './dispatch-payload'

const asset = (n: number) => ({
  url: `https://abcdefghijklmnop.public.blob.vercel-storage.com/ops-intake/cmvwr09wj00c0000000000000/IMG_${4700 + n}-a1b2c3d4e5f6.jpg`,
  kind: 'photo',
  filename: `IMG_${4700 + n}.jpg`,
  caption: 'Freshly painted two story exterior with white trim and a dark front door on a clear day.',
  heroCandidate: n === 0,
  service: 'Exterior Painting',
  beforeAfter: null,
})
const assets = Array.from({ length: 150 }, (_, n) => asset(n))
const gbp = { placeId: 'ChIJ' + 'x'.repeat(23), name: 'One United Construction', reviews: Array.from({ length: 5 }, () => ({ text: 'Great work. '.repeat(40) })) }
const extras = { recent_styles: [{ client: 'Yualex', direction: 'editorial', pairing: 'serif', headingAccent: 'underline' }], gbp, style: { sitesLiked: ['a.com'], brandColors: ['#123456'] } }
const base: PayloadBase = {
  kind: 'site_update',
  run_id: 'x'.repeat(25),
  brief: '',
  instructions: Buffer.from('Add every photo to the gallery. '.repeat(100)).toString('base64'),
  business_slug: 'one-united-construction',
  callback_url: 'https://www.alignandacquire.com/api/ops/build-callback',
  old_site: '',
  with_stock: '',
}

test('a 150-asset dispatch by URL stays under the cap', () => {
  const r = choosePayloadMode(base, { assets, extras }, true)
  assert.equal(r.mode, 'url')
  assert.equal(r.blocked, undefined)
  assert.ok(r.bytes < 10_000, `payload was ${r.bytes} bytes`)
  // The same files inline are what went out empty for run cmvwr09wj00c.
  assert.ok(payloadBytes({ ...base, ...inlineFields({ assets, extras }) }) > PAYLOAD_LIMIT)
})

test('a workflow that predates URLs is refused, not sent without its assets', () => {
  const r = choosePayloadMode(base, { assets, extras }, false)
  assert.equal(r.mode, 'inline')
  assert.match(r.blocked ?? '', /predates file URLs: update its workflow from AA-Template first/)
  assert.match(r.blocked ?? '', /150 assets inline/)
})

test('a small dispatch to an old workflow still goes inline', () => {
  const r = choosePayloadMode(base, { assets: assets.slice(0, 5), extras: null }, false)
  assert.deepEqual([r.mode, r.blocked], ['inline', undefined])
})

test('a brief too large even by URL is refused with its size', () => {
  const big = { ...base, kind: 'site_build', brief: 'x'.repeat(PAYLOAD_LIMIT) }
  assert.match(choosePayloadMode(big, { assets, extras }, true).blocked ?? '', /over the 60 KB limit, even with the files sent by URL/)
})

test('gbp gets its own file and extras.json names it', () => {
  const b = blobFiles({ assets, extras })
  assert.deepEqual(JSON.parse(b.gbp!), gbp)
  assert.equal('gbp' in b.extras!, false)
  const body = JSON.parse(extrasBody(b.extras!, 'https://s.public.blob.vercel-storage.com/ops-dispatch/r/gbp.json'))
  assert.equal(body.gbp_url, 'https://s.public.blob.vercel-storage.com/ops-dispatch/r/gbp.json')
  assert.deepEqual(body.recent_styles, extras.recent_styles)
  // GBP alone still needs extras.json, to carry gbp_url.
  assert.deepEqual(blobFiles({ assets: [], extras: { gbp } }).extras, {})
  assert.deepEqual(blobFiles({ assets: [], extras: null }), { assets: null, gbp: null, extras: null })
})
