// ===========================================
// ADS_BILLING_INVITE: Google Ads billing by invite, never a card
// ===========================================
// Run: npm test. Pure, plus source checks for the paths that need Google or the database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ADS_BILLING_COPY,
  BILLING_INVITE_ROLE,
  adsBillingInviteEnabled,
  advertiserLegalFrom,
  billingDraftWhy,
  billingInviteDecision,
  billingStepsText,
  legalLines,
  q17Email,
  type InviteFacts,
} from './ads-billing'
import { stepsFor } from './intake-wizard'
import { markSent, sendDraftsFor, type SendFacts } from './send-drafts'

const ROOT = new URL('../../', import.meta.url).pathname
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const ON = { ADS_BILLING_INVITE: 'true' }
const P = (o: Record<string, boolean>) => ({ missedcall: false, website: false, ads: false, gbp: false, ...o })

test('flag is off unless exactly "true"', () => {
  assert.equal(adsBillingInviteEnabled({}), false)
  assert.equal(adsBillingInviteEnabled(ON), true)
})

test('wizard step 7: only for Google Ads clients, only with the flag', () => {
  assert.equal(stepsFor(P({ ads: true }), ON).at(-1), 'adsbilling')
  assert.equal(stepsFor(P({ ads: true }), ON, 'link').at(-1), 'adsbilling')
  assert.equal(stepsFor(P({ website: true }), ON).includes('adsbilling'), false)
  assert.equal(stepsFor(P({ ads: true }), {}).includes('adsbilling'), false)
  assert.equal(ADS_BILLING_COPY.invite, 'Google will email you an invite to add your payment method for your ads; it takes 2 minutes.')
  assert.equal(ADS_BILLING_COPY.separate, 'Your ad spend is billed by Google directly, separate from what you pay me.')
  // No card here: the step renders copy only.
  const w = src('app/intake/[token]/IntakeWizard.tsx')
  const step = w.slice(w.indexOf("view.step === 'adsbilling'"), w.indexOf("view.step === 'adsbilling'") + 600)
  assert.doesNotMatch(step, /<input|fetch\(/)
})

const facts = (o: Partial<InviteFacts> = {}): InviteFacts => ({ engagementId: 'e1', client: 'Client A', customerId: '1234567890', email: 'owner@gmail.com', apiReady: true, neverTouch: false, inviteCards: [], ...o })

test('on bind: one card, fix 7\'s ads_invite shape, Admin', () => {
  const d = billingInviteDecision(facts())
  assert.equal(d.action, 'card')
  if (d.action !== 'card') return
  assert.equal(d.title, 'Send Google Ads billing invite to owner@gmail.com')
  assert.deepEqual(d.detail, { action: 'invite_user', engagementId: 'e1', customerId: '1234567890', email: 'owner@gmail.com', role: 'ADMIN', purpose: 'billing' })
  assert.equal(BILLING_INVITE_ROLE, 'ADMIN')
  assert.match(d.expected, /as Admin on 123-456-7890.*Google bills the client directly.*\(unverified\)\.$/)
  assert.deepEqual(billingInviteDecision(facts({ customerId: null })), { action: 'none', reason: 'the ads account is not bound yet' })
  assert.equal(billingInviteDecision(facts({ neverTouch: true })).action, 'none')
})

test('no duplicate with an existing ads_invite card; a refused one falls back to the draft', () => {
  for (const status of ['pending', 'approved', 'applied']) {
    const d = billingInviteDecision(facts({ inviteCards: [{ kind: 'ads_invite', status, detail: {} }] }))
    assert.equal(d.action, 'none', status)
  }
  assert.deepEqual(billingInviteDecision(facts({ inviteCards: [{ kind: 'ads_invite', status: 'rejected', detail: {} }] })).action, 'card')
  assert.deepEqual(billingInviteDecision(facts({ inviteCards: [{ kind: 'ads_invite', status: 'failed', detail: {} }] })), { action: 'draft', reason: 'Google refused the invite' })
  assert.deepEqual(billingInviteDecision(facts({ email: null })), { action: 'draft', reason: 'no Gmail for the account (q17)' })
  assert.deepEqual(billingInviteDecision(facts({ apiReady: false })), { action: 'draft', reason: 'the Google Ads API is not set up here' })
})

test('Push only: proposing writes a pending card and never calls Google; Push goes through applyInvite', () => {
  const s = src('lib/ops/ads-billing-server.ts')
  const code = s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /customerUserAccessInvitations|applyInvite|\.invite\(/)
  assert.match(s, /db\.opsApproval\.create\(\{\n\s+data: \{ jobId: job\.id, runId: run\.id, agent: 'ads', kind: 'ads_invite'/)
  const a = src('lib/ops/hq/approvals.ts')
  assert.match(a, /\.\.\.\(adsAccountCreateEnabled\(\) \? ACCOUNT_APPROVAL_KINDS : adsBillingInviteEnabled\(\) \? \['ads_invite'\] : \[\]\)/)
  assert.match(a, /\(adsBillingInviteEnabled\(\) && approval\.kind === 'ads_invite'\)\) \{\n\s+try \{\n\s+const line = await applyAccountCard/)
  assert.match(a, /m\.inviteRefused\(detail\.engagementId as string, message\)/)
  // The bind hooks, gated.
  assert.match(src('lib/ops/hq/ads-tools.ts'), /if \(adsBillingInviteEnabled\(\)\) \{\n\s+const engagementId = ctx\.engagementId\n\s+const billing = await import\('@\/lib\/ops\/ads-billing-server'\)/)
  assert.match(src('lib/ops/ads-account-server.ts'), /if \(adsBillingInviteEnabled\(\)\) await proposeBillingInvite\(/)
  assert.match(src('lib/ops/hq/chief.ts'), /\.\.\.\(adsBillingInviteEnabled\(\)\n\s+\? \[\n\s+\{\n\s+name: 'propose_ads_billing_invite'/)
})

test('q17 Gmail: the intake field, else the one address in the raw answer', () => {
  assert.equal(q17Email('Owner@Gmail.com', null), 'owner@gmail.com')
  assert.equal(q17Email(null, 'use mybiz@gmail.com please'), 'mybiz@gmail.com')
  assert.equal(q17Email(null, 'a@gmail.com or b@gmail.com'), null)
  assert.equal(q17Email('not an email', ''), null)
})

const sendFacts = (evidence: Record<string, unknown>, step = 'verification_docs', marks = {}): SendFacts => ({
  engagementId: 'e1',
  client: 'Client A',
  contactName: 'Pat Smith',
  phone: '+15555550100',
  stage: 'onboarding',
  deliverables: [{ type: 'ads', step, effectiveStatus: 'in_progress', stepUpdatedAt: null, evidence }],
  business: null,
  intakeMissing: [],
  hasClientAnswers: true,
  marks,
  intakeLinkUrl: null,
})
const AT = '2026-11-01T12:00:00.000Z'
const LEGAL = { legalName: 'Client A Painting LLC', address: '100 Main St, Lansing, MI', zip: '48933' }

test('fallback draft: the steps with the legal details, GSM-7, marked unverified for Jacob', () => {
  const ev = { billingInvite: { mode: 'draft', reason: 'Google refused the invite', email: 'owner@gmail.com', customerId: '1234567890', at: AT }, advertiserLegal: LEGAL }
  const [d] = sendDraftsFor(sendFacts(ev), new Date(AT), ON)
  assert.equal(d.kind, 'ads_billing')
  assert.equal(d.key, AT)
  assert.equal(
    d.text,
    [
      "Hey Pat, Jacob here. Your Google Ads account is set up. Next is adding the card Google bills your ad spend to. That goes to Google directly, separate from what you pay me, and it takes about 2 minutes:",
      [
        '1. Accept the invite from the email Google Ads sends to owner@gmail.com.',
        '2. Sign in at ads.google.com and open account 123-456-7890.',
        '3. Open Billing in the left menu, then Settings.',
        '4. Billing country: United States. The currency is already US dollars.',
        '5. Account type Business, with your official name and address: Client A Painting LLC, 100 Main St, Lansing, MI 48933.',
        '6. Add your card under Payment methods and save.',
      ].join('\n'),
      'Text me when it is done and I will take it from there.',
    ].join('\n\n')
  )
  assert.match(d.text, GSM7)
  assert.match(d.why, /unverified: check them before sending$/)
  assert.match(d.why, /^Google refused the invite; send Google's invite to owner@gmail\.com from the Ads UI first/)
  // Marked sent: gone. After the payment step: gone. Flag off: none.
  assert.deepEqual(sendDraftsFor(sendFacts(ev, 'verification_docs', markSent({}, 'ads_billing', AT)), new Date(AT), ON), [])
  assert.deepEqual(sendDraftsFor(sendFacts(ev, 'campaign_build'), new Date(AT), ON), [])
  assert.deepEqual(sendDraftsFor(sendFacts(ev), new Date(AT), {}), [])
  // A card in flight is not a draft.
  assert.deepEqual(sendDraftsFor(sendFacts({ billingInvite: { mode: 'card', approvalId: 'a1', at: AT } }), new Date(AT), ON), [])
})

test('fallback without a Gmail asks for it first; without legal details asks for the LLC paperwork wording', () => {
  const t = billingStepsText({ name: '', email: null, customerId: '1234567890', reason: 'no Gmail for the account (q17)', legal: null })
  assert.match(t, /^Hey, Jacob here\./)
  assert.match(t, /1\. Text me the Gmail you want on the account and I will send you Google's invite to it\./)
  assert.match(t, /5\. Account type Business, with your official business name and address exactly as they are on your LLC paperwork\./)
  assert.equal(billingDraftWhy('no Gmail for the account (q17)', null), "no Gmail for the account (q17); the steps are from Claude's knowledge of Google Ads, unverified: check them before sending")
})

test('legal details reach the ads deliverable and show at the verification step', () => {
  assert.equal(advertiserLegalFrom(null), null)
  assert.equal(advertiserLegalFrom({ legalName: ' ', address: '', zip: '' }), null)
  assert.deepEqual(advertiserLegalFrom({ legalName: ' Client A LLC ', zip: '48933' }), { legalName: 'Client A LLC', address: '', zip: '48933' })
  assert.deepEqual(legalLines({ legalName: 'Client A LLC', address: '', zip: '48933' }), ['Legal name: Client A LLC', 'Address: (not given)', 'ZIP: 48933'])
  const routes = src('lib/ops/intake-wizard-routes.ts')
  assert.match(routes, /if \(patch\.kind === 'legal' && adsBillingInviteEnabled\(\)\) await syncAdvertiserLegal\(/)
  const panel = src('app/admin/ops/EngagementPanel.tsx')
  assert.match(panel, /d\.type === 'ads' && \(d\.step === 'verification_docs' \|\| d\.step === 'verification'\) && isAdvertiserLegal\(d\.evidence\.advertiserLegal\)/)
  assert.match(src('lib/ops/ads-billing-server.ts'), /if \(legal\) await mergeEvidence\(ads\.id, \{ advertiserLegal: legal \}\)/)
})

test('flag off: no step, no card kind, no draft kind, no hooks, nothing written', () => {
  const s = src('lib/ops/ads-billing-server.ts')
  assert.match(s, /export async function syncAdvertiserLegal[\s\S]+?\n  if \(!adsBillingInviteEnabled\(\)\) return\n/)
  assert.match(s, /export async function proposeBillingInvite[\s\S]+?\n  if \(!adsBillingInviteEnabled\(\)\) return \{ action: 'none', reason: 'ADS_BILLING_INVITE is off' \}/)
  assert.match(s, /export async function inviteRefused[\s\S]+?\n  if \(!adsBillingInviteEnabled\(\)\) return\n/)
  assert.match(src('app/api/admin/ops/engagements/[id]/send-drafts/route.ts'), /\.\.\.\(adsBillingInviteEnabled\(\) \? \(\['ads_billing'\] as SendKind\[\]\) : \[\]\)/)
  assert.doesNotMatch(JSON.stringify(ADS_BILLING_COPY), /[\u2013\u2014]/)
})
