// ===========================================
// HQ chat photo filing tests
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Intake } from './intake'
import { FILE_PHOTOS_TOOL, InvalidAttachments, filedNote, inboxPath, isInboxUrl, parseChatMessage, planFiling, type ChatAttachment } from './photo-filing'

const HOST = 'https://r48zbwxf2ehaous5.public.blob.vercel-storage.com'
const att = (name: string, extra: Partial<ChatAttachment> = {}): ChatAttachment => ({
  url: `${HOST}/ops-inbox/u-${name.toLowerCase()}`,
  filename: name,
  width: 2400,
  height: 1800,
  bytes: 1_200_000,
  ...extra,
})
const intake: Intake = {
  services: [{ name: 'Interior Painting' }, { name: 'Drywall Repair' }],
  assets: [{ id: 'a1', url: `${HOST}/ops-intake/e1/x-img_1.jpg`, filename: 'IMG_1.jpg', kind: 'photo', uploadedAt: '2026-10-30T00:00:00Z' }],
}
let n = 0
const plan = (photos: unknown, inbox: ChatAttachment[] = [att('IMG_1.jpg'), att('IMG_2.jpg'), att('logo.png')], i = intake) =>
  planFiling({ engagementId: 'e1', intake: i, photos, inbox, uuid: () => `id${++n}`, now: new Date('2026-10-30T12:00:00Z') })
const photo = (name: string, extra: Record<string, unknown> = {}) => ({ url: att(name).url, filename: name, caption: 'Living room walls after paint', heroCandidate: false, kind: 'photo', ...extra })

test('planFiling suffixes a name already on file and one repeated in the same call', () => {
  const out = plan([photo('IMG_1.jpg'), photo('IMG_2.jpg')], [att('IMG_1.jpg'), att('IMG_2.jpg')])
  assert.equal(out[0].asset.filename, 'IMG_1 (2).jpg')
  assert.equal(out[1].asset.filename, 'IMG_2.jpg')
  const twice = plan([photo('a.jpg'), { ...photo('a.jpg'), url: `${HOST}/ops-inbox/v-a.jpg` }], [att('a.jpg'), att('a.jpg', { url: `${HOST}/ops-inbox/v-a.jpg` })])
  assert.deepEqual(twice.map((p) => p.asset.filename), ['a.jpg', 'a (2).jpg'])
  assert.match(out[0].pathname, /^ops-intake\/e1\/id\d+-img_1\.jpg$/)
  assert.equal(out[0].asset.width, 2400)
  assert.equal(out[0].asset.uploadedAt, '2026-10-30T12:00:00.000Z')
})

test('planFiling takes a service only when it matches the intake (case-insensitive, stored as written there)', () => {
  assert.equal(plan([photo('IMG_2.jpg', { service: 'interior painting' })])[0].asset.service, 'Interior Painting')
  assert.equal(plan([photo('IMG_2.jpg')])[0].asset.service, undefined)
  assert.throws(() => plan([photo('IMG_2.jpg', { service: 'Kitchen remodel' })]), /not one of this client's services \(Interior Painting, Drywall Repair\)/)
  assert.throws(() => plan([photo('IMG_2.jpg', { service: 'Painting' })], undefined, { assets: [] }), /no services in its intake/)
})

test('planFiling allows one hero candidate per call', () => {
  assert.throws(() => plan([photo('IMG_1.jpg', { heroCandidate: true }), photo('IMG_2.jpg', { heroCandidate: true })]), InvalidAttachments)
  const out = plan([photo('IMG_1.jpg', { heroCandidate: true }), photo('IMG_2.jpg', { beforeAfter: 'after' })])
  assert.equal(out[0].asset.heroCandidate, true)
  assert.equal(out[1].asset.heroCandidate, undefined)
  assert.equal(out[1].asset.beforeAfter, 'after')
})

test('planFiling refuses photos not unfiled in this chat, missing captions and bad kinds', () => {
  assert.throws(() => plan([{ ...photo('IMG_1.jpg'), url: `${HOST}/ops-inbox/elsewhere.jpg` }]), /not an unfiled photo from this chat/)
  assert.throws(() => plan([photo('IMG_1.jpg')], [att('IMG_1.jpg', { filedTo: 'e9' })]), /not an unfiled photo/)
  assert.throws(() => plan([photo('IMG_1.jpg', { caption: '  ' })]), /caption is required/)
  assert.throws(() => plan([photo('IMG_1.jpg', { kind: 'document' })]), /kind must be photo or logo/)
  assert.throws(() => plan([photo('IMG_1.jpg'), photo('IMG_1.jpg')]), /listed twice/)
  assert.throws(() => plan([]), /non-empty list/)
})

test('planFiling: a logo drops photo-only flags and frees the old logo name', () => {
  const withLogo: Intake = { ...intake, assets: [...intake.assets!, { id: 'l', url: `${HOST}/ops-intake/e1/l-logo.png`, filename: 'logo.png', kind: 'logo', uploadedAt: 'x' }] }
  const out = plan([photo('logo.png', { kind: 'logo', service: 'Drywall Repair', heroCandidate: true })], undefined, withLogo)
  assert.equal(out[0].asset.kind, 'logo')
  assert.equal(out[0].asset.filename, 'logo.png')
  assert.equal(out[0].asset.heroCandidate, undefined)
  assert.equal(out[0].asset.service, undefined)
  assert.throws(() => plan([photo('logo.png', { kind: 'logo' }), photo('IMG_2.jpg', { kind: 'logo' })]), /one logo/)
})

test('parseChatMessage (the message route body): text, attachments, or both', () => {
  const a = att('IMG_9.HEIC.jpg')
  assert.deepEqual(parseChatMessage({ body: ' hi ' }), { text: 'hi', attachments: [] })
  const both = parseChatMessage({ body: "these are Enio's", attachments: [{ url: a.url, filename: 'IMG_9.jpg', width: 2400, height: 1800, bytes: 1000 }] })
  assert.equal(both.attachments[0].filename, 'IMG_9.jpg')
  assert.equal(both.attachments[0].width, 2400)
  assert.equal(parseChatMessage({ attachments: [{ url: a.url, filename: 'x.jpg', bytes: 5 }] }).text, '')
  assert.equal(parseChatMessage({ attachments: [{ url: a.url, filename: 'x.svg', bytes: 5 }] }).attachments[0].width, null)
  assert.throws(() => parseChatMessage({}), /body or attachments is required/)
  assert.throws(() => parseChatMessage({ body: 'x', extra: 1 }), /Unknown field: extra/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: `${HOST}/ops-intake/e1/x.jpg`, filename: 'x.jpg', bytes: 5 }] }), /not an HQ inbox upload/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: 'https://evil.example.com/ops-inbox/x.jpg', filename: 'x.jpg', bytes: 5 }] }), /not an HQ inbox upload/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: a.url, filename: 'x.jpg', bytes: 5, caption: 'no' }] }), /unknown fields: caption/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: a.url, filename: 'x.jpg', bytes: 0 }] }), /bytes must be the file size/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: a.url, filename: 'x.jpg', bytes: 5 }, { url: a.url, filename: 'x.jpg', bytes: 5 }] }), /duplicate/)
  assert.throws(() => parseChatMessage({ attachments: Array.from({ length: 21 }, (_, i) => ({ url: `${HOST}/ops-inbox/${i}.jpg`, filename: 'x.jpg', bytes: 5 })) }), /at most 20/)
})

test('inbox paths and URLs', () => {
  assert.equal(inboxPath('u1', 'Front Yard.JPG'), 'ops-inbox/u1-front-yard.jpg')
  assert.ok(isInboxUrl(`${HOST}/ops-inbox/u1-a.jpg`))
  assert.ok(!isInboxUrl(`${HOST}/ops-inbox/nested/a.jpg`))
  assert.ok(!isInboxUrl(`http://x.public.blob.vercel-storage.com/ops-inbox/a.jpg`))
  assert.equal(filedNote(1), 'Filed 1 photo from chat')
  assert.equal(filedNote(6), 'Filed 6 photos from chat')
})

test('file_photos tool schema: required fields and enums', () => {
  const s = FILE_PHOTOS_TOOL.input_schema
  assert.equal(FILE_PHOTOS_TOOL.name, 'file_photos')
  assert.deepEqual([...s.required], ['engagementId', 'photos'])
  const item = s.properties.photos.items
  assert.deepEqual([...item.required], ['url', 'filename', 'caption', 'heroCandidate', 'kind'])
  assert.deepEqual([...item.properties.kind.enum], ['photo', 'logo'])
  assert.deepEqual([...item.properties.beforeAfter.enum], ['before', 'after'])
  assert.equal(s.properties.photos.maxItems, 20)
  assert.match(FILE_PHOTOS_TOOL.description, /never a town/)
  assert.match(FILE_PHOTOS_TOOL.description, /Never writes or changes the brief/)
  assert.doesNotMatch(JSON.stringify(FILE_PHOTOS_TOOL), /\u2014/)
})
