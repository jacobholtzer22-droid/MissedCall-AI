import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  NotesError,
  REVIEW_LIMITS,
  applyNotes,
  draftInstruction,
  draftMessage,
  previewFeedbackEnabled,
  previewLinkUrl,
  previewNonceIsCurrent,
  publicReview,
  readNotesPatch,
  reviewPages,
  stepOnApprove,
  submitNotes,
  type IntakeWithPreview,
} from './preview-feedback'
import { CLIENT_LINK_TTL_MS, LINK_DOMAINS, signClientLink, verifyClientLink } from './client-intake'
import { STEP_CATALOG } from './steps'
import { previewText } from './send-drafts'

const KEY = 'test-key-not-a-real-secret'
const ENG = 'cmabc123def456ghi789jkl0'
const OTHER = 'cmzzz999yyy888xxx777www6'
const NONCE = 'AbCdEfGhIjKl'
const NOW = Date.parse('2026-11-01T15:00:00Z')
const intake = (p: Partial<IntakeWithPreview> = {}): IntakeWithPreview => ({
  services: [{ name: 'Interior painting' }, { name: 'Cabinet refinishing' }],
  previewLink: { nonce: NONCE, issuedAt: '', expiresAt: '' },
  ...p,
})

test('the flag is off unless exactly "true"', () => {
  assert.equal(previewFeedbackEnabled({}), false)
  assert.equal(previewFeedbackEnabled({ PREVIEW_FEEDBACK: 'yes' }), false)
  assert.equal(previewFeedbackEnabled({ PREVIEW_FEEDBACK: 'true' }), true)
})

test('token: its own purpose prefix, expiry, one engagement, revocable', () => {
  const exp = NOW + CLIENT_LINK_TTL_MS
  const t = signClientLink(ENG, NONCE, exp, KEY, LINK_DOMAINS.preview)
  assert.deepEqual(verifyClientLink(t, KEY, NOW, LINK_DOMAINS.preview), { ok: true, engagementId: ENG, nonce: NONCE, expiresAt: exp })
  // An intake link never opens the review page, and the other way round.
  assert.equal(verifyClientLink(t, KEY, NOW).ok, false)
  assert.equal(verifyClientLink(signClientLink(ENG, NONCE, exp, KEY), KEY, NOW, LINK_DOMAINS.preview).ok, false)
  assert.deepEqual(verifyClientLink(t, KEY, exp + 1, LINK_DOMAINS.preview), { ok: false, reason: 'expired' })
  const [, e, n, s] = t.split('.')
  assert.equal(verifyClientLink([OTHER, e, n, s].join('.'), KEY, NOW, LINK_DOMAINS.preview).ok, false)
  // Scoping and revocation: only this engagement's current nonce.
  const claim = { engagementId: ENG, nonce: NONCE }
  assert.equal(previewNonceIsCurrent(claim, { id: ENG, intake: intake() }), true)
  assert.equal(previewNonceIsCurrent(claim, { id: OTHER, intake: intake() }), false)
  assert.equal(previewNonceIsCurrent(claim, { id: ENG, intake: intake({ previewLink: undefined }) }), false)
  assert.equal(previewNonceIsCurrent(claim, { id: ENG, intake: intake({ previewLink: { nonce: 'ZZZZZZZZZZZZ', issuedAt: '', expiresAt: '' } }) }), false)
  // The intake link's nonce does not open it either.
  assert.equal(previewNonceIsCurrent(claim, { id: ENG, intake: { clientLink: { nonce: NONCE, issuedAt: '', expiresAt: '' } } as IntakeWithPreview }), false)
  assert.equal(previewLinkUrl(t, 'https://www.alignandacquire.com'), `https://www.alignandacquire.com/review/${t}`)
})

test('pages: home, one per service, about, contact, anything else', () => {
  assert.deepEqual(reviewPages(intake()).map((p) => p.label), ['Home page', 'Interior painting page', 'Cabinet refinishing page', 'About page', 'Contact page', 'Anything else'])
  assert.deepEqual(reviewPages({}).map((p) => p.key), ['home', 'about', 'contact', 'other'])
})

test('autosave: page keys only, text only, merges and clears without touching the rest', () => {
  const pages = reviewPages(intake())
  assert.deepEqual(readNotesPatch({ notes: { home: 'Bigger logo', 'service-1': 'Add the deck photos' } }, pages), { home: 'Bigger logo', 'service-1': 'Add the deck photos' })
  for (const bad of [null, { notes: { 'service-9': 'x' } }, { notes: { home: 1 } }, { notes: { home: 'x'.repeat(4001) } }, { notes: {}, previewLink: {} }, { previewFeedback: {} }]) {
    assert.throws(() => readNotesPatch(bad, pages), NotesError, JSON.stringify(bad)?.slice(0, 50))
  }
  const one = applyNotes(intake({ rawNotes: 'private' }), { home: 'Bigger logo' }, 'https://p.vercel.app', new Date(NOW))
  const two = applyNotes(one, { about: 'Use the family photo' }, 'https://p.vercel.app', new Date(NOW + 1000))
  assert.deepEqual(two.previewFeedback?.notes, { home: 'Bigger logo', about: 'Use the family photo' })
  assert.equal(two.rawNotes, 'private')
  assert.equal(two.previewLink?.nonce, NONCE)
  assert.deepEqual(applyNotes(two, { home: ' ' }, null).previewFeedback?.notes, { about: 'Use the family photo' })
})

test('notes to a drafted site_update: a fixed template, posted once per set of notes', () => {
  const pages = reviewPages(intake())
  const i = applyNotes(intake(), { home: 'Make the logo bigger', 'service-2': 'Add the white kitchen photos\\nfirst' }, 'https://p.vercel.app', new Date(NOW))
  const draft = draftInstruction('Client A Painting', pages, i.previewFeedback)
  assert.equal(
    draft,
    [
      "Client feedback on the preview of Client A Painting's site, in their own words (preview https://p.vercel.app). Make these changes and nothing else:",
      '- Home page: Make the logo bigger',
      '- Cabinet refinishing page: Add the white kitchen photos\\nfirst',
      'Rules: change only what a note asks for; keep every other page, section and line as it is; do not invent facts, prices, reviews or claims; when a note asks for something the site cannot do or that needs a fact you do not have, leave it and list it under Questions for Jacob in CLIENT-TODO.md. No em dashes.',
    ].join('\n')
  )
  const first = submitNotes(i, 'Client A Painting', pages, new Date(NOW))
  assert.equal(first.draft, draft)
  assert.equal(submitNotes(first.intake, 'Client A Painting', pages).draft, null)
  const more = applyNotes(first.intake, { contact: 'Add Saturday hours' }, null)
  assert.match(submitNotes(more, 'Client A Painting', pages).draft ?? '', /- Contact page: Add Saturday hours/)
  assert.equal(submitNotes(intake(), 'Client A Painting', pages).draft, null)
  assert.match(draftMessage('Client A Painting', draft!), /^Client A Painting sent notes on the preview\. Here is the site_update I would run\. Say "go" and I'll start it; nothing has run, nothing is merged\./)
  assert.doesNotMatch(draft!, /[\u2013\u2014]/)
})

test('looks good: send_preview or client_review to approved; nothing else moves', () => {
  const keys = STEP_CATALOG.website.map((s) => s.key)
  assert.deepEqual(keys.slice(keys.indexOf('client_review'), keys.indexOf('client_review') + 3), ['client_review', 'revisions', 'approved'])
  assert.equal(stepOnApprove('send_preview'), 'approved')
  assert.equal(stepOnApprove('client_review'), 'approved')
  for (const s of ['brief', 'build', 'review', 'revisions', 'approved', 'live', null]) assert.equal(stepOnApprove(s), null, String(s))
})

test('the page sees only its own review, no other intake data', () => {
  const v = publicReview({ displayName: 'Client A', contactName: 'Pat Smith', previewUrl: 'https://p.vercel.app', intake: intake({ rawNotes: 'private', previewFeedback: { notes: { home: 'x' }, updatedAt: '' } }) })
  assert.equal(v.firstName, 'Pat')
  assert.deepEqual(v.notes, { home: 'x' })
  assert.doesNotMatch(JSON.stringify(v), /private|AbCdEf/)
})

test('no merge, no run, no send from the review routes', () => {
  for (const f of ['route.ts', 'submit/route.ts', 'approve/route.ts']) {
    const src = readFileSync(join(process.cwd(), 'app', 'api', 'review', '[token]', f), 'utf8')
    assert.doesNotMatch(src, /startWebTask|dispatchRun|mergePullRequest|applyWebPush|decideApproval|telnyx|resend|fetch\(/, f)
  }
})

test('rate limits and flag off: every route 404s with the flag off; a bad token 404s and the limit holds with it on', async () => {
  assert.deepEqual(Object.keys(REVIEW_LIMITS).sort(), ['approve', 'read', 'save', 'submit'])
  const { reviewGuard, currentPreviewLink } = await import('./preview-feedback-server')
  const prev = { flag: process.env.PREVIEW_FEEDBACK, key: process.env.CLIENT_INTAKE_SECRET }
  try {
    delete process.env.PREVIEW_FEEDBACK
    for (const r of ['read', 'save', 'submit', 'approve'] as const) {
      const g = await reviewGuard(new Request('http://localhost/api/review/x'), 'x', r)
      assert.ok('response' in g && g.response.status === 404)
    }
    process.env.CLIENT_INTAKE_SECRET = KEY
    assert.equal(currentPreviewLink(ENG, intake({ previewLink: { nonce: NONCE, issuedAt: '', expiresAt: new Date(NOW + 1e9).toISOString() } }), NOW), null)
    process.env.PREVIEW_FEEDBACK = 'true'
    const ip = `198.51.100.${(Date.now() % 250) + 1}`
    const req = () => new Request('http://localhost/api/review/x', { headers: { 'x-forwarded-for': ip } })
    const bad = await reviewGuard(req(), 'not-a-token', 'read')
    assert.ok('response' in bad && bad.response.status === 404)
    let last = 0
    for (let n = 0; n <= REVIEW_LIMITS.approve; n++) {
      const g = await reviewGuard(req(), 'still-not-a-token', 'approve')
      if ('response' in g) last = g.response.status
    }
    assert.equal(last, 429)
    assert.match(currentPreviewLink(ENG, intake({ previewLink: { nonce: NONCE, issuedAt: '', expiresAt: new Date(NOW + 1e9).toISOString() } }), NOW) ?? '', /\/review\//)
  } finally {
    if (prev.flag === undefined) delete process.env.PREVIEW_FEEDBACK
    else process.env.PREVIEW_FEEDBACK = prev.flag
    if (prev.key === undefined) delete process.env.CLIENT_INTAKE_SECRET
    else process.env.CLIENT_INTAKE_SECRET = prev.key
  }
})

test('the preview text: unchanged without a review link, the review link first with one', () => {
  assert.equal(
    previewText('Pat', 'https://p.vercel.app'),
    "Hey Pat, Jacob here. Your new website is built and ready for you to look at: https://p.vercel.app\n\nTake a look on your phone and tell me anything you want changed, or reply looks good and I'll get it ready to go live."
  )
  assert.equal(
    previewText('Pat', 'https://p.vercel.app', 'https://www.alignandacquire.com/review/tok'),
    'Hey Pat, Jacob here. Your new website is built and ready for you to look at: https://www.alignandacquire.com/review/tok\n\nThat page opens the preview and has a box for each page, so you can tell me anything you want changed, or tap Looks good. The preview on its own is here: https://p.vercel.app'
  )
  const chief = readFileSync(join(process.cwd(), 'lib', 'ops', 'hq', 'chief.ts'), 'utf8')
  assert.match(chief, /\.\.\.\(previewFeedbackEnabled\(\) \? \[previewFeedbackLinkTool\(ctx\)\] : \[\]\)/)
})
