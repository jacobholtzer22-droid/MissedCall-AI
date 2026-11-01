import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ANSWERABLE,
  AnswerError,
  CLIENT_LINK_LIMITS,
  CLIENT_LINK_TTL_MS,
  LINK_UPLOAD_KINDS,
  QUESTIONS,
  applyAnswers,
  claimIsCurrent,
  clientIntakeEnabled,
  clientIntakeKey,
  clientLinkUrl,
  finishIntake,
  publicView,
  readAnswerPatch,
  signClientLink,
  verifyClientLink,
  type IntakeWithLink,
} from './client-intake'
import { isOwnAssetUrl, uploadTokenOptions } from './intake-server'
import { MAX_SOURCE_BYTES, MAX_VIDEO_BYTES, rejectReason } from './intake'
import { rateLimit } from '../rate-limit'

const KEY = 'test-key-not-a-real-secret'
const ENG = 'cmabc123def456ghi789jkl0'
const OTHER = 'cmzzz999yyy888xxx777www6'
const NONCE = 'AbCdEfGhIjKl'
const NOW = Date.parse('2026-11-01T15:00:00Z')

test('the flag is off unless exactly "true"; the key falls back to OTP_SECRET', () => {
  assert.equal(clientIntakeEnabled({}), false)
  assert.equal(clientIntakeEnabled({ CLIENT_INTAKE_LINK: '1' }), false)
  assert.equal(clientIntakeEnabled({ CLIENT_INTAKE_LINK: 'true' }), true)
  assert.equal(clientIntakeKey({}), null)
  assert.equal(clientIntakeKey({ OTP_SECRET: 'o' }), 'o')
  assert.equal(clientIntakeKey({ OTP_SECRET: 'o', CLIENT_INTAKE_SECRET: 'c' }), 'c')
})

test('token: sign and verify, expiry, tampering, wrong key, no key', () => {
  const exp = NOW + CLIENT_LINK_TTL_MS
  const t = signClientLink(ENG, NONCE, exp, KEY)
  assert.deepEqual(verifyClientLink(t, KEY, NOW), { ok: true, engagementId: ENG, nonce: NONCE, expiresAt: exp })
  // 30 days and a minute later it is expired.
  assert.deepEqual(verifyClientLink(t, KEY, exp + 60_000), { ok: false, reason: 'expired' })
  // Swapping in another client's id breaks the signature: a token opens exactly one engagement.
  const [, e, n, s] = t.split('.')
  assert.equal(verifyClientLink([OTHER, e, n, s].join('.'), KEY, NOW).ok, false)
  // A pushed-out expiry breaks it too.
  assert.equal(verifyClientLink([ENG, (exp + CLIENT_LINK_TTL_MS).toString(36), n, s].join('.'), KEY, NOW).ok, false)
  assert.deepEqual(verifyClientLink(t, 'another-key', NOW), { ok: false, reason: 'bad_signature' })
  assert.deepEqual(verifyClientLink(t, null, NOW), { ok: false, reason: 'no_key' })
  for (const bad of ['', 'a.b.c', `${t}.x`, 'x'.repeat(300), `../${t}`]) assert.equal(verifyClientLink(bad, KEY, NOW).ok, false, bad)
})

test('token: a watch-link style signature with the same key never verifies (domain separated)', () => {
  const exp = (NOW + 1000).toString(36)
  const payload = `${ENG}.${exp}.${NONCE}`
  const plain = createHmac('sha256', KEY).update(payload).digest('base64url').slice(0, 32)
  assert.deepEqual(verifyClientLink(`${payload}.${plain}`, KEY, NOW), { ok: false, reason: 'bad_signature' })
})

test('revocation and scoping: only the engagement current nonce opens it', () => {
  const claim = { engagementId: ENG, nonce: NONCE }
  const live: IntakeWithLink = { clientLink: { nonce: NONCE, issuedAt: '', expiresAt: '' } }
  assert.equal(claimIsCurrent(claim, { id: ENG, intake: live }), true)
  // Replaced by a newer link.
  assert.equal(claimIsCurrent(claim, { id: ENG, intake: { clientLink: { nonce: 'ZZZZZZZZZZZZ', issuedAt: '', expiresAt: '' } } }), false)
  // Revoked (no clientLink at all).
  assert.equal(claimIsCurrent(claim, { id: ENG, intake: {} }), false)
  // Another engagement that happens to hold the same nonce.
  assert.equal(claimIsCurrent(claim, { id: OTHER, intake: live }), false)
})

test('the URL carries the token only', () => {
  const t = signClientLink(ENG, NONCE, NOW + 1000, KEY)
  assert.equal(clientLinkUrl(t, 'https://www.alignandacquire.com/'), `https://www.alignandacquire.com/intake/${t}`)
  assert.doesNotMatch(clientLinkUrl(t, 'https://x.test'), /[?&@]|%40/)
})

test('the questions are the onboarding questionnaire, verbatim and in order', () => {
  const doc = readFileSync(join(process.cwd(), 'docs', 'ops', 'onboarding-questionnaire.md'), 'utf8')
  assert.equal(QUESTIONS.length, 28)
  for (const q of QUESTIONS) assert.ok(doc.includes(`\n${q.n}. ${q.text}\n`), `question ${q.n} drifted from the doc`)
  assert.deepEqual(QUESTIONS.filter((q) => q.info).map((q) => q.n), [20])
  assert.equal(ANSWERABLE.length, 27)
  for (const q of QUESTIONS) assert.doesNotMatch(q.text, /[\u2013\u2014]/)
})

test('answers: only real question numbers, text only, capped', () => {
  assert.deepEqual(readAnswerPatch({ answers: { '1': 'Client A LLC', '24': 'Drive link' } }), { '1': 'Client A LLC', '24': 'Drive link' })
  for (const bad of [
    null,
    [],
    { answers: { '29': 'x' } },
    { answers: { '20': 'x' } },
    { answers: { '0': 'x' } },
    { answers: { '1': 5 } },
    { answers: { '1': 'x'.repeat(4001) } },
    { answers: {}, rawNotes: 'sneak' },
    { business: { phone: '1' } },
    { answers: { 'business': 'x' } },
  ]) {
    assert.throws(() => readAnswerPatch(bad), AnswerError, JSON.stringify(bad)?.slice(0, 60))
  }
})

test('partial save keeps every other answer and every other intake key; empty clears one', () => {
  const start: IntakeWithLink = {
    rawNotes: "Jacob's notes",
    business: { phone: '+15555550100' },
    clientLink: { nonce: NONCE, issuedAt: 'a', expiresAt: 'b' },
  }
  const one = applyAnswers(start, { '1': 'Client A LLC' }, new Date(NOW))
  const two = applyAnswers(one, { '2': 'Roofing, gutters' }, new Date(NOW + 1000))
  assert.deepEqual(two.questionnaire?.answers, { '1': 'Client A LLC', '2': 'Roofing, gutters' })
  assert.equal(two.rawNotes, "Jacob's notes")
  assert.deepEqual(two.business, { phone: '+15555550100' })
  assert.equal(two.clientLink?.nonce, NONCE)
  const cleared = applyAnswers(two, { '1': '  ' }, new Date(NOW + 2000))
  assert.deepEqual(cleared.questionnaire?.answers, { '2': 'Roofing, gutters' })
})

test('Done writes one "Answers in" note, then only again when something changed', () => {
  let i = applyAnswers({}, { '1': 'Client A LLC', '11': '555 0100' }, new Date(NOW))
  i = { ...i, assets: [{ id: 'a', url: 'u', filename: 'job.jpg', kind: 'photo', via: 'client_link', uploadedAt: new Date(NOW).toISOString() }] }
  const first = finishIntake(i, new Date(NOW + 1000))
  assert.ok(first.note?.startsWith("Answers in from the client's intake link: 2 of 27 answered"))
  assert.match(first.note!, /1 photo, 0 videos/)
  assert.match(first.note!, /still empty from the campaign set: 2, 3, 4/)
  assert.match(first.note!, /Nothing was sent\. Ask the chief to map the answers; the brief still waits for your OK\./)
  assert.doesNotMatch(first.note!, /[\u2013\u2014]/)
  assert.ok(first.intake.questionnaire?.finishedAt)
  // Done again with nothing new: no second note.
  assert.equal(finishIntake(first.intake, new Date(NOW + 2000)).note, null)
  // A new answer after Done: one "Answers updated" note.
  const more = applyAnswers(first.intake, { '2': 'Painting' }, new Date(NOW + 3000))
  assert.match(finishIntake(more, new Date(NOW + 4000)).note ?? '', /^Answers updated/)
})

test('the page sees only its own answers and file names', () => {
  const view = publicView({
    displayName: ' Client A Painting ',
    contactName: 'Pat Smith',
    intake: {
      rawNotes: 'private',
      gbp: { placeId: 'p', reviews: [] },
      clientLink: { nonce: NONCE, issuedAt: '', expiresAt: '' },
      questionnaire: { answers: { '1': 'Client A' }, updatedAt: '' },
      assets: [
        { id: '1', url: 'https://x.public.blob.vercel-storage.com/ops-intake/e/1-a.jpg', filename: 'a.jpg', kind: 'photo', uploadedAt: '' },
        { id: '2', url: 'https://y/doc.pdf', filename: 'contract.pdf', kind: 'document', uploadedAt: '' },
      ],
    },
  })
  assert.deepEqual(view, { businessName: 'Client A Painting', firstName: 'Pat', answers: { '1': 'Client A' }, files: [{ filename: 'a.jpg', kind: 'photo' }], finished: false })
  assert.doesNotMatch(JSON.stringify(view), /private|blob\.vercel|nonce|AbCdEf|placeId|contract/)
})

test('uploads: own prefix only, photo and logo only, same size caps as the admin uploader', () => {
  const opts = (path: string, kind: string) => uploadTokenOptions(ENG, path, JSON.stringify({ kind }), LINK_UPLOAD_KINDS)
  assert.equal(opts(`ops-intake/${ENG}/u-a.jpg`, 'photo').maximumSizeInBytes, MAX_SOURCE_BYTES)
  assert.equal(opts(`ops-intake/${ENG}/u-a.mov`, 'photo').maximumSizeInBytes, MAX_VIDEO_BYTES)
  assert.ok(opts(`ops-intake/${ENG}/u-logo.png`, 'logo').allowedContentTypes.includes('image/png'))
  assert.throws(() => opts(`ops-intake/${OTHER}/u-a.jpg`, 'photo'), /not this client/)
  assert.throws(() => opts(`ops-inbox/u-a.jpg`, 'photo'), /not this client/)
  assert.throws(() => opts(`ops-intake/${ENG}/u-a.pdf`, 'document'), /kind must be photo or logo/)
  assert.throws(() => opts(`ops-intake/${ENG}/u-a.jpg`, 'chat'), /kind must be photo or logo/)
  // The admin route's default rules are unchanged.
  assert.throws(() => uploadTokenOptions(ENG, `ops-intake/${ENG}/x.jpg`, JSON.stringify({ kind: 'chat' })), /^Error: kind must be photo, logo or document$/)
  assert.ok(uploadTokenOptions(ENG, `ops-intake/${ENG}/x.pdf`, JSON.stringify({ kind: 'document' })).allowedContentTypes.includes('application/pdf'))
  // Registered URLs must sit under this client's own prefix.
  assert.equal(isOwnAssetUrl(`https://abc.public.blob.vercel-storage.com/ops-intake/${ENG}/u-a.jpg`, ENG), true)
  assert.equal(isOwnAssetUrl(`https://abc.public.blob.vercel-storage.com/ops-intake/${OTHER}/u-a.jpg`, ENG), false)
  // The browser-side checks are the shared ones.
  assert.match(rejectReason({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }, 'photo') ?? '', /^Bad type/)
  assert.match(rejectReason({ name: 'a.mov', type: 'video/quicktime', size: MAX_VIDEO_BYTES + 1 }, 'photo') ?? '', /^Too large/)
})

test('rate limits: every route has one, and the window holds', () => {
  assert.deepEqual(Object.keys(CLIENT_LINK_LIMITS).sort(), ['finish', 'read', 'register', 'save', 'token'])
  const key = `client-intake:finish:test-${Date.now()}`
  for (let n = 0; n < CLIENT_LINK_LIMITS.finish; n++) assert.equal(rateLimit(key, CLIENT_LINK_LIMITS.finish, 60_000).allowed, true)
  assert.equal(rateLimit(key, CLIENT_LINK_LIMITS.finish, 60_000).allowed, false)
})

test('flag off: every route answers 404 before reading anything', async () => {
  const prev = process.env.CLIENT_INTAKE_LINK
  delete process.env.CLIENT_INTAKE_LINK
  try {
    const { guard } = await import('./client-intake-server')
    const t = signClientLink(ENG, NONCE, NOW + CLIENT_LINK_TTL_MS, KEY)
    for (const route of ['read', 'save', 'token', 'register', 'finish'] as const) {
      const g = await guard(new Request('http://localhost/api/intake/x'), t, route)
      assert.ok('response' in g)
      assert.equal(g.response.status, 404)
    }
  } finally {
    if (prev !== undefined) process.env.CLIENT_INTAKE_LINK = prev
  }
})

test('flag on: a bad token is a plain 404, and the per-IP limit answers 429', async () => {
  const prev = { flag: process.env.CLIENT_INTAKE_LINK, key: process.env.CLIENT_INTAKE_SECRET }
  process.env.CLIENT_INTAKE_LINK = 'true'
  process.env.CLIENT_INTAKE_SECRET = KEY
  try {
    const { guard } = await import('./client-intake-server')
    const ip = `203.0.113.${(Date.now() % 250) + 1}`
    const req = () => new Request('http://localhost/api/intake/x', { headers: { 'x-forwarded-for': ip } })
    // Malformed and wrongly signed tokens never reach the database.
    const bad = await guard(req(), 'not-a-token', 'read')
    assert.ok('response' in bad)
    assert.equal(bad.response.status, 404)
    let last = 0
    for (let n = 0; n <= CLIENT_LINK_LIMITS.finish; n++) {
      const g = await guard(req(), 'still-not-a-token', 'finish')
      if ('response' in g) last = g.response.status
    }
    assert.equal(last, 429)
  } finally {
    if (prev.flag === undefined) delete process.env.CLIENT_INTAKE_LINK
    else process.env.CLIENT_INTAKE_LINK = prev.flag
    if (prev.key === undefined) delete process.env.CLIENT_INTAKE_SECRET
    else process.env.CLIENT_INTAKE_SECRET = prev.key
  }
})
