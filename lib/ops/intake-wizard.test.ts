// ===========================================
// PORTAL_INTAKE_WIZARD: the portal sign-up intake wizard
// ===========================================
// Run: npm test. Pure, plus source checks for the scoping and the signup hook.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { QUESTIONS, applyAnswers, finishIntake } from './client-intake'
import {
  COPY,
  MISSED_CALL_QUESTIONS,
  USED_BY,
  WizardError,
  afterSignupPath,
  applyWizardPatch,
  mergeIntakes,
  planFromBoard,
  portalIntakeWizardEnabled,
  questionsFor,
  readWizardPatch,
  setupUnfinished,
  stepsFor,
  withBoardPlan,
  wizardFinishNote,
  wizardNoteLines,
  wizardView,
  type IntakeWithWizard,
  type Plan,
} from './intake-wizard'

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const P = (o: Partial<Plan> = {}): Plan => ({ missedcall: false, website: false, ads: false, gbp: false, ...o })
const nums = (qs: { n: number }[]) => qs.map((q) => q.n)
const OFF = {}
const NOW = new Date('2026-11-01T15:00:00Z')

test('flag is off unless exactly "true"; signup goes to /dashboard with it off', () => {
  assert.equal(portalIntakeWizardEnabled({}), false)
  assert.equal(portalIntakeWizardEnabled({ PORTAL_INTAKE_WIZARD: '1' }), false)
  assert.equal(afterSignupPath({}), '/dashboard')
  assert.equal(afterSignupPath({ PORTAL_INTAKE_WIZARD: 'true' }), '/onboarding/intake')
})

test('step order: plan, missed-call only with yes, common, legal, files; card and ads billing only with their flags', () => {
  assert.deepEqual(stepsFor(P({ website: true }), OFF), ['plan', 'common', 'legal', 'files'])
  assert.deepEqual(stepsFor(P({ missedcall: true, ads: true }), OFF), ['plan', 'missedcall', 'common', 'legal', 'files'])
  assert.deepEqual(stepsFor(undefined, OFF), ['plan', 'common', 'legal', 'files'])
  assert.deepEqual(stepsFor(P({ ads: true }), { STRIPE_CARD_AT_SIGNUP: 'true', ADS_BILLING_INVITE: 'true' }), ['plan', 'common', 'legal', 'files', 'card', 'adsbilling'])
  assert.deepEqual(stepsFor(P({ website: true }), { ADS_BILLING_INVITE: 'true' }), ['plan', 'common', 'legal', 'files'])
})

test('every question is mapped, and each one shows in exactly one step for a full plan', () => {
  assert.deepEqual(Object.keys(USED_BY).map(Number), QUESTIONS.map((q) => q.n))
  const all = P({ missedcall: true, website: true, ads: true, gbp: true })
  const shown = [...nums(questionsFor('missedcall', all)), ...nums(questionsFor('common', all)), ...nums(questionsFor('files', all))].sort((a, b) => a - b)
  assert.deepEqual(shown, QUESTIONS.map((q) => q.n))
})

test('conditional questions: per plan', () => {
  // Website + ads, no missed-call: phone and leads still asked in step 3 (the site needs them).
  const wa = P({ website: true, ads: true })
  assert.deepEqual(nums(questionsFor('missedcall', wa)), [])
  assert.deepEqual(nums(questionsFor('common', wa)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28])
  // Missed-call only: business basics, area, then PHONE + LEADS in its own step.
  const mc = P({ missedcall: true })
  assert.deepEqual(nums(questionsFor('missedcall', mc)), MISSED_CALL_QUESTIONS)
  assert.deepEqual(nums(questionsFor('common', mc)), [1, 2, 10])
  assert.deepEqual(nums(questionsFor('files', mc)), [])
  // Website only: no ads questions, no GBP 15.
  const w = nums(questionsFor('common', P({ website: true })))
  for (const n of [3, 4, 15, 17, 18, 19, 20, 21]) assert.equal(w.includes(n), false, `q${n}`)
  assert.deepEqual(nums(questionsFor('files', P({ website: true }))), [23, 24])
  // GBP only.
  assert.deepEqual(nums(questionsFor('common', P({ gbp: true }))), [1, 2, 9, 15, 16])
  // Nothing picked: everything.
  assert.equal(questionsFor('common', P()).length + questionsFor('files', P()).length, QUESTIONS.length)
})

test('questions are the questionnaire verbatim (the same objects, doc-tested in client-intake)', () => {
  const all = P({ missedcall: true, website: true, ads: true, gbp: true })
  for (const q of [...questionsFor('missedcall', all), ...questionsFor('common', all), ...questionsFor('files', all)]) {
    assert.equal(q, QUESTIONS.find((x) => x.n === q.n))
  }
  const doc = src('../../docs/ops/onboarding-questionnaire.md')
  for (const q of QUESTIONS) assert.ok(doc.includes(`${q.n}. ${q.text}`), `q${q.n}`)
})

test('saves: plan, confirm, legal, step; anything else refused', () => {
  assert.deepEqual(readWizardPatch({ plan: { missedcall: true, ads: true } }), { kind: 'plan', plan: P({ missedcall: true, ads: true }), confirm: false })
  assert.deepEqual(readWizardPatch({ plan: { website: true }, confirm: true }).kind, 'plan')
  assert.deepEqual(readWizardPatch({ confirm: true }), { kind: 'confirm' })
  assert.deepEqual(readWizardPatch({ legal: { legalName: ' Client A LLC ', address: '1 Main St', zip: '48933' } }), { kind: 'legal', legal: { legalName: 'Client A LLC', address: '1 Main St', zip: '48933' } })
  assert.deepEqual(readWizardPatch({ step: 'legal', done: 'common' }), { kind: 'step', step: 'legal', done: 'common' })
  for (const bad of [null, [], {}, { plan: { stripe: true } }, { plan: { ads: 'yes' } }, { legal: { zip: '4893' } }, { legal: { ssn: 'x' } }, { step: 'pay' }, { step: 'legal', answers: {} }, { confirm: false }, { plan: {}, legal: {} }]) {
    assert.throws(() => readWizardPatch(bad), WizardError, JSON.stringify(bad))
  }
})

test('autosave and resume: the step comes back; an unconfirmed plan starts at the plan', () => {
  let i: IntakeWithWizard = {}
  const view = (x: IntakeWithWizard) => wizardView({ displayName: 'Client A', contactName: 'Pat Smith', intake: x }, OFF)
  assert.equal(view(i).step, 'plan')
  i = applyWizardPatch(i, readWizardPatch({ plan: { website: true }, confirm: true }), NOW)
  assert.equal(i.wizard?.planSource, 'client')
  i = applyWizardPatch(i, readWizardPatch({ step: 'common', done: 'plan' }), NOW)
  i = applyAnswers(i, { '1': 'Client A LLC', '2': 'Painting' }, NOW) as IntakeWithWizard
  i = applyWizardPatch(i, readWizardPatch({ step: 'legal', done: 'common' }), NOW)
  i = applyWizardPatch(i, readWizardPatch({ legal: { legalName: 'Client A LLC', address: '1 Main St', zip: '48933' } }), NOW)
  const v = view(i)
  assert.equal(v.step, 'legal')
  assert.deepEqual(v.completed, ['plan', 'common'])
  assert.equal(v.answers['2'], 'Painting')
  assert.deepEqual(v.legal, { legalName: 'Client A LLC', address: '1 Main St', zip: '48933' })
  assert.equal(v.firstName, 'Pat')
  // Changing the plan without confirming sends them back to the plan step.
  i = applyWizardPatch(i, readWizardPatch({ plan: { website: true, ads: true } }), NOW)
  assert.equal(view(i).step, 'plan')
  assert.throws(() => applyWizardPatch({}, { kind: 'confirm' }), WizardError)
})

test('matched or board plan: a prefill for confirmation, never over the client\'s own plan', () => {
  assert.deepEqual(planFromBoard(['website'], ['domain', 'ads']), P({ website: true, ads: true }))
  assert.equal(planFromBoard([], ['domain']), null)
  const pre = withBoardPlan({}, P({ website: true }), 'matched', NOW)
  assert.equal(pre.wizard?.planSource, 'matched')
  assert.equal(pre.wizard?.planConfirmedAt, undefined)
  const v = wizardView({ displayName: 'X', contactName: null, intake: pre }, OFF)
  assert.equal(v.step, 'plan')
  assert.equal(v.planConfirmed, false)
  const own = applyWizardPatch({}, readWizardPatch({ plan: { gbp: true }, confirm: true }), NOW)
  assert.deepEqual(withBoardPlan(own, P({ website: true }), 'board', NOW), own)
})

test('no auto-link: a match only pre-fills and proposes; linking happens on Push alone', () => {
  const s = src('./intake-wizard-server.ts')
  const portal = s.slice(s.indexOf('export async function portalClientFor'), s.indexOf('/** The merge card'))
  // The only engagement write in the sign-up path is the client's own record (upsert by their businessId).
  assert.equal(portal.match(/db\.engagement\.(update|updateMany)\(/g), null)
  assert.match(portal, /db\.engagement\.upsert\(\{\n\s+where: \{ businessId: b\.id \}/)
  assert.match(portal, /await proposePortalMerge\(created\.id, b\.id, b\.name, m\)/)
  // The plan comes from the matched client only on a Clerk-verified email match.
  assert.match(portal, /m\.on\.includes\('email'\) && verifiedEmails\.some/)
  // applyPortalMerge runs only from decideApproval (Push).
  assert.match(src('./hq/approvals.ts'), /detail\.action === 'merge_portal' && portalIntakeWizardEnabled\(\) \? await applyPortalMerge\(detail\)/)
})

test('merge on Push: target answers win, files are added once, nothing is dropped', () => {
  const target: IntakeWithWizard = { questionnaire: { answers: { '1': 'Target LLC' }, updatedAt: 'x' }, assets: [{ url: 'u1', filename: 'a.jpg', kind: 'photo' } as never] }
  const from: IntakeWithWizard = {
    questionnaire: { answers: { '1': 'Portal LLC', '2': 'Painting' }, updatedAt: 'y' },
    assets: [{ url: 'u1', filename: 'a.jpg', kind: 'photo' } as never, { url: 'u2', filename: 'b.jpg', kind: 'photo' } as never],
    legal: { legalName: 'Portal LLC', address: '1 Main', zip: '48933' },
    wizard: { plan: P({ website: true }) },
  }
  const m = mergeIntakes(target, from, NOW)
  assert.deepEqual(m.questionnaire?.answers, { '1': 'Target LLC', '2': 'Painting' })
  assert.deepEqual((m.assets ?? []).map((a) => a.url), ['u1', 'u2'])
  assert.equal(m.legal?.legalName, 'Portal LLC')
  assert.deepEqual(m.wizard?.plan, P({ website: true }))
})

test('scoping: every portal route goes through portalGuard; the record comes from the Clerk user, never the request', () => {
  for (const p of ['route.ts', 'wizard/route.ts', 'finish/route.ts', 'assets/route.ts', 'assets/token/route.ts']) {
    const r = src(`../../app/api/portal/intake/${p}`)
    assert.match(r, /const g = await portalGuard\(request, '(save|finish|register|token)'\)/, p)
    assert.doesNotMatch(r, /engagementId\s*[:=]\s*(body|data|input)/, p)
  }
  const s = src('./intake-wizard-server.ts')
  assert.match(s, /db\.user\.findUnique\(\{\n\s+where: \{ clerkId: userId \}/)
  assert.match(s, /if \(!portalIntakeWizardEnabled\(\)\) return \{ response: notFound\(\) \}/)
  assert.match(s, /rateLimit\(`portal-intake:\$\{route\}:u:\$\{userId\}`/)
  // The link's wizard route keeps the link's own gate.
  assert.match(src('../../app/api/intake/[token]/wizard/route.ts'), /if \(!portalIntakeWizardEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)\n\s+const g = await guard\(request, context\.params\.token, 'save'\)/)
})

test('signup unchanged with every flag off: only the two post-signup redirects go through afterSignupPath', () => {
  const page = src('../../app/onboarding/page.tsx')
  assert.equal(page.match(/redirect\(afterSignupPath\(\)\)/g)?.length, 2)
  // An existing user with a Business still goes straight to /dashboard.
  assert.match(page, /if \(existingUser\?\.business\) \{\n\s+redirect\('\/dashboard'\)/)
  // The Business creation itself is untouched (same fields).
  assert.match(page, /slug: slug \+ '-' \+ Date\.now\(\),/)
  // The link page renders the old form unless the wizard flag is on.
  assert.match(src('../../app/intake/[token]/page.tsx'), /if \(portalIntakeWizardEnabled\(\)\) \{[\s\S]+\}\n\s+return <ClientIntakeForm /)
  assert.match(src('../../app/onboarding/intake/page.tsx'), /if \(!portalIntakeWizardEnabled\(\)\) notFound\(\)/)
})

test('finish: the "answers in" note names the portal, the plan and the legal details; nothing else is sent', () => {
  let i: IntakeWithWizard = applyWizardPatch({}, readWizardPatch({ plan: { website: true, ads: true }, confirm: true }), NOW)
  i = applyWizardPatch(i, readWizardPatch({ legal: { legalName: 'Client A LLC', address: '', zip: '' } }), NOW)
  i = applyAnswers(i, { '1': 'Client A LLC' }, NOW) as IntakeWithWizard
  const r = finishIntake(i, NOW)
  const note = wizardFinishNote(r.note!, r.intake as IntakeWithWizard, 'portal')
  assert.match(note, /^Answers in from the client portal sign-up: 1 of 27 answered; plan as the client says: Website, Google Ads; legal details in \(name, address, ZIP\); files from the portal/)
  assert.match(note, /Nothing was sent\./)
  assert.deepEqual(wizardNoteLines({}), ['no plan picked', 'no legal details yet'])
  const fin = src('./intake-wizard-routes.ts')
  assert.doesNotMatch(fin, /sendSms|telnyx|resend|sendEmail/i)
})

test('client copy has no dashes', () => {
  assert.doesNotMatch(JSON.stringify(COPY), /[\u2013\u2014]/)
})

test('dashboard link back to an unfinished setup: only while being set up and not finished; off with the flag off', () => {
  assert.equal(setupUnfinished(null), false)
  assert.equal(setupUnfinished({ stage: 'onboarding', intake: {} }), true)
  assert.equal(setupUnfinished({ stage: 'paid_upfront', intake: { wizard: { step: 'legal' } } }), true)
  assert.equal(setupUnfinished({ stage: 'onboarding', intake: { questionnaire: { answers: {}, updatedAt: 'x', finishedAt: 'y' } } }), false)
  for (const stage of ['active', 'one_time', 'paused', 'churned', 'ignored', 'prospect']) assert.equal(setupUnfinished({ stage, intake: {} }), false, stage)
  const s = src('./intake-wizard-server.ts')
  assert.match(s, /export async function dashboardSetupLink\(businessId: string\): Promise<string \| null> \{\n\s+if \(!portalIntakeWizardEnabled\(\)\) return null/)
  const page = src('../../app/(dashboard)/dashboard/page.tsx')
  // Flag off: setupHref is null and the page returns exactly the original element.
  assert.match(page, /if \(setupHref\) \{[\s\S]+?\n  \}\n\n  return \(\n    <OverviewClient\n      features=\{features\}\n      initialVoicemails=\{initialVoicemails\}\n      callLog=\{callLog\}\n    \/>\n  \)\n\}/)
})
