// ===========================================
// /admin/ops Home triage tests
// ===========================================
// Run: npm test. Fixtures are shaped like the Oct 28 2026 board.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bucketClients, type TriageBoard, type TriageClient } from './triage'
import type { OpsAlert } from './alerts'

const NOW = new Date('2026-10-28T15:00:00Z') // 11:00 AM Detroit

type D = TriageClient['deliverables'][number]
const step = (type: string, s: string | null, waitingOn: string | null, opts: Partial<D> = {}): D => ({
  type,
  step: s,
  stepLabel: s,
  stepTerminal: s === 'live' || s === 'running' || s === 'paused_by_client',
  waitingOn,
  waitingNote: null,
  stepUpdatedAt: '2026-10-22T14:00:00Z',
  ...opts,
})
const red = (code: OpsAlert['code'], message: string = code): OpsAlert => ({ code, severity: 'red', message })
const yellow = (code: OpsAlert['code'], message: string = code): OpsAlert => ({ code, severity: 'yellow', message })

function client(id: string, over: Partial<TriageClient> = {}): TriageClient {
  return {
    id,
    displayName: id,
    stage: 'active',
    alerts: [],
    nextFollowUpAt: null,
    lastContactedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    deliverables: [step('website', 'live', null)],
    ...over,
  }
}

function board(engagements: TriageClient[], extra: Partial<TriageBoard> = {}): TriageBoard {
  return { engagements, followUpsDue: [], bookedToday: [], ...extra }
}

const where = (t: ReturnType<typeof bucketClients>, id: string) =>
  (['today', 'getDone', 'waitingOnClient', 'live'] as const).find((b) => t[b].some((e) => e.engagementId === id)) ?? null

test('every non-churned client lands in exactly one bucket; churned and ignored are counted apart', () => {
  const t = bucketClients(
    board([client('a'), client('b', { stage: 'churned' }), client('c', { stage: 'ignored' }), client('d', { deliverables: [step('website', 'review', 'jacob')] })]),
    [],
    NOW
  )
  const all = [...t.today, ...t.getDone, ...t.waitingOnClient, ...t.live].map((e) => e.engagementId)
  assert.deepEqual(all.sort(), ['a', 'd'])
  assert.equal(t.churnedCount, 1)
})

test('a pending approval puts the client in Today with a Push action', () => {
  const t = bucketClients(board([client('cm', { deliverables: [step('ads', 'enable', 'jacob')] })]), [
    { id: 'ap1', title: 'Enable CM Home Services campaign', status: 'pending', engagementId: 'cm', createdAt: '2026-10-27T20:00:00Z' },
  ], NOW)
  assert.equal(where(t, 'cm'), 'today')
  assert.deepEqual(t.today[0].primaryAction, { kind: 'push', approvalId: 'ap1' })
  assert.match(t.today[0].reasons[0].text, /Waiting for your Push/)
})

test('a due follow-up is Today with Log contact; a future one is not', () => {
  const t = bucketClients(
    board([client('alfa', { nextFollowUpAt: '2026-10-27T13:00:00Z' }), client('later', { nextFollowUpAt: '2026-11-03T14:00:00Z' })]),
    [],
    NOW
  )
  assert.equal(where(t, 'alfa'), 'today')
  assert.deepEqual(t.today[0].primaryAction, { kind: 'log_contact' })
  assert.equal(where(t, 'later'), 'live')
})

test('leads notifying nobody is Today only when something live produces leads (Rays vs Oliveira)', () => {
  const rays = client('rays', { alerts: [red('no_owner_contact', 'Leads would notify nobody')], deliverables: [step('website', 'live', null)] })
  const oliveira = client('oliveira', {
    alerts: [red('no_owner_contact', 'Leads would notify nobody')],
    deliverables: [step('website', 'revisions', 'jacob'), step('domain', 'transfer_in_progress', 'vendor')],
  })
  const t = bucketClients(board([rays, oliveira]), [], NOW)
  assert.equal(where(t, 'rays'), 'today')
  assert.equal(where(t, 'oliveira'), 'getDone')
})

test('missed-call texting at test counts as live for leads', () => {
  const t = bucketClients(
    board([client('mc', { alerts: [red('no_owner_contact')], deliverables: [step('missedcall', 'test', 'jacob')] })]),
    [],
    NOW
  )
  assert.equal(where(t, 'mc'), 'today')
})

test('past due and blocked are Today', () => {
  const t = bucketClients(board([client('p', { alerts: [red('past_due', 'Subscription past due')] }), client('b', { alerts: [red('deliverable_blocked', 'Blocked: ads')] })]), [], NOW)
  assert.equal(where(t, 'p'), 'today')
  assert.equal(where(t, 'b'), 'today')
})

test('Get done: a step on Jacob, no steps at all, no subscription, Stripe unlinked', () => {
  const t = bucketClients(
    board([
      client('titan', { deliverables: [step('website', 'revisions', 'jacob'), step('domain', 'transfer_requested', 'client')] }),
      client('better2', { stage: 'onboarding', deliverables: [step('website', null, null)] }),
      client('kalights', { alerts: [yellow('no_subscription', 'Paid upfront 12 days ago, no subscription yet')] }),
      client('inandout', { stage: 'onboarding', alerts: [yellow('stripe_unlinked', 'No Stripe customer linked')], deliverables: [] }),
    ]),
    [],
    NOW
  )
  for (const id of ['titan', 'better2', 'kalights', 'inandout']) assert.equal(where(t, id), 'getDone', id)
  const titan = t.getDone.find((e) => e.engagementId === 'titan')!
  assert.match(titan.reasons[0].text, /^Website: revisions, waiting on you since Oct 22/)
})

test('Waiting on client: every open step waits on the client or a vendor', () => {
  const t = bucketClients(
    board([
      client('grizscapes', {
        lastContactedAt: '2026-10-22T15:00:00Z',
        deliverables: [step('website', 'approved', null), step('domain', 'transfer_requested', 'client', { waitingNote: 'auth code for grizscapes.com' })],
      }),
    ]),
    [],
    NOW
  )
  assert.equal(where(t, 'grizscapes'), 'waitingOnClient')
  assert.match(t.waitingOnClient[0].reasons[0].text, /auth code for grizscapes\.com, waiting on client since Oct 22 \(last contact 6 days ago\)/)
})

test("paused at the client's request waits on the client (OC Water, S&G)", () => {
  const t = bucketClients(board([client('sg', { deliverables: [step('ads', 'paused_by_client', 'client'), step('website', 'live', null)] })]), [], NOW)
  assert.equal(where(t, 'sg'), 'waitingOnClient')
})

test('nothing open and no red alert is live, with no action', () => {
  const t = bucketClients(board([client('prestige', { deliverables: [step('ads', 'running', null), step('website', 'live', null)] })]), [], NOW)
  assert.equal(where(t, 'prestige'), 'live')
  assert.equal(t.live[0].primaryAction, null)
})

test('a yellow half-missing owner contact is not work (Big Bear)', () => {
  const t = bucketClients(board([client('bigbear', { alerts: [yellow('no_owner_contact', 'No owner phone or forwarding number for lead alerts')] })]), [], NOW)
  assert.equal(where(t, 'bigbear'), 'live')
})

test('a red alert never leaves a client in live', () => {
  const t = bucketClients(board([client('x', { alerts: [red('no_subscription', 'Paid upfront 45 days ago, no subscription yet')] })]), [], NOW)
  assert.equal(where(t, 'x'), 'getDone')
})

test('Today is oldest reason first; prospects and calls come back as sales, not clients', () => {
  const t = bucketClients(
    board([client('new', { nextFollowUpAt: '2026-10-28T13:00:00Z' }), client('old', { nextFollowUpAt: '2026-10-20T13:00:00Z' })], {
      followUpsDue: [
        { kind: 'prospect', id: 'p1', name: 'Joash', phone: null, dueAt: '2026-09-21T13:00:00Z' },
        { kind: 'client', id: 'old', name: 'old', phone: null, dueAt: '2026-10-20T13:00:00Z' },
      ],
      bookedToday: [
        { id: 'b1', customerName: 'Kevin', scheduledAt: '2026-10-28T18:00:00Z', status: 'confirmed', showStatus: 'pending' },
        { id: 'b2', customerName: 'Gone', scheduledAt: '2026-10-28T19:00:00Z', status: 'cancelled', showStatus: 'pending' },
      ],
    }),
    [],
    NOW
  )
  assert.deepEqual(t.today.map((e) => e.engagementId), ['old', 'new'])
  assert.deepEqual(t.sales.prospectFollowUps.map((p) => p.id), ['p1'])
  assert.deepEqual(t.sales.demoCallsToday.map((b) => b.id), ['b1'])
})
