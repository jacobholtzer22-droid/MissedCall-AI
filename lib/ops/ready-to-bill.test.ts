import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import { billRow, readyToBillEnabled, type BillFacts } from './ready-to-bill'

const facts = (p: Partial<BillFacts> = {}): BillFacts => ({
  id: 'e1',
  displayName: ' Client A Painting ',
  stage: 'onboarding',
  deliverables: [{ effectiveStatus: 'live' }, { effectiveStatus: 'live' }],
  stripeCustomerId: 'cus_1',
  stripeSyncedAt: '2026-11-01T10:00:00Z',
  stripeSubscriptionStatus: 'none',
  monthlyAmount: 350,
  upfrontAmount: 500,
  upfrontPaidAt: '2026-10-23T15:00:00Z',
  ...p,
})

test('the flag is off unless exactly "true"', () => {
  assert.equal(readyToBillEnabled({}), false)
  assert.equal(readyToBillEnabled({ READY_TO_BILL: 'on' }), false)
  assert.equal(readyToBillEnabled({ READY_TO_BILL: 'true' }), true)
})

test('everything live and no subscription seen: one row with the amount and the setup fee', () => {
  assert.deepEqual(billRow(facts(), false), {
    engagementId: 'e1',
    client: 'Client A Painting',
    text: 'All live: start the $350/mo subscription for Client A Painting',
    details: ['Setup fee: $500 paid Oct 23'],
    checkStripe: false,
  })
})

test('the rule: not every deliverable live, churned or ignored, or dismissed: no row', () => {
  assert.equal(billRow(facts({ deliverables: [{ effectiveStatus: 'live' }, { effectiveStatus: 'in_progress' }] }), false), null)
  assert.equal(billRow(facts({ deliverables: [] }), false), null)
  assert.equal(billRow(facts({ stage: 'churned' }), false), null)
  assert.equal(billRow(facts({ stage: 'ignored' }), false), null)
  assert.equal(billRow(facts(), true), null)
})

test('a subscription seen hides it: active, trialing, past_due, unpaid, scheduled', () => {
  for (const s of ['active', 'trialing', 'past_due', 'unpaid', 'scheduled', 'ACTIVE']) assert.equal(billRow(facts({ stripeSubscriptionStatus: s }), false), null, s)
  // Canceled is not a live subscription: the row stays and says so.
  assert.deepEqual(billRow(facts({ stripeSubscriptionStatus: 'canceled' }), false)?.details, ['Setup fee: $500 paid Oct 23', 'Stripe shows the last subscription canceled'])
})

test('the board cannot tell: the row shows, with check Stripe', () => {
  const noCustomer = billRow(facts({ stripeCustomerId: null, stripeSubscriptionStatus: 'active' }), false)
  assert.equal(noCustomer?.checkStripe, true)
  assert.ok(noCustomer?.details.includes('Check Stripe: no Stripe customer is linked, so the board cannot see a subscription'))
  assert.ok(billRow(facts({ stripeSyncedAt: null }), false)?.details.includes('Check Stripe: not synced yet'))
})

test('amount and setup fee display', () => {
  assert.equal(billRow(facts({ monthlyAmount: null }), false)?.text, 'All live: start the subscription for Client A Painting (amount not recorded)')
  assert.equal(billRow(facts({ monthlyAmount: 0 }), false)?.text, 'All live: start the subscription for Client A Painting (amount not recorded)')
  assert.equal(billRow(facts({ monthlyAmount: 287.5 }), false)?.text, 'All live: start the $287.50/mo subscription for Client A Painting')
  assert.deepEqual(billRow(facts({ upfrontPaidAt: null }), false)?.details, ['Setup fee: $500 recorded, not seen paid'])
  assert.deepEqual(billRow(facts({ upfrontAmount: null }), false)?.details, [])
})

test('never Stripe: the rule, the dismiss route and the board read no Stripe API; flag off adds nothing', () => {
  for (const f of ['lib/ops/ready-to-bill.ts', 'app/api/admin/ops/engagements/[id]/ready-to-bill/route.ts']) {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    assert.doesNotMatch(src, /getStripe|from 'stripe'|stripe\.(subscriptions|customers|invoices)/, f)
  }
  const route = readFileSync(join(process.cwd(), 'app/api/admin/ops/engagements/[id]/ready-to-bill/route.ts'), 'utf8')
  assert.match(route, /if \(!readyToBillEnabled\(\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/)
  const board = readFileSync(join(process.cwd(), 'lib/ops/board.ts'), 'utf8')
  assert.match(board, /readyToBillEnabled\(\) \? await loadBillRows\(live\) : null/)
  assert.match(board, /\.\.\.\(billRows \? \{ billRows \} : \{\}\)/)
})
