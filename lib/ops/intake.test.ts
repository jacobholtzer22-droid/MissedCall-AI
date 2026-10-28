// ===========================================
// /admin/ops intake tests
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { intakeMissing, mergeIntake, withAssetSections, type Intake } from './intake'

const intake: Intake = {
  assets: [{ id: 'a1', url: 'https://x.public.blob.vercel-storage.com/ops-intake/e1/1-front.jpg', filename: 'IMG_1.jpg', kind: 'photo', caption: 'Front yard', heroCandidate: true, uploadedAt: '2026-10-28T00:00:00Z' }],
  oldSite: { url: 'https://old.example.com', use: 'facts_only' },
}

test('withAssetSections keeps Standards applied and replaces only Assets and Old site', () => {
  const brief = '# Client Brief\n\n## Business identity\n- Legal name: X\n\n## Assets\n- old list\n\n## Standards applied\n- Split Painting (rule 1)\n'
  const out = withAssetSections(brief, intake)
  assert.match(out, /## Standards applied\n- Split Painting \(rule 1\)/)
  assert.doesNotMatch(out, /old list/)
  assert.equal((out.match(/^## Assets$/gm) ?? []).length, 1)
  assert.match(out, /photo \| https:\/\/x\.public\.blob\.vercel-storage\.com\/ops-intake\/e1\/1-front\.jpg \| Front yard \| hero candidate/)
  assert.match(out, /## Old site\n\n- https:\/\/old\.example\.com \| use: facts_only/)
  assert.ok(out.indexOf('## Standards applied') < out.indexOf('## Assets'))
})

test('withAssetSections is stable when run twice', () => {
  const once = withAssetSections('# Brief\n\n## Standards applied\n- a\n', intake)
  assert.equal(withAssetSections(once, intake), once)
})

test('mergeIntake merges objects one level, replaces arrays, never takes assets from a patch', () => {
  const cur: Intake = { business: { legalName: 'Yualex Painting 2 LLC', serviceArea: ['Ogden'] }, assets: intake.assets }
  const next = mergeIntake(cur, { business: { phone: '+18018240835', serviceArea: ['Ogden', 'Layton'] }, assets: [] }, new Date('2026-10-28T12:00:00Z'))
  assert.equal(next.business?.legalName, 'Yualex Painting 2 LLC')
  assert.deepEqual(next.business?.serviceArea, ['Ogden', 'Layton'])
  assert.equal(next.assets?.length, 1)
  assert.equal(next.updatedAt, '2026-10-28T12:00:00.000Z')
})

test('intakeMissing names the five build essentials', () => {
  assert.deepEqual(intakeMissing({}), ['phone', 'services', 'service area', 'about', 'photos'])
  assert.deepEqual(intakeMissing({ ...intake, business: { phone: 'x', serviceArea: ['Ogden'] }, services: [{ name: 'Interior Painting' }], about: 'x' }), [])
})
