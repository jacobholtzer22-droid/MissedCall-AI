import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  QUESTIONNAIRE_TEXT,
  clientSendDraftsEnabled,
  liveText,
  markSent,
  previewText,
  questionnaireText,
  sendDraftsFor,
  type SendFacts,
} from './send-drafts'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const NOW = new Date('2026-11-01T15:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const facts = (p: Partial<SendFacts> = {}): SendFacts => ({
  engagementId: 'e1',
  client: 'Client A Painting',
  contactName: 'Pat Smith',
  phone: '+15555550100',
  stage: 'onboarding',
  deliverables: [{ type: 'website', step: 'brief', effectiveStatus: 'in_progress', stepUpdatedAt: daysAgo(1), evidence: {} }],
  business: { ownerEmail: 'pat@example.com', ownerPhone: '+15555550100', telnyxPhoneNumber: '+15555550199' },
  intakeMissing: ['phone', 'services'],
  hasClientAnswers: false,
  marks: {},
  intakeLinkUrl: null,
  ...p,
})

test('the flag is off unless exactly "true"', () => {
  assert.equal(clientSendDraftsEnabled({}), false)
  assert.equal(clientSendDraftsEnabled({ CLIENT_SEND_DRAFTS: '1' }), false)
  assert.equal(clientSendDraftsEnabled({ CLIENT_SEND_DRAFTS: 'true' }), true)
})

test('the questionnaire is the doc, verbatim, with the first name', () => {
  const doc = readFileSync(join(process.cwd(), 'docs', 'ops', 'onboarding-questionnaire.md'), 'utf8')
  const block = doc.split('## The text, verbatim')[1].split('## Where each answer lands')[0].trim()
  assert.equal(QUESTIONNAIRE_TEXT, block)
  const t = questionnaireText('Pat', null)
  assert.ok(t.startsWith('Hey Pat, Rough answers are totally fine'))
  assert.ok(t.endsWith('Thanks Pat looking forward to helping you out.'))
  assert.doesNotMatch(t, /\{Name\}/)
  assert.match(t, GSM7)
})

test('with an intake link: the short version that points to it', () => {
  const url = 'https://www.alignandacquire.com/intake/abc.def.ghi.jkl'
  assert.equal(
    questionnaireText('Pat', url),
    [
      `Hey Pat, Jacob here. Here's your setup page: ${url}`,
      "It has my questions for your website, ads and Google listing, and you can upload your photos and logo right there. Rough answers are totally fine, it saves as you go, and you can come back to the same link anytime.",
      "If you're short on time, 1 through 14 and 17 through 19 come first. Those are what I need to build the campaign.",
    ].join('\n\n')
  )
  assert.match(questionnaireText('', url), /^Hey, Jacob here\./)
})

test('preview text', () => {
  assert.equal(
    previewText('Pat', 'https://client-a.vercel.app'),
    "Hey Pat, Jacob here. Your new website is ready for you to look at: https://client-a.vercel.app\n\nTake a look on your phone and tell me anything you want changed, or reply looks good and I'll get it ready to go live."
  )
})

test("you're live text, from the board's facts only", () => {
  const f = facts({
    deliverables: [
      { type: 'website', step: 'live', effectiveStatus: 'live', stepUpdatedAt: daysAgo(1), evidence: { productionUrl: 'https://client-a.vercel.app' } },
      { type: 'domain', step: 'live', effectiveStatus: 'live', stepUpdatedAt: daysAgo(1), evidence: { primaryDomain: 'www.client-a.example' } },
      { type: 'missedcall', step: 'live', effectiveStatus: 'live', stepUpdatedAt: daysAgo(2), evidence: {} },
      { type: 'ads', step: 'running', effectiveStatus: 'live', stepUpdatedAt: daysAgo(1), evidence: { dailyBudget: 8 } },
    ],
  })
  assert.equal(
    liveText('Pat', f),
    [
      "Hey Pat, Jacob here. You're live. Your new website is up at www.client-a.example, missed calls now get a text back right away (from (555) 555-0199), your Google Ads are running at $8 a day.",
      'New leads go to pat@example.com and (555) 555-0100.',
      "This first week: Google can take a couple of weeks to show the new site in search, that part is normal; call your business line from another phone and let it ring out once, so you see the text back yourself; the first week the ads are learning, I'll go through the searches and cut out junk clicks.",
      'Text me anytime with questions or anything you want changed.',
    ].join('\n\n')
  )
  assert.match(liveText('Pat', f)!, GSM7)
})

test('triggers: questionnaire while onboarding and empty; preview at send_preview; live when everything bought is live, recently', () => {
  assert.deepEqual(sendDraftsFor(facts(), NOW).map((d) => d.kind), ['questionnaire'])
  assert.deepEqual(sendDraftsFor(facts({ stage: 'active' }), NOW), [])
  assert.deepEqual(sendDraftsFor(facts({ intakeMissing: [] }), NOW), [])
  assert.deepEqual(sendDraftsFor(facts({ hasClientAnswers: true }), NOW), [])
  assert.deepEqual(sendDraftsFor(facts({ marks: { questionnaire: daysAgo(1) } }), NOW), [])

  const preview = facts({ stage: 'active', deliverables: [{ type: 'website', step: 'send_preview', effectiveStatus: 'in_progress', stepUpdatedAt: daysAgo(0), evidence: { previewUrl: 'https://p.vercel.app' } }] })
  assert.deepEqual(sendDraftsFor(preview, NOW).map((d) => [d.kind, d.key]), [['preview', 'https://p.vercel.app']])
  // Marked sent for this preview: gone. A new preview after revisions: back.
  assert.deepEqual(sendDraftsFor({ ...preview, marks: { preview: 'https://p.vercel.app' } }, NOW), [])
  assert.equal(sendDraftsFor({ ...preview, marks: { preview: 'https://old.vercel.app' } }, NOW).length, 1)
  // No preview URL yet, or a different step: nothing.
  assert.deepEqual(sendDraftsFor({ ...preview, deliverables: [{ ...preview.deliverables[0], evidence: {} }] }, NOW), [])

  const live = (age: number) => facts({ stage: 'active', deliverables: [{ type: 'website', step: 'live', effectiveStatus: 'live', stepUpdatedAt: daysAgo(age), evidence: {} }] })
  assert.deepEqual(sendDraftsFor(live(2), NOW).map((d) => d.kind), ['live'])
  assert.deepEqual(sendDraftsFor(live(30), NOW), [])
  assert.deepEqual(sendDraftsFor({ ...live(2), marks: { live: daysAgo(1) } }, NOW), [])
  // Something still not live: no "you're live" yet.
  const partly = facts({ stage: 'active', deliverables: [...live(2).deliverables, { type: 'ads', step: 'enable', effectiveStatus: 'in_progress', stepUpdatedAt: daysAgo(1), evidence: {} }] })
  assert.deepEqual(sendDraftsFor(partly, NOW), [])
})

test('mark sent is a marker only: preview keeps its URL, the others a time', () => {
  assert.deepEqual(markSent({}, 'preview', 'https://p.vercel.app'), { preview: 'https://p.vercel.app' })
  assert.match(markSent(undefined, 'live', 'live').live!, /^\d{4}-\d{2}-\d{2}T/)
})

test('no sends: nothing in the drafts code path can send a text or email', () => {
  for (const f of ['lib/ops/send-drafts.ts', 'app/api/admin/ops/engagements/[id]/send-drafts/route.ts']) {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    assert.doesNotMatch(src, /from 'telnyx'|messages\.send\(|from 'resend'|api\.resend|sendSMS|fetch\(/, f)
  }
  const route = readFileSync(join(process.cwd(), 'app/api/admin/ops/engagements/[id]/send-drafts/route.ts'), 'utf8')
  assert.match(route, /if \(!clientSendDraftsEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/)
  const board = readFileSync(join(process.cwd(), 'lib/ops/board.ts'), 'utf8')
  assert.match(board, /clientSendDraftsEnabled\(\) \? await loadSendDrafts\(live, now\) : null/)
  assert.ok(readdirSync(join(process.cwd(), 'lib', 'ops')).includes('send-drafts.ts'))
})
