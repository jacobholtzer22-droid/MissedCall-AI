import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SPEC_SHAPE,
  adsSpecEnabled,
  approveDraft,
  chooseSpecSource,
  dailyBudgetFrom,
  missingOptional,
  missingRequired,
  specFacts,
  specMessage,
  specProblem,
  specPrompt,
  withDraft,
  type IntakeWithSpec,
} from './ads-spec'
import { INTAKE_KEYS, mergeIntake } from './intake'
import { rejectUnknownKeys } from './validate'
import { AnswerError, readAnswerPatch } from './client-intake'
import { adsPreflight, isSpecBuild } from './preflight'

const NOW = new Date('2026-11-01T15:00:00Z')
const intake = (p: Partial<IntakeWithSpec> = {}): IntakeWithSpec => ({
  business: { phone: '+15555550100', serviceArea: ['Town A', 'Town B'], customerType: 'residential', whoAnswers: 'Owner, 7 to 6', emergency: 'no' },
  services: [{ name: 'Gutter cleaning', moneyMaker: true }, { name: 'Window washing' }],
  ads: { budgetMonthly: 250, exclusions: ['commercial'], goal: 'calls' },
  ...p,
})

const SAMPLE = [
  '# Client A (Pat) | Google Ads launch spec | Nov 1 2026',
  '',
  'Client: Client A, Town A ST. Platform businessSlug client-a-123.',
  'Budget rule: $250 a month MAX. Google charges at most daily x 30.4, so the daily budget is $8.00 ($243.20 a month).',
  '',
  '## Campaign',
  'Budget: $8.00/day. Status at build: PAUSED (Jacob enables through an approval).',
  'Locations: Town A, Town B. Geo target constant ids: to look up. Location option: PRESENCE only.',
  'Call asset: +1 555-555-0100, linked to "Calls from ads".',
  '',
  '## Conversion actions to create before the campaign (all primary unless noted)',
  '1. "Calls from ads"',
  '',
  '## Ad groups (1). Phrase and exact keywords listed separately. 15 headlines, 4 descriptions each.',
  '### 1. Gutter Cleaning',
  '',
  '## Campaign-level negatives (PHRASE match)',
  'commercial; jobs; diy',
  '',
  '## Missing from the intake',
  '- none',
  '',
  '## After the build',
  '- Set the ads deliverable step to "enable".',
].join('\n')

test('the flag is off unless exactly "true"', () => {
  assert.equal(adsSpecEnabled({}), false)
  assert.equal(adsSpecEnabled({ ADS_SPEC_FROM_INTAKE: '1' }), false)
  assert.equal(adsSpecEnabled({ ADS_SPEC_FROM_INTAKE: 'true' }), true)
})

test('daily budget is q18 / 30.4 rounded down to $0.50, computed in code', () => {
  assert.equal(dailyBudgetFrom(250), 8)
  assert.equal(dailyBudgetFrom(300), 9.5)
  assert.equal(dailyBudgetFrom(500), 16)
  for (const v of [null, undefined, 0, -5, NaN]) assert.equal(dailyBudgetFrom(v as number), null)
})

test('facts from a sample intake: nothing required missing; the optional gaps listed', () => {
  const f = specFacts(intake(), { url: 'https://client-a.example' })
  assert.deepEqual(missingRequired(f), [])
  assert.deepEqual(missingOptional(f), [])
  assert.equal(f.dailyBudget, 8)
  const thin = specFacts(intake({ business: { serviceArea: ['Town A'] }, ads: { budgetMonthly: 250 } }), { url: null })
  assert.deepEqual(missingOptional(thin), [
    'the phone customers call, for the call asset (q11)',
    'jobs they do not want calls for, for negatives (q3)',
    'residential, commercial or both (q5)',
    'who answers and when, for the ad schedule (q12)',
    'emergency or after-hours work (q13)',
    'main goal: calls, quote requests or both (q19)',
    'the site URL for final URLs',
  ])
})

test('missing required facts: no draft, and each one named', () => {
  const f = specFacts(intake({ services: [], business: { phone: '1' }, ads: {} }), { url: null })
  assert.deepEqual(missingRequired(f), ['services and the 2 or 3 money makers (q2)', 'service area: every town they drive to (q10)', 'monthly ad budget (q18)'])
})

test('the drafting prompt carries the computed budget, the known gaps and the shape, and forbids inventing', () => {
  const p = specPrompt({ client: { name: 'Client A' }, standards: 'S9', playbook: 'PB', dailyBudget: 8, missing: ['the site URL for final URLs'], date: 'Nov 1 2026' })
  assert.match(p, /Budget: \$8\.00\/day\. Status at build: PAUSED/)
  assert.match(p, /Never invent/)
  assert.match(p, /Known missing: the site URL for final URLs\./)
  assert.ok(p.includes(SPEC_SHAPE))
  assert.match(specPrompt({ client: {}, standards: '', playbook: '', dailyBudget: null, missing: [], date: 'x' }), /Budget: UNKNOWN/)
  assert.ok(SPEC_SHAPE.startsWith('# <Display name> (<contact first name>) | Google Ads launch spec | '))
})

test('code holds the spend: budget line exact, paused, presence, no higher daily figure', () => {
  assert.equal(specProblem(SAMPLE, 8), null)
  assert.match(specProblem(SAMPLE.replace('$8.00/day', '$12.00/day'), 8) ?? '', /must be exactly \$8\.00\/day/)
  assert.match(specProblem(`${SAMPLE}\nScale to $20/day after week one.`, 8) ?? '', /daily spend above \$8\.00/)
  assert.match(specProblem(SAMPLE.replace('PAUSED', 'ENABLED'), 8) ?? '', /PAUSED/)
  assert.match(specProblem(SAMPLE.replace('PRESENCE only', 'PRESENCE_OR_INTEREST'), 8) ?? '', /PRESENCE/)
  assert.match(specProblem(SAMPLE.replace('| Google Ads launch spec |', '| Ads plan |'), 8) ?? '', /title/)
  assert.match(specProblem(SAMPLE.replace('## Missing from the intake', '## Notes'), 8) ?? '', /Missing from the intake/)
  // No q18: the budget must be UNKNOWN and no daily spend may be named.
  assert.match(specProblem(SAMPLE, null) ?? '', /UNKNOWN/)
  const unknown = SAMPLE.replace('Budget: $8.00/day.', 'Budget: UNKNOWN.').replace(', so the daily budget is $8.00 ($243.20 a month)', '')
  assert.equal(specProblem(unknown, null), null)
})

test('a drafted spec is recognised by pre-flight as a build, and its own phone satisfies it', () => {
  assert.ok(isSpecBuild(SAMPLE))
  assert.deepEqual(adsPreflight({ neverTouch: false, instructions: `Build it paused.\n\n${SAMPLE}`, ownerPhone: null, intakePhone: null }, Object.fromEntries(['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_MCC_ID', 'ANTHROPIC_API_KEY_BUILDS'].map((n) => [n, 'x']))), [])
})

test('approval: only a draft, only on Jacob\'s own words, and the draft is never used before', () => {
  assert.deepEqual(approveDraft(intake(), 'looks good', NOW), { error: 'there is no ads spec draft to approve; draft one first' })
  const drafted = withDraft(intake(), SAMPLE, [], NOW)
  assert.equal(drafted.adsSpec?.draft?.text, SAMPLE)
  assert.match(String((approveDraft(drafted, 'what does the snow group look like?', NOW) as { error: string }).error), /has not approved it/)
  const ok = approveDraft(drafted, 'Looks good, store it', NOW)
  assert.ok('intake' in ok)
  assert.equal(ok.intake.adsSpec?.approved?.text, SAMPLE)
  assert.equal(ok.intake.adsSpec?.draft, undefined)
  // start_ads_task never builds from a draft.
  assert.deepEqual(chooseSpecSource(drafted, null), { source: 'none', reason: 'no approved spec on the intake and no docs/ads-specs/ file named' })
})

test('source order: the approved intake spec first, then the docs/ads-specs file', () => {
  const approved = (approveDraft(withDraft(intake(), SAMPLE, [], NOW), 'looks good', NOW) as { intake: IntakeWithSpec }).intake
  assert.deepEqual(chooseSpecSource(approved, 'docs/ads-specs/client-a-2026-10.md'), { source: 'intake', text: SAMPLE })
  assert.deepEqual(chooseSpecSource(intake(), 'docs/ads-specs/client-a-2026-10.md'), { source: 'file', path: 'docs/ads-specs/client-a-2026-10.md' })
  assert.equal(chooseSpecSource(null, null).source, 'none')
})

test('the storage key is out of reach of save_intake, the admin PATCH and the client link', () => {
  assert.ok(!(INTAKE_KEYS as readonly string[]).includes('adsSpec'))
  const stored = (approveDraft(withDraft(intake(), SAMPLE, [], NOW), 'looks good', NOW) as { intake: IntakeWithSpec }).intake
  // mergeIntake (save_intake, PATCH, lookup_gbp) ignores the key and keeps it.
  const merged = mergeIntake(stored, { adsSpec: { approved: { text: 'hacked' } }, about: 'x' }) as IntakeWithSpec
  assert.equal(merged.adsSpec?.approved?.text, SAMPLE)
  // The admin PATCH rejects it before merging.
  assert.throws(() => rejectUnknownKeys({ adsSpec: {} }, INTAKE_KEYS.filter((k) => k !== 'assets')))
  // The client link accepts only answers.
  assert.throws(() => readAnswerPatch({ adsSpec: {} }), AnswerError)
})

test('the chat message says nothing is built or spent, and names the gaps', () => {
  const m = specMessage('Client A', SAMPLE, ['the site URL for final URLs'])
  assert.match(m, /^Google Ads launch spec draft for Client A, written from the intake\. Nothing is stored, built or spent\./)
  assert.match(m, /Missing from the intake \(written UNKNOWN in the spec\): the site URL for final URLs\./)
  assert.doesNotMatch(m, /[\u2013\u2014]/)
})

test('flag off: the spec tools, the spec field and its reading all sit behind adsSpecEnabled()', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'ops', 'hq', 'chief.ts'), 'utf8')
  assert.match(src, /\.\.\.\(adsSpecEnabled\(\) \? adsSpecTools\(ctx\) : \[\]\)/)
  assert.match(src, /\.\.\.\(adsSpecEnabled\(\)\n\s+\? \{ spec: /)
  assert.match(src, /if \(adsSpecEnabled\(\) && input\.spec\) \{/)
  assert.equal((src.match(/adsSpecTools\(/g) ?? []).length, 2)
})
