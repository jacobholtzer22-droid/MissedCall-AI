import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTOFLOW_KINDS,
  AUTOFLOW_TABLE,
  autoflowEnabled,
  isLoop,
  nextStep,
  runAutoflowEvent,
  type AutoflowDeps,
  type AutoflowEvent,
  type DeliverableState,
} from './autoflow'

const ENG = 'eng1'
const T1 = '2026-11-01T15:00:00.000Z'
const T2 = '2026-11-02T15:00:00.000Z'

const site = (p: Partial<DeliverableState> = {}): DeliverableState => ({ type: 'website', step: 'review', stepUpdatedAt: T1, evidence: { repoUrl: 'https://github.com/x/y' }, ...p })
const run = (p: Partial<Extract<AutoflowEvent, { type: 'run' }>> = {}): AutoflowEvent => ({
  type: 'run',
  id: 'run1',
  agent: 'web',
  kind: 'site_build',
  status: 'succeeded',
  engagementId: ENG,
  trackingRun: false,
  ...p,
})
const push = (action: string, id = 'ap1'): AutoflowEvent => ({ type: 'approval', id, action, engagementId: ENG })
const LABELS = { googleAdsId: 'AW-123456789', conversionActions: { formLabel: 'abcDEF', callLabel: 'ghiJKL' } }

test('the flag is off unless exactly "true"', () => {
  assert.equal(autoflowEnabled({}), false)
  assert.equal(autoflowEnabled({ OPS_AUTOFLOW: 'yes' }), false)
  assert.equal(autoflowEnabled({ OPS_AUTOFLOW: 'true' }), true)
})

test('table: a green build at review gets review, and nothing else does', () => {
  assert.deepEqual(
    [nextStep([site()], run()).act, (nextStep([site()], run()) as { kind?: string }).kind],
    [true, 'review']
  )
  assert.equal((nextStep([site()], run({ kind: 'site_update' })) as { kind?: string }).kind, 'review')
  for (const [why, ds, e] of [
    ['failed run', [site()], run({ status: 'failed' })],
    ['tracking update', [site()], run({ kind: 'site_update', trackingRun: true })],
    ['site already live', [site({ evidence: { repoUrl: 'r', siteIndexableFlag: true } })], run()],
    ['step not review', [site({ step: 'approved' })], run()],
    ['go_live run', [site()], run({ kind: 'go_live' })],
    ['provision run', [site()], run({ kind: 'provision' })],
  ] as [string, DeliverableState[], AutoflowEvent][]) {
    assert.equal(nextStep(ds, e).act, false, why)
  }
})

test('table: merge Push gets the go-live card; buy_domain the email records card only at dns_records', () => {
  assert.equal((nextStep([site({ step: 'approved' })], push('merge')) as { kind?: string }).kind, 'go_live')
  const email = (step: string): DeliverableState => ({ type: 'email', step, stepUpdatedAt: T1, evidence: {} })
  assert.equal((nextStep([site(), email('dns_records')], push('buy_domain')) as { kind?: string }).kind, 'set_email_records')
  assert.equal(nextStep([site(), email('workspace')], push('buy_domain')).act, false)
  assert.equal(nextStep([site()], push('buy_domain')).act, false)
  for (const action of ['go_live', 'connect_domain', 'set_email_records', 'install_tracking', 'enable_campaign', 'set_campaign_budget', '']) {
    assert.equal(nextStep([site()], push(action)).act, false, action)
  }
})

test('table: labels read by an ads run get the tracking card, only when the site has a repo and no tag', () => {
  const ads: DeliverableState = { type: 'ads', step: 'campaign_build', stepUpdatedAt: T1, evidence: LABELS }
  const e = run({ agent: 'ads', kind: 'ads_task' })
  assert.equal((nextStep([site({ step: 'approved' }), ads], e) as { kind?: string }).kind, 'install_tracking')
  assert.equal(nextStep([site({ evidence: { repoUrl: 'r', trackingInstalled: true } }), ads], e).act, false)
  assert.equal(nextStep([site({ evidence: {} }), ads], e).act, false)
  assert.equal(nextStep([site(), { ...ads, evidence: {} }], e).act, false)
  assert.equal(nextStep([site(), ads], run({ agent: 'ads', status: 'failed' })).act, false)
})

test('never past an approval point, never spend or enable: the table only reaches the allowed kinds', () => {
  assert.deepEqual([...AUTOFLOW_KINDS].sort(), ['go_live', 'install_tracking', 'review', 'set_email_records'])
  const forbidden = ['merge', 'connect_domain', 'buy_domain', 'provision', 'site_build', 'site_update', 'set_brief', 'enable_campaign', 'set_campaign_budget', 'apply']
  for (const row of AUTOFLOW_TABLE) {
    assert.ok((AUTOFLOW_KINDS as readonly string[]).includes(row.then), row.rule)
    assert.ok(!forbidden.includes(row.then), row.rule)
    assert.ok(row.stopsAt.length > 0, row.rule)
  }
  // No row starts the ads specialist (no apply mode, no budget, no enable).
  assert.ok(AUTOFLOW_TABLE.every((r) => !/ads/.test(r.then)))
})

function fakes(ds: DeliverableState[], opts: { refuse?: string } = {}) {
  const acts: { body: string; kind: string }[] = []
  const notes: string[] = []
  const started: string[] = []
  const lines: string[] = []
  const deps: AutoflowDeps = {
    deliverables: async () => ds.map((d) => ({ ...d })),
    handled: async (_e, marker) => acts.some((a) => a.body.startsWith(`${marker} |`)),
    lastHop: async () => [...acts].reverse().find((a) => a.body.includes('| started '))?.body ?? null,
    startWeb: async (_e, kind) => {
      started.push(kind)
      if (opts.refuse) throw new Error(opts.refuse)
      return { done: `${kind} done` }
    },
    activity: async (_e, body, kind) => {
      acts.push({ body, kind })
    },
    waitingNote: async (_e, _t, note) => {
      notes.push(note)
    },
    log: (l) => lines.push(l),
  }
  return { deps, acts, notes, started, lines }
}

test('one hop per event: the same event a second time does nothing', async () => {
  const f = fakes([site()])
  const first = await runAutoflowEvent(run(), f.deps)
  assert.equal(first.acted, true)
  const second = await runAutoflowEvent(run(), f.deps)
  assert.deepEqual([second.acted, second.line], [false, 'already handled'])
  assert.deepEqual(f.started, ['review'])
  // Every hop is logged with its rule and reason.
  assert.match(f.acts[0].body, /^\[autoflow\] event run:run1 \| rule build_done_review \| started review on website at step review since 2026-11-01T15:00:00.000Z \| the build finished green/)
  assert.ok(f.lines.some((l) => l.startsWith('[autoflow] ')))
})

test('an event with no row is recorded once and starts nothing', async () => {
  const f = fakes([site({ step: 'live' })])
  const r = await runAutoflowEvent(push('connect_domain'), f.deps)
  assert.equal(r.acted, false)
  assert.deepEqual(f.started, [])
  assert.match(f.acts[0].body, /^\[autoflow\] event approval:ap1 \| no step/)
})

test('a refusal (the go-live gate) is logged as the stop, nothing else happens', async () => {
  const f = fakes([site({ step: 'approved' })], { refuse: 'Not taking Client A live: Google tag is not on the site' })
  const r = await runAutoflowEvent(push('merge'), f.deps)
  assert.equal(r.acted, true)
  assert.deepEqual(f.started, ['go_live'])
  assert.match(f.acts[0].body, /refused: Not taking Client A live/)
})

test('loop guard: the same step again with no step change stops with a note', async () => {
  const f = fakes([site()])
  await runAutoflowEvent(run({ id: 'r1' }), f.deps)
  // A second green build at the same step, same stepUpdatedAt: the guard stops it.
  const again = await runAutoflowEvent(run({ id: 'r2' }), f.deps)
  assert.equal(again.acted, false)
  assert.deepEqual(f.started, ['review'])
  assert.match(f.notes[0], /^Autoflow stopped: review on website would run again at step review/)
  assert.ok(f.acts.some((a) => a.kind === 'note' && a.body.includes('loop guard')))
  // The step moved and came back (review, send_preview, review): a change, so it acts.
  const g = fakes([site({ stepUpdatedAt: T2 })])
  g.acts.push(...f.acts.filter((a) => a.body.includes('| started ')))
  assert.equal((await runAutoflowEvent(run({ id: 'r3' }), g.deps)).acted, true)
  assert.equal(isLoop(null, { act: true, rule: 'x', kind: 'review', deliverable: 'website', reason: '', stopsAt: '' }, { step: 'review', stepUpdatedAt: T1 }), false)
})

test('flag off: both entry points do nothing and touch nothing', async () => {
  const prev = process.env.OPS_AUTOFLOW
  delete process.env.OPS_AUTOFLOW
  try {
    const { autoflowForJob, autoflowAfterPush } = await import('./autoflow-server')
    assert.deepEqual(await autoflowForJob('job1', 'run1'), [])
    assert.equal(await autoflowAfterPush({ id: 'a', jobId: 'j', runId: 'r' }, { action: 'merge', engagementId: ENG }), null)
  } finally {
    if (prev !== undefined) process.env.OPS_AUTOFLOW = prev
  }
})
