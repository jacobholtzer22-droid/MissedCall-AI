// ===========================================
// /admin/ops intake tests
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fileType, fitWithin, intakeMissing, mergeIntake, rejectReason, uniqueFilename, uploadPath, withAssetSections, withExtension, type Intake } from './intake'

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

test('rejectReason: type from the extension when the browser leaves it blank, 40 MB cap, PDF is not a photo', () => {
  const mb = 1024 * 1024
  assert.equal(rejectReason({ name: 'IMG_1.HEIC', type: '', size: 5 * mb }, 'photo'), null)
  assert.equal(rejectReason({ name: 'a.jpg', type: 'image/jpeg', size: 40 * mb }, 'photo'), null)
  assert.match(rejectReason({ name: 'big.jpg', type: 'image/jpeg', size: 50 * mb }, 'photo') ?? '', /^Too large: 50\.0 MB/)
  assert.match(rejectReason({ name: 'menu.pdf', type: 'application/pdf', size: mb }, 'photo') ?? '', /^Bad type \(application\/pdf\)/)
  assert.match(rejectReason({ name: 'folder', type: '', size: 0 }, 'photo') ?? '', /^Empty file/)
  assert.equal(rejectReason({ name: 'logo.svg', type: 'image/svg+xml', size: 2000 }, 'logo'), null)
  assert.equal(fileType('x.JPG', 'image/jpg'), 'image/jpeg')
  assert.equal(fileType('x.heif', 'application/octet-stream'), 'image/heif')
})

test('fitWithin shrinks the long side to 2400 and never enlarges', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 2400, height: 1800 })
  assert.deepEqual(fitWithin(3024, 4032), { width: 1800, height: 2400 })
  assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900 })
})

test('uniqueFilename suffixes duplicates case-insensitively; withExtension swaps only the last extension', () => {
  assert.equal(uniqueFilename('IMG_1.jpg', []), 'IMG_1.jpg')
  assert.equal(uniqueFilename('IMG_1.jpg', ['img_1.JPG']), 'IMG_1 (2).jpg')
  assert.equal(uniqueFilename('IMG_1.jpg', ['IMG_1.jpg', 'IMG_1 (2).jpg']), 'IMG_1 (3).jpg')
  assert.equal(withExtension('IMG_1.HEIC', 'jpg'), 'IMG_1.jpg')
  assert.equal(withExtension('back.yard.heic', 'jpg'), 'back.yard.jpg')
  assert.equal(uploadPath('e1', 'u1', 'Back Yard (2).JPG'), 'ops-intake/e1/u1-back-yard-2-.jpg')
})
