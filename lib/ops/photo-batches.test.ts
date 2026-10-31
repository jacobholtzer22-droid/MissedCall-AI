// ===========================================
// HQ photo batches: inbox, captions, file_photos all:true, the 6-photo view
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Intake } from './intake'
import { BATCH_THRESHOLD, applyCaptions, captionInChunks, cleanCaption, collectInbox, inboxText, isBatch, matchService, orphanFilename, planAll, planFiling, type ChatAttachment, type InboxEntry, type PhotoCaption } from './photo-filing'
import { withPhotos } from './hq/photo-view'

const HOST = 'https://r48zbwxf2ehaous5.public.blob.vercel-storage.com'
const NOW = new Date('2026-10-31T12:00:00Z')
const url = (name: string) => `${HOST}/ops-inbox/${name}`
const att = (name: string, extra: Partial<ChatAttachment> = {}): ChatAttachment => ({ url: url(name), filename: name, width: 2400, height: 1800, bytes: 1000, ...extra })
const cap = (extra: Partial<PhotoCaption> = {}): PhotoCaption => ({
  caption: 'Freshly painted living room walls in a soft gray with white trim',
  suggestedService: 'Interior painting',
  heroScore: 2,
  beforeAfter: null,
  isLogo: false,
  hasFaceOrPlate: false,
  captionedAt: NOW.toISOString(),
  ...extra,
})
const entry = (name: string, extra: Partial<InboxEntry> = {}): InboxEntry => ({ ...att(name), messageId: 'm1', uploadedAt: NOW.toISOString(), ...extra })

test('collectInbox: unfiled photos across messages, deduped, plus unsent blobs; filed and expired left out', () => {
  const hour = (h: number) => new Date(NOW.getTime() - h * 3600_000)
  const messages = [
    { id: 'old', createdAt: hour(24 * 8), attachments: [att('expired.jpg')] },
    { id: 'm1', createdAt: hour(3), attachments: [att('a.jpg'), att('b.jpg', { filedTo: 'e1' }), att('dup.jpg')] },
    { id: 'm2', createdAt: hour(1), attachments: [att('dup.jpg', { caption: 'x' }), att('c.jpg')] },
  ]
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e'
  const blobs = [
    { url: url(`${uuid}-img_7009.jpg`), pathname: `ops-inbox/${uuid}-img_7009.jpg`, size: 900, uploadedAt: hour(2) },
    { url: url('a.jpg'), pathname: 'ops-inbox/a.jpg', size: 1, uploadedAt: hour(3) },
    { url: url('b.jpg'), pathname: 'ops-inbox/b.jpg', size: 1, uploadedAt: hour(3) },
    { url: url('stale.jpg'), pathname: 'ops-inbox/stale.jpg', size: 1, uploadedAt: hour(24 * 9) },
  ]
  const out = collectInbox(messages, blobs, NOW)
  assert.deepEqual(out.map((e) => [e.filename, e.messageId]), [['a.jpg', 'm1'], ['dup.jpg', 'm2'], ['c.jpg', 'm2'], ['img_7009.jpg', null]])
  assert.equal(out[1].caption, 'x', 'the newest message wins a url on two messages')
  assert.equal(out[3].bytes, 900)
  assert.equal(orphanFilename('ops-inbox/plain.jpg'), 'plain.jpg')
})

test('list_inbox text: counts per drop and the first N, never images', () => {
  const entries = [entry('a.jpg', cap()), entry('b.jpg'), entry('c.jpg', { messageId: null })]
  const { text, counts } = inboxText(entries, 2, { done: 10, total: 50 })
  assert.deepEqual(counts, { unfiled: 3, captioned: 1, uncaptioned: 2, unsent: 1 })
  assert.match(text, /3 unfiled photos: 1 captioned, 2 not captioned/)
  assert.match(text, /captioning now: 10 of 50 done/)
  assert.match(text, /messageId m1, sent .*: 2 photos, 1 captioned/)
  assert.match(text, /unsent .*: 1 photos/)
  assert.match(text, /1\. a\.jpg 2400x1800: "Freshly painted.*" service: Interior painting, hero 2\/5/)
  assert.match(text, /2\. b\.jpg 2400x1800: not captioned/)
  assert.doesNotMatch(text, /c\.jpg/)
})

test('caption writer: each chunk is saved before the next, so a crash keeps progress', async () => {
  const entries = Array.from({ length: 25 }, (_, n) => entry(`p${n}.jpg`))
  const saved = new Map<string, PhotoCaption>()
  const progress: number[] = []
  let calls = 0
  await assert.rejects(
    captionInChunks({
      entries,
      chunkSize: 10,
      caption: async (chunk) => {
        if (++calls === 2) throw new Error('Anthropic HTTP 529')
        return new Map(chunk.map((e) => [e.url, cap()]))
      },
      save: async (c) => c.forEach((v, k) => saved.set(k, v)),
      progress: (done) => void progress.push(done),
    }),
    /529/
  )
  assert.equal(saved.size, 10)
  assert.deepEqual(progress, [10])
  assert.ok(saved.has(url('p9.jpg')) && !saved.has(url('p10.jpg')))

  // A new run picks up the rest; a photo the model skipped is reported, not saved.
  const rest = entries.filter((e) => !saved.has(e.url))
  const r = await captionInChunks({
    entries: rest,
    chunkSize: 10,
    caption: async (chunk) => new Map(chunk.filter((e) => e.filename !== 'p20.jpg').map((e) => [e.url, cap()])),
    save: async (c) => c.forEach((v, k) => saved.set(k, v)),
  })
  assert.equal(r.done, 14)
  assert.deepEqual(r.missed, [url('p20.jpg')])
  assert.equal(saved.size, 24)

  const stopped = await captionInChunks({ entries: rest, chunkSize: 10, caption: async () => new Map(), save: async () => undefined, stopped: async () => true })
  assert.deepEqual(stopped, { done: 0, missed: [], stopped: true })
})

test('caption cleaning and writing onto attachments', () => {
  const c = cleanCaption({ caption: 'Gray siding \u2014 one ' + 'word '.repeat(30), heroScore: 9, suggestedService: ' Siding ', beforeAfter: 'during', isLogo: 'yes' }, NOW)!
  assert.ok(c.caption.split(' ').length <= 20)
  const long = 'Narrow side yard with large concrete stepping pavers set in grass, black mulch bed with boxwood shrubs beside a white fence and gate'
  assert.equal(cleanCaption({ caption: long }, NOW)!.caption, 'Narrow side yard with large concrete stepping pavers set in grass.')
  const noComma = 'Front entry with fresh black mulch beds variegated grass plantings trimmed shrubs and a neat lawn edge in front of the porch steps today'
  assert.equal(cleanCaption({ caption: noComma }, NOW)!.caption, 'Front entry with fresh black mulch beds variegated grass plantings trimmed shrubs and a neat lawn edge in front.')
  assert.equal(cleanCaption({ caption: 'Fresh mulch along a brick wall.' }, NOW)!.caption, 'Fresh mulch along a brick wall.')
  assert.ok(!c.caption.includes('\u2014'))
  assert.equal(c.heroScore, 5)
  assert.equal(c.suggestedService, 'Siding')
  assert.equal(c.beforeAfter, null)
  assert.equal(c.isLogo, false)
  assert.equal(cleanCaption({ caption: 'blurry' }, NOW), null)
  const list = applyCaptions([att('a.jpg'), att('b.jpg', { filedTo: 'e1' })], new Map([[url('a.jpg'), c], [url('b.jpg'), c]]))
  assert.equal(list[0].caption, c.caption)
  assert.equal(list[1].caption, undefined, 'a filed photo keeps what it had')
})

const intake: Intake = { services: [{ name: 'Interior Painting' }, { name: 'Permanent Lighting' }, { name: 'Exterior Painting' }], assets: [] }

test('matchService: exact, or every word of one service name; blank when unsure', () => {
  const names = intake.services!.map((s) => s.name)
  assert.equal(matchService('interior painting', names), 'Interior Painting')
  assert.equal(matchService('Lighting', names), 'Permanent Lighting')
  assert.equal(matchService('Permanent lighting install', names), 'Permanent Lighting')
  assert.equal(matchService('Roofline lighting', names), undefined, 'a shared word alone is not enough')
  assert.equal(matchService('Painting', names), undefined, 'two services contain it: left blank')
  const yard = ['Lawn Mowing', 'Hedge Trimming', 'Mulch Installation', 'Sod Installation']
  assert.equal(matchService('Mulch bed installation', yard), 'Mulch Installation')
  assert.equal(matchService('Hedge trimming and mulching', yard), 'Hedge Trimming')
  assert.equal(matchService('Lawn care', yard), undefined)
  assert.equal(matchService('Lawn renovation', yard), undefined)
  assert.equal(matchService('Mowing', yard), 'Lawn Mowing')
  assert.equal(matchService('Installation', yard), undefined)
  assert.equal(matchService('Roofing', names), undefined)
  assert.equal(matchService(null, names), undefined)
})

test('file_photos all:true: services mapped, one hero (highest, never a face), logo as logo, after before before', () => {
  const entries = [
    entry('before.jpg', cap({ beforeAfter: 'before', heroScore: 1 })),
    entry('wide.jpg', cap({ heroScore: 4, suggestedService: 'Permanent lighting on a roofline' })),
    entry('crew.jpg', cap({ heroScore: 5, hasFaceOrPlate: true, suggestedService: 'Interior painting' })),
    entry('best.jpg', cap({ heroScore: 5, suggestedService: 'Exterior painting' })),
    entry('after.jpg', cap({ beforeAfter: 'after', suggestedService: 'Deck staining' })),
    entry('logo.png', cap({ isLogo: true, suggestedService: null })),
    entry('logo-white.png', cap({ isLogo: true, suggestedService: null })),
    entry('raw.jpg'),
  ]
  const plan = planAll(entries, intake)
  assert.deepEqual(plan.photos.map((p) => p.filename), ['after.jpg', 'wide.jpg', 'crew.jpg', 'best.jpg', 'before.jpg', 'logo.png'])
  assert.equal(plan.hero, 'best.jpg')
  assert.deepEqual(plan.photos.filter((p) => p.heroCandidate).map((p) => p.filename), ['best.jpg'])
  const by = new Map(plan.photos.map((p) => [p.filename, p]))
  assert.equal(by.get('wide.jpg')!.service, 'Permanent Lighting')
  assert.equal(by.get('best.jpg')!.service, 'Exterior Painting')
  assert.equal(by.get('crew.jpg')!.service, undefined, 'a face or plate never gets a service')
  assert.equal(by.get('after.jpg')!.service, undefined)
  assert.equal(by.get('logo.png')!.kind, 'logo')
  assert.deepEqual(plan.extraLogos, ['logo-white.png'])
  assert.deepEqual(plan.unmatched, ['Deck staining'])
  assert.equal(plan.uncaptioned, 1)

  // planFiling takes the whole list (limit = its length) and keeps one hero.
  const filed = planFiling({ engagementId: 'e1', intake, photos: plan.photos, inbox: entries, uuid: () => 'u', limit: plan.photos.length })
  assert.equal(filed.length, 6)
  assert.equal(filed.filter((f) => f.asset.heroCandidate).length, 1)
  assert.doesNotThrow(() => planFiling({ engagementId: 'e1', intake, photos: plan.photos.slice(0, 20), inbox: entries, uuid: () => 'u' }))
  assert.throws(() => planFiling({ engagementId: 'e1', intake, photos: [...plan.photos, ...plan.photos, ...plan.photos, ...plan.photos], inbox: entries, uuid: () => 'u' }), /at most 20 photos per call; for a whole batch use all: true/)

  // A client that already has a hero gets no second one.
  const withHero: Intake = { ...intake, assets: [{ id: 'h', url: 'x', filename: 'h.jpg', kind: 'photo', heroCandidate: true, uploadedAt: 'x' }] }
  assert.equal(planAll(entries, withHero).hero, null)
  assert.ok(planAll(entries, withHero).photos.every((p) => !p.heroCandidate))
})

test('the 6-photo threshold: 6 or fewer are all shown and listed; more shows a count and the first 6', () => {
  assert.equal(BATCH_THRESHOLD, 6)
  assert.ok(!isBatch(6) && isBatch(7))
  const sent = new Date(NOW.getTime() - 60_000)
  const images = (c: ReturnType<typeof withPhotos>) => (typeof c === 'string' ? 0 : c.filter((b) => b.type === 'image').length)

  const six = withPhotos('for Enio', Array.from({ length: 6 }, (_, n) => att(`s${n}.jpg`)), sent, () => true, NOW.getTime())
  assert.equal(images(six), 6)
  assert.match((six as { text?: string }[])[0].text!, /url=.*s5\.jpg/)

  const fifty = Array.from({ length: 50 }, (_, n) => att(`b${n}.jpg`, n < 30 ? cap() : {}))
  fifty[0].filedTo = 'e1'
  const big = withPhotos('', fifty, sent, () => true, NOW.getTime())
  assert.equal(images(big), 6)
  const head = (big as { text?: string }[])[0].text!
  assert.match(head, /50 photos attached to this message: 1 filed, 49 unfiled, 29 of them captioned/)
  assert.match(head, /list_inbox/)
  assert.doesNotMatch(head, /b40\.jpg/)

  // The history-wide image cap still applies.
  let left = 2
  assert.equal(images(withPhotos('', fifty, sent, () => left-- > 0, NOW.getTime())), 2)
})
