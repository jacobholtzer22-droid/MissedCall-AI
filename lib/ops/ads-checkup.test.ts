import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  CALLS_PER_RUN,
  CHECKUP_MAX_ACCOUNTS,
  CHECKUP_OPS_BUDGET,
  EXPLORER_DAILY_OPS,
  adsWeeklyCheckupEnabled,
  checkupNote,
  planCheckup,
  type CheckupCandidate,
} from './ads-checkup'
import { ADS_APPLY_TOOLS, ADS_READ_TOOLS, ADS_WORK_TOOLS, CHECKUP_PROPOSABLE, CHECKUP_READ_TOOLS, adsTools, checkProposal, type AdsToolContext } from './hq/ads-tools'

const c = (p: Partial<CheckupCandidate> = {}): CheckupCandidate => ({
  engagementId: 'e1',
  name: 'Client A',
  stage: 'active',
  services: ['ads', 'website'],
  customerId: '1234567890',
  adsStep: 'running',
  adsStatus: 'live',
  neverTouch: false,
  lastCheckupAt: null,
  ...p,
})
const ctx = (p: Partial<AdsToolContext> = {}): AdsToolContext => ({ runId: 'r', customerId: '1234567890', client: 'Client A', engagementId: 'e1', mode: 'work', dry: false, calls: 0, writes: [], ...p })

test('the flag is off unless exactly "true"', () => {
  assert.equal(adsWeeklyCheckupEnabled({}), false)
  assert.equal(adsWeeklyCheckupEnabled({ ADS_WEEKLY_CHECKUP: '1' }), false)
  assert.equal(adsWeeklyCheckupEnabled({ ADS_WEEKLY_CHECKUP: 'true' }), true)
})

test('client selection: ads service, a bound account, live or running, not churned or ignored', () => {
  assert.deepEqual(planCheckup([c()]).run.map((x) => x.engagementId), ['e1'])
  assert.equal(planCheckup([c({ adsStep: 'enable', adsStatus: 'in_progress' })]).run.length, 0)
  assert.equal(planCheckup([c({ adsStep: null, adsStatus: 'live' })]).run.length, 1)
  assert.equal(planCheckup([c({ customerId: null })]).run.length, 0)
  assert.equal(planCheckup([c({ services: ['website'] })]).run.length, 0)
  assert.equal(planCheckup([c({ stage: 'churned' })]).run.length, 0)
  assert.equal(planCheckup([c({ stage: 'ignored' })]).run.length, 0)
})

test('never-touch clients are skipped with a reason', () => {
  const p = planCheckup([c({ neverTouch: true })])
  assert.equal(p.run.length, 0)
  assert.deepEqual(p.skipped.map((s) => s.reason), ['on the never-touch list'])
})

test('budget: well under the Explorer cap; least recently checked first; the rest skipped with a note', () => {
  assert.equal(CHECKUP_MAX_ACCOUNTS, 8)
  assert.ok(CHECKUP_MAX_ACCOUNTS * CALLS_PER_RUN <= CHECKUP_OPS_BUDGET)
  assert.ok(CHECKUP_OPS_BUDGET <= EXPLORER_DAILY_OPS / 2)
  const rows = Array.from({ length: 11 }, (_, n) => c({ engagementId: `e${n}`, name: `Client ${n}`, lastCheckupAt: n < 3 ? null : new Date(Date.UTC(2026, 9, n)).toISOString() }))
  const p = planCheckup(rows)
  assert.equal(p.run.length, 8)
  assert.deepEqual(p.run.slice(0, 3).map((x) => x.engagementId), ['e0', 'e1', 'e2'])
  assert.deepEqual(p.skipped.map((s) => s.candidate.engagementId), ['e8', 'e9', 'e10'])
  assert.match(p.skipped[0].reason, /^over this week's budget \(8 accounts, 1200 Google Ads operations\); first in line next week$/)
})

test('the tool filter: a check-up run gets reads only, never a write', () => {
  const names = adsTools(ctx({ checkup: true })).map((t) => t.name)
  assert.deepEqual(names, CHECKUP_READ_TOOLS)
  for (const w of [...ADS_WORK_TOOLS, ...ADS_APPLY_TOOLS, 'set_ads_step', 'bind_account', 'find_client_account', 'peek_account', 'read_conversion_labels']) {
    assert.ok(!names.includes(w), w)
  }
  assert.ok(CHECKUP_READ_TOOLS.every((n) => ADS_READ_TOOLS.includes(n)))
  // Locked to the run's account, and refused without one.
  assert.throws(() => adsTools(ctx({ checkup: true, customerId: '' })), /bound account/)
})

test('the playbook AUTO writes are not allowed in a check-up; a normal work run still has them', async () => {
  const work = adsTools(ctx()).map((t) => t.name)
  for (const w of ADS_WORK_TOOLS) assert.ok(work.includes(w), w)
  const checkup = adsTools(ctx({ checkup: true }))
  for (const w of ADS_WORK_TOOLS) assert.ok(!checkup.some((t) => t.name === w), w)
  const tool = checkup.find((t) => t.name === 'search_terms')!
  await assert.rejects(tool.run({ customerId: '9999999999', days: 7 }), /works only on Client A/)
})

test('proposals: cut-waste work tools only from a check-up, and they apply only with that approval', () => {
  assert.match(checkProposal('add_campaign_negatives', { campaignId: '1', phrases: ['diy'] }) ?? '', /is not one of/)
  assert.equal(checkProposal('add_campaign_negatives', { campaignId: '1', phrases: ['diy'] }, { checkup: true }), null)
  assert.match(checkProposal('create_search_campaign', {}, { checkup: true }) ?? '', /is not one of/)
  assert.deepEqual(CHECKUP_PROPOSABLE, ['add_campaign_negatives', 'pause_campaign', 'exclude_conversion_goal'])
  // Apply mode for a pushed check-up proposal: exactly that one work tool, besides the reads.
  const applied = adsTools(ctx({ mode: 'apply', allow: ['add_campaign_negatives'], applyExtra: CHECKUP_PROPOSABLE, approved: { action: 'add_campaign_negatives', args: {} } })).map((t) => t.name)
  assert.ok(applied.includes('add_campaign_negatives'))
  assert.ok(!applied.includes('pause_campaign'))
  // Without the check-up marker an apply run still cannot get a work tool (unchanged).
  assert.throws(() => adsTools(ctx({ mode: 'apply', allow: ['add_campaign_negatives'] })), /apply mode needs/)
})

test('the client note', () => {
  assert.equal(checkupNote('Three junk searches cost $41; tracking records calls.', 2), 'Weekly ads check-up: Three junk searches cost $41; tracking records calls. 2 proposals filed for your Push. Nothing was changed.')
  assert.equal(checkupNote('', 1), 'Weekly ads check-up: nothing to report 1 proposal filed for your Push. Nothing was changed.')
  assert.equal(checkupNote(null, 0, 'no report'), 'Weekly ads check-up did not finish: no report. Nothing was changed.')
})

test('flag off: the cron answers 404 first; an unset CRON_SECRET never opens it', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'api', 'cron', 'ads-checkup', 'route.ts'), 'utf8')
  const get = src.slice(src.indexOf('export async function GET'))
  assert.match(get.split('\n')[1], /if \(!adsWeeklyCheckupEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/)
  assert.match(src, /if \(cronSecret && authHeader === `Bearer \$\{cronSecret\}`\) return true/)
  assert.match(src, /checkup: true/)
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
  assert.ok(vercel.crons.some((c2) => c2.path === '/api/cron/ads-checkup' && c2.schedule === '23 14 * * 1'))
})
