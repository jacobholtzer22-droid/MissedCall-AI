// ===========================================
// Videos through the intake and the HQ chat
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MAX_VIDEO_BYTES, payloadAssets, readVideoFields, rejectReason, withAssetSections, type Intake } from './intake'
import { collectInbox, filedNote, inboxText, parseChatMessage, planAll, planFiling, type ChatAttachment, type InboxEntry } from './photo-filing'

const HOST = 'https://r48zbwxf2ehaous5.public.blob.vercel-storage.com'
const vid = `${HOST}/ops-inbox/u1-img_0412.mov`
const frames = [1, 11, 21].map((time, i) => ({ url: `${vid}.frame-${i + 1}.jpg`, time }))
const videoAtt = (extra: Partial<ChatAttachment> = {}): ChatAttachment => ({
  url: vid,
  filename: 'IMG_0412.MOV',
  width: 1080,
  height: 1920,
  bytes: 50_000_000,
  kind: 'video',
  frames,
  posterUrl: frames[1].url,
  duration: 22,
  codec: 'hvc1',
  ...extra,
})
const photoAtt = (name: string): ChatAttachment => ({ url: `${HOST}/ops-inbox/u-${name.toLowerCase()}`, filename: name, width: 2400, height: 1800, bytes: 1_000_000 })
const intake: Intake = { services: [{ name: 'Patio Lighting' }], assets: [] }

test('rejectReason: videos up to 300 MB on photo and chat uploads, never on the logo', () => {
  assert.equal(rejectReason({ name: 'IMG_0412.MOV', type: '', size: 50_000_000 }, 'photo'), null)
  assert.equal(rejectReason({ name: 'clip.webm', type: 'video/webm', size: 1000 }, 'chat'), null)
  assert.match(rejectReason({ name: 'big.mov', type: 'video/quicktime', size: MAX_VIDEO_BYTES + 1 }, 'chat')!, /Too large: .* the limit is 300\.0 MB for a video/)
  assert.match(rejectReason({ name: 'clip.mp4', type: 'video/mp4', size: 1000 }, 'logo')!, /Bad type/)
  // A 41 MB photo is still refused: the 300 MB cap is for videos only.
  assert.match(rejectReason({ name: 'a.jpg', type: 'image/jpeg', size: 41 * 1024 * 1024 }, 'photo')!, /limit is 40\.0 MB$/)
})

test('readVideoFields: frames must sit beside the video; poster defaults to the middle frame', () => {
  const fail = (m: string): never => {
    throw new Error(m)
  }
  const ok = readVideoFields({ frames, duration: 22, codec: 'hvc1', bytes: 5 }, vid, () => true, fail)
  assert.equal(ok.posterUrl, frames[1].url)
  assert.equal(ok.duration, 22)
  assert.throws(() => readVideoFields({ frames: [{ url: `${HOST}/ops-inbox/other.mov.frame-1.jpg`, time: 1 }] }, vid, () => true, fail), /not a poster frame of this video/)
  assert.throws(() => readVideoFields({ frames, posterUrl: `${HOST}/x.jpg` }, vid, () => true, fail), /posterUrl must be one of the frames/)
  assert.throws(() => readVideoFields({ frames: [...frames, frames[0]] }, vid, () => true, fail), /at most 3/)
  assert.throws(() => readVideoFields({ codec: 'not a codec!' }, vid, () => true, fail), /short codec name/)
})

test('parseChatMessage takes a video with its frames, and refuses a video sent as a photo', () => {
  const { attachments } = parseChatMessage({ attachments: [{ url: vid, filename: 'IMG_0412.MOV', width: 1080, height: 1920, bytes: 50_000_000, kind: 'video', frames, duration: 22, codec: 'hvc1' }] })
  assert.equal(attachments[0].kind, 'video')
  assert.equal(attachments[0].posterUrl, frames[1].url)
  assert.equal(attachments[0].frames!.length, 3)
  assert.throws(() => parseChatMessage({ attachments: [{ url: vid, filename: 'IMG_0412.MOV', width: null, height: null, bytes: 5 }] }), /is a video: send it with kind video/)
  assert.throws(() => parseChatMessage({ attachments: [{ url: frames[0].url, filename: 'f.jpg', width: null, height: null, bytes: 5 }] }), /not an HQ inbox upload/)
  const photo = photoAtt('a.jpg')
  assert.throws(() => parseChatMessage({ attachments: [{ ...photo, frames }] }), /are for videos/)
  // 50 MB is fine for a video, too big for a photo.
  assert.throws(() => parseChatMessage({ attachments: [{ ...photo, bytes: 50_000_000 }] }), /bytes must be the file size/)
})

test('collectInbox: a video owns its frames; an unsent video picks its frames up from Blob', () => {
  const now = new Date('2026-10-31T12:00:00Z')
  const sent = collectInbox(
    [{ id: 'm1', createdAt: now, attachments: [videoAtt()] }],
    [
      { url: vid, pathname: 'ops-inbox/u1-img_0412.mov', size: 5, uploadedAt: now },
      ...frames.map((f, i) => ({ url: f.url, pathname: `ops-inbox/u1-img_0412.mov.frame-${i + 1}.jpg`, size: 5, uploadedAt: now })),
    ],
    now
  )
  assert.equal(sent.length, 1)
  const unsentPath = 'ops-inbox/u2-clip.mp4'
  const unsent = collectInbox(
    [],
    [
      { url: `${HOST}/${unsentPath}`, pathname: unsentPath, size: 5, uploadedAt: now },
      { url: `${HOST}/${unsentPath}.frame-2.jpg`, pathname: `${unsentPath}.frame-2.jpg`, size: 5, uploadedAt: now },
      { url: `${HOST}/${unsentPath}.frame-1.jpg`, pathname: `${unsentPath}.frame-1.jpg`, size: 5, uploadedAt: now },
    ],
    now
  )
  assert.equal(unsent.length, 1)
  assert.equal(unsent[0].kind, 'video')
  assert.deepEqual(
    unsent[0].frames!.map((f) => f.url.slice(-11)),
    ['frame-1.jpg', 'frame-2.jpg']
  )
  assert.equal(unsent[0].posterUrl, `${HOST}/${unsentPath}.frame-2.jpg`)
})

test('planFiling files a video with its frames, never as a hero candidate', () => {
  const inbox = [videoAtt(), photoAtt('IMG_1.jpg')]
  const run = (p: Record<string, unknown>[]) => planFiling({ engagementId: 'e1', intake, photos: p, inbox, uuid: () => 'id1', now: new Date('2026-10-31T12:00:00Z') })
  const base = { url: vid, filename: 'IMG_0412.MOV', caption: 'Patio string lights at dusk', heroCandidate: false, kind: 'video' }
  const [v] = run([{ ...base, happens: 'Camera pans along the lit patio', heroVideo: true, service: 'patio lighting' }])
  assert.equal(v.asset.kind, 'video')
  assert.equal(v.asset.heroVideo, true)
  assert.equal(v.asset.service, 'Patio Lighting')
  assert.equal(v.asset.happens, 'Camera pans along the lit patio')
  assert.equal(v.asset.duration, 22)
  assert.deepEqual(
    v.frames.map((f) => f.pathname),
    [1, 2, 3].map((n) => `ops-intake/e1/id1-img_0412.mov.frame-${n}.jpg`)
  )
  assert.throws(() => run([{ ...base, heroCandidate: true }]), /never heroCandidate/)
  assert.throws(() => run([{ ...base, kind: 'photo' }]), /is a video: kind must be video/)
  assert.throws(() => run([{ url: photoAtt('IMG_1.jpg').url, filename: 'IMG_1.jpg', caption: 'x y z', heroCandidate: false, kind: 'video' }]), /is not a video/)
  assert.throws(() => run([{ url: photoAtt('IMG_1.jpg').url, filename: 'IMG_1.jpg', caption: 'x y z', heroCandidate: false, kind: 'photo', heroVideo: true }]), /are for videos/)
})

test('planAll: a captioned video is filed as a video, never the hero, never the hero video', () => {
  const at = '2026-10-31T12:00:00Z'
  const cap = { suggestedService: 'Patio lighting', beforeAfter: null, isLogo: false, hasFaceOrPlate: false, captionedAt: at }
  const entries: InboxEntry[] = [
    { ...videoAtt(), ...cap, caption: 'Lit patio at dusk from the yard', heroScore: 5, happens: 'Camera pans along the lit patio', messageId: 'm1', uploadedAt: at },
    { ...photoAtt('IMG_1.jpg'), ...cap, caption: 'Wide shot of the finished patio lights', heroScore: 3, messageId: 'm1', uploadedAt: at },
  ]
  const p = planAll(entries, intake)
  const v = p.photos.find((x) => x.url === vid)!
  assert.equal(v.kind, 'video')
  assert.equal(v.heroCandidate, false)
  assert.equal(v.happens, 'Camera pans along the lit patio')
  assert.equal(v.service, 'Patio Lighting')
  assert.equal(p.hero, 'IMG_1.jpg')
  assert.match(inboxText(entries, 5, null).text, /IMG_0412\.MOV 1080x1920 video 22s: "Lit patio at dusk from the yard" happens: "Camera pans along the lit patio"/)
})

test('payloadAssets and the brief carry the video fields', () => {
  const i: Intake = {
    assets: [
      {
        id: 'v1',
        url: `${HOST}/ops-intake/e1/v1-clip.mov`,
        filename: 'clip.mov',
        kind: 'video',
        caption: 'Lit patio',
        happens: 'Camera pans along the patio',
        heroVideo: true,
        heroCandidate: true,
        posterUrl: 'p2',
        frames: [
          { url: 'p1', time: 1 },
          { url: 'p2', time: 11 },
        ],
        duration: 22,
        width: 1080,
        height: 1920,
        codec: 'hvc1',
        bytes: 9,
        uploadedAt: '2026-10-31T00:00:00Z',
      },
      { id: 'p1', url: `${HOST}/ops-intake/e1/p1-a.jpg`, filename: 'a.jpg', kind: 'photo', heroCandidate: true, uploadedAt: '2026-10-31T00:00:00Z' },
    ],
  }
  const [v, p] = payloadAssets(i)
  assert.equal(v.heroCandidate, false)
  assert.equal(v.heroVideo, true)
  assert.equal(v.posterTime, 11)
  assert.equal(v.codec, 'hvc1')
  assert.equal(p.heroCandidate, true)
  assert.equal('frames' in p, false)
  assert.match(withAssetSections('# Brief\n', i), /- video \| .*clip\.mov \| Lit patio \(Camera pans along the patio\), 22s \| hero video \|/)
})

test('filedNote counts videos apart', () => {
  assert.equal(filedNote(5, 1), 'Filed 4 photos and 1 video from chat')
  assert.equal(filedNote(2), 'Filed 2 photos from chat')
  assert.equal(filedNote(1, 1), 'Filed 1 video from chat')
})
