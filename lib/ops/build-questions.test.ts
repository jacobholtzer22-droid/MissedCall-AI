// ===========================================
// OPS_AUTOFLOW: build anyway, ask at the end
// ===========================================
// Run: npm test. Pure; nothing sent, no database.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isContactQuestion, openQuestionsOf, PHOTOS_QUESTION, questionGateItems, questionsEvidence, questionsText } from './build-questions'
import { markSent, sendDraftsFor, type SendFacts } from './send-drafts'
import { goLiveGate, type GateClient } from './launch-gate'
import { webPreflight } from './preflight'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const AT = '2026-10-31T18:00:00.000Z'
const Q = ['What hours can you pick up the phone?', 'Which towns do you want the most jobs in?', 'What number should customers call?']

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const old: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k]
    if (vars[k] === undefined) delete process.env[k]
    else process.env[k] = vars[k]
  }
  try {
    return fn()
  } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k]
      else process.env[k] = old[k]
    }
  }
}

test('callback evidence: only after a green build or update; an empty list clears', () => {
  const now = new Date(AT)
  assert.deepEqual(questionsEvidence('site_build', true, Q, now), { openQuestions: Q, openQuestionsAt: AT })
  assert.deepEqual(questionsEvidence('site_update', true, [], now), { openQuestions: [], openQuestionsAt: AT })
  assert.equal(questionsEvidence('site_build', false, Q, now), null)
  assert.equal(questionsEvidence('go_live', true, [], now), null)
})

test('a build with no photos adds the photo question unless the build already asked', () => {
  assert.deepEqual(openQuestionsOf({ openQuestions: Q, buildWithoutPhotos: true }).questions[0], PHOTOS_QUESTION)
  const asked = openQuestionsOf({ openQuestions: ['Can you send photos of finished jobs?'], buildWithoutPhotos: true }).questions
  assert.deepEqual(asked, ['Can you send photos of finished jobs?'])
  assert.deepEqual(openQuestionsOf({ openQuestions: Q, buildWithoutPhotos: false }).questions, Q)
  assert.deepEqual(openQuestionsOf({}).questions, [])
})

test('contact questions are the public phone and email only', () => {
  assert.equal(isContactQuestion('What number should customers call?'), true)
  assert.equal(isContactQuestion('What email should quote requests go to?'), true)
  assert.equal(isContactQuestion('What hours can you pick up the phone?'), false)
  assert.equal(isContactQuestion('Do you take emergency calls?'), false)
  assert.equal(isContactQuestion('Which towns do you want the most jobs in?'), false)
})

test('the one text: done first, numbered questions, GSM-7, nothing when no questions', () => {
  const t = questionsText('Pat', ['What hours \u2014 weekdays?', ...Q])!
  assert.match(t, /^Hey Pat, Jacob here\. Your site's first version is built\./)
  assert.match(t, /To finish it I need a few things from you:\n1\. What hours , weekdays\?\n2\. What hours can you pick up the phone\?/)
  assert.match(t, /Rough answers are totally fine, just reply here\.$/)
  assert.match(t, GSM7)
  assert.match(questionsText('', ['Q one?'])!, /^Hey, Jacob here\.[\s\S]*\n\nTo finish it I need one thing from you:\n1\. Q one\?/)
  assert.equal(questionsText('Pat', []), null)
  const many = questionsText('Pat', Array.from({ length: 11 }, (_, i) => `Question ${i + 1}?`))!
  assert.match(many, /8\. Question 8\?/)
  assert.doesNotMatch(many, /9\. Question 9/)
  assert.match(many, /a couple more small ones/)
})

const facts = (evidence: Record<string, unknown>, marks = {}): SendFacts => ({
  engagementId: 'e1',
  client: 'Client A',
  contactName: 'Pat Smith',
  phone: '+15555550100',
  stage: 'building',
  deliverables: [{ type: 'website', step: 'review', effectiveStatus: 'in_progress', stepUpdatedAt: AT, evidence }],
  business: null,
  intakeMissing: [],
  hasClientAnswers: true,
  marks,
  intakeLinkUrl: null,
})

test('Ready to send: one questions draft with OPS_AUTOFLOW, keyed on the set; none with it off', () => {
  const ev = { openQuestions: Q, openQuestionsAt: AT }
  const on = sendDraftsFor(facts(ev), new Date(AT), { OPS_AUTOFLOW: 'true' })
  assert.equal(on.length, 1)
  assert.equal(on[0].kind, 'questions')
  assert.equal(on[0].key, AT)
  assert.match(on[0].text, /first version is built/)
  assert.deepEqual(sendDraftsFor(facts(ev), new Date(AT), {}), [])
  // Marked sent for this set: gone. A new set from a later build: back.
  const marks = markSent({}, 'questions', AT)
  assert.equal(marks.questions, AT)
  assert.deepEqual(sendDraftsFor(facts(ev, marks), new Date(AT), { OPS_AUTOFLOW: 'true' }), [])
  assert.equal(sendDraftsFor(facts({ ...ev, openQuestionsAt: '2026-11-01T09:00:00.000Z' }, marks), new Date(AT), { OPS_AUTOFLOW: 'true' }).length, 1)
  assert.deepEqual(sendDraftsFor(facts({ openQuestions: [], openQuestionsAt: AT }), new Date(AT), { OPS_AUTOFLOW: 'true' }), [])
})

const client = (evidence: Record<string, unknown>): GateClient => ({
  services: ['website'],
  website: { step: 'approved', evidence: { siteIndexableFlag: false, ...evidence } },
  domain: { step: 'live', manualStatus: null, computedStatus: 'live', evidence: {} },
  ads: null,
  owner: { email: 'o@example.com', phone: '+15555550100' },
  notes: [],
})

test('go-live gate: each open question is an item; "skip questions" waives all but the contact ones', () => {
  withEnv({ OPS_AUTOFLOW: 'true' }, () => {
    const c = client({ openQuestions: Q, openQuestionsAt: AT })
    const items = goLiveGate(c)
    assert.deepEqual(items.map((i) => i.key), ['open_question', 'open_question', 'missing_contact'])
    assert.equal(items[0].text, 'open question from the build: What hours can you pick up the phone?')
    assert.equal(items[2].text, 'open question from the build (cannot be skipped, the site would have no way to reach the client): What number should customers call?')
    assert.deepEqual(goLiveGate(c, 'go live, skip questions').map((i) => i.key), ['missing_contact'])
    assert.deepEqual(goLiveGate(c, 'go live, skip questions and skip phone').map((i) => i.key), ['missing_contact'])
    assert.deepEqual(goLiveGate(client({ openQuestions: [], openQuestionsAt: AT })), [])
    assert.equal(questionGateItems({ openQuestions: [], buildWithoutPhotos: true })[0].key, 'open_question')
  })
})

test('flag off: the gate ignores open questions', () => {
  withEnv({ OPS_AUTOFLOW: undefined }, () => {
    assert.deepEqual(goLiveGate(client({ openQuestions: Q, openQuestionsAt: AT, buildWithoutPhotos: true })), [])
  })
})

test('pre-flight: no client fact blocks; run-fatal needs still do', () => {
  const base = { kind: 'site_build' as const, engagementId: 'e1', hasBrief: true, photos: 0, oldSiteVerbatim: false, withStock: false, hasInstructions: false, businessLinked: true, hasRepo: true, repoHasWorkflow: true }
  const env = { GITHUB_OPS_TOKEN: 'x', OPS_CALLBACK_SECRET: 'x' }
  assert.deepEqual(webPreflight(base, env), [])
  assert.deepEqual(webPreflight({ ...base, hasBrief: false, businessLinked: false }, { ...env, GITHUB_OPS_TOKEN: '' }).map((i) => i.group), ['From you', 'From you', 'Setup'])
})
