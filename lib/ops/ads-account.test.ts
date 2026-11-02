import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  accountFields,
  accessRefusal,
  adsAccountCreateEnabled,
  applyAccountCreate,
  applyInvite,
  customerIdFrom,
  proposeAccount,
  stepAfterAccount,
  timeZoneFor,
  validTimeZone,
  zoneLine,
  type AccountDeps,
  type AccountFacts,
} from './ads-account'
import { STEP_CATALOG } from './steps'
import { AUTOFLOW_KINDS, AUTOFLOW_TABLE } from './autoflow'

const facts = (p: Partial<AccountFacts> = {}): AccountFacts => ({
  engagementId: 'eng1',
  displayName: 'Client A Painting',
  location: 'Town A, UT',
  intakeAddress: null,
  accountEmail: 'owner@example.com',
  businessId: 'biz1',
  existingCustomerId: null,
  neverTouch: false,
  hasAdsDeliverable: true,
  ...p,
})

function fakes(f: AccountFacts | null, opts: { validateThrows?: string; createReturns?: string | null; adsStep?: string | null } = {}) {
  const calls: { validateOnly: boolean; fields: unknown }[] = []
  const cards: { kind: string; detail: Record<string, unknown> }[] = []
  const binds: { customerId: string; nextStep: string | null }[] = []
  const invites: string[] = []
  const acts: string[] = []
  const deps: AccountDeps = {
    facts: async () => (f ? { ...f } : null),
    createCustomerClient: async (fields, validateOnly) => {
      calls.push({ validateOnly, fields })
      if (validateOnly && opts.validateThrows) throw new Error(opts.validateThrows)
      return validateOnly ? null : 'createReturns' in opts ? opts.createReturns ?? null : 'customers/1234567890'
    },
    invite: async (id, email, role) => {
      invites.push(`${id} ${email} ${role}`)
    },
    bind: async (_e, customerId, nextStep) => {
      binds.push({ customerId, nextStep })
      return { businessSet: true }
    },
    currentAdsStep: async () => ('adsStep' in opts ? opts.adsStep ?? null : 'account'),
    proposeCard: async (kind, _e, _t, detail) => {
      cards.push({ kind, detail })
      return `ap${cards.length}`
    },
    activity: async (_e, body) => {
      acts.push(body)
    },
  }
  return { deps, calls, cards, binds, invites, acts }
}

function withFlag<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ADS_ACCOUNT_CREATE
  if (on) process.env.ADS_ACCOUNT_CREATE = 'true'
  else delete process.env.ADS_ACCOUNT_CREATE
  return fn().finally(() => {
    if (prev === undefined) delete process.env.ADS_ACCOUNT_CREATE
    else process.env.ADS_ACCOUNT_CREATE = prev
  })
}

test('the flag is off unless exactly "true"', () => {
  assert.equal(adsAccountCreateEnabled({}), false)
  assert.equal(adsAccountCreateEnabled({ ADS_ACCOUNT_CREATE: 'yes' }), false)
  assert.equal(adsAccountCreateEnabled({ ADS_ACCOUNT_CREATE: 'true' }), true)
})

test('fields come from the board: name, USD, the time zone of a one-zone state', () => {
  assert.deepEqual(accountFields(facts()), { fields: { descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Denver' }, zone: { split: false, source: 'state' } })
  assert.deepEqual(timeZoneFor('Town B, nj'), { tz: 'America/New_York', split: false, source: 'state' })
  assert.deepEqual(timeZoneFor('Town C, AZ 85001'), { tz: 'America/Phoenix', split: false, source: 'state' })
  // The intake's home base is used when the board has no location.
  assert.deepEqual(accountFields(facts({ location: null, intakeAddress: '12 Main St, Town D, WA' })), { fields: { descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Los_Angeles' }, zone: { split: false, source: 'state' } })
})

test('missing or ambiguous fields block the proposal with a list, never a guess', () => {
  const r = accountFields(facts({ displayName: ' ', location: 'Town E, ZZ', businessId: null, hasAdsDeliverable: false }))
  assert.ok('blocked' in r)
  assert.deepEqual(r.blocked, [
    'the client has no ads service on the board',
    'the client has no platform account to store the account id on',
    'the business name (q1)',
    'the time zone: ZZ is not a US state I know',
  ])
  assert.match(String((accountFields(facts(), 'Mars/Olympus') as { blocked: string[] }).blocked), /not a valid time zone name/)
  assert.match(String((accountFields(facts({ location: null })) as { blocked: string[] }).blocked), /client location \(City, ST\)/)
  assert.match(String((accountFields(facts({ existingCustomerId: '9876543210' })) as { blocked: string[] }).blocked), /already has a Google Ads account \(9876543210\)/)
  assert.match(String((accountFields(facts({ neverTouch: true })) as { blocked: string[] }).blocked), /never-touch/)
})

test('propose: one validate_only call, then one card with the exact fields; nothing created', async () => {
  await withFlag(true, async () => {
    const f = fakes(facts())
    const r = await proposeAccount('eng1', f.deps)
    assert.equal(r.proposed, true)
    assert.deepEqual(f.calls, [{ validateOnly: true, fields: { descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Denver' } }])
    assert.equal(f.cards.length, 1)
    assert.equal(f.cards[0].kind, 'ads_account_create')
    assert.deepEqual(
      { ...f.cards[0].detail },
      { action: 'create_customer_client', engagementId: 'eng1', descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Denver', timeZoneSource: 'state', accountEmail: 'owner@example.com', accessCheck: 'validate_only create passed' }
    )
    assert.deepEqual(f.binds, [])
  })
})

test('access check not allowed: plain words, no card, nothing created', async () => {
  await withFlag(true, async () => {
    const f = fakes(facts(), { validateThrows: 'authorization_error: DEVELOPER_TOKEN_NOT_APPROVED' })
    const r = await proposeAccount('eng1', f.deps)
    assert.deepEqual(r, { proposed: false, reason: 'Not proposing a Google Ads account: the developer token is not allowed to create client accounts at its access level. Nothing was created.' })
    assert.equal(f.cards.length, 0)
    assert.equal(f.calls.filter((c) => !c.validateOnly).length, 0)
  })
  assert.match(accessRefusal('RESOURCE_COUNT_LIMIT_EXCEEDED'), /number of client accounts/)
  assert.match(accessRefusal('USER_PERMISSION_DENIED'), /not allowed to create client accounts/)
})

test('a blocked client never reaches Google', async () => {
  await withFlag(true, async () => {
    const f = fakes(facts({ location: null }))
    const r = await proposeAccount('eng1', f.deps)
    assert.equal(r.proposed, false)
    assert.match((r as { reason: string }).reason, /client location \(City, ST\)/)
    assert.equal(f.calls.length, 0)
  })
})

test('split states: the majority zone, flagged on the card for Jacob to confirm', async () => {
  const table: [string, string][] = [
    ['Town, FL', 'America/New_York'], ['Town, MI', 'America/New_York'], ['Town, IN', 'America/New_York'], ['Town, KY', 'America/New_York'],
    ['Town, TN', 'America/Chicago'], ['Town, TX', 'America/Chicago'], ['Town, KS', 'America/Chicago'], ['Town, NE', 'America/Chicago'],
    ['Town, SD', 'America/Chicago'], ['Town, ND', 'America/Chicago'], ['Town, OR', 'America/Los_Angeles'], ['Town, ID', 'America/Denver'],
  ]
  for (const [loc, tz] of table) assert.deepEqual(timeZoneFor(loc), { tz, split: true, source: 'state' }, loc)
  assert.equal(zoneLine({ tz: 'America/New_York', split: true, source: 'state' }), 'Time zone: America/New_York (state spans two zones; confirm before Push)')
  await withFlag(true, async () => {
    const f = fakes(facts({ location: 'Port City, FL' }))
    const r = await proposeAccount('eng1', f.deps)
    assert.equal(r.proposed, true)
    assert.equal(f.cards[0].detail.timeZone, 'America/New_York')
    assert.equal(f.cards[0].detail.timeZoneNote, 'state spans two zones; confirm before Push')
    // Push re-checks with the same default and goes ahead.
    const g = fakes(facts({ location: 'Port City, FL' }))
    assert.equal((await applyAccountCreate(f.cards[0].detail, g.deps, STEP_CATALOG.ads)).customerId, '1234567890')
  })
})

test('an explicit time zone from Jacob wins, is validated, and is honoured at Push', async () => {
  await withFlag(true, async () => {
    const f = fakes(facts({ location: 'Far West Town, TX' }))
    const r = await proposeAccount('eng1', f.deps, 'America/Denver')
    assert.equal(r.proposed, true)
    assert.equal(f.cards[0].detail.timeZone, 'America/Denver')
    assert.equal(f.cards[0].detail.timeZoneSource, 'override')
    assert.equal(f.cards[0].detail.timeZoneNote, undefined)
    const g = fakes(facts({ location: 'Far West Town, TX' }))
    assert.equal((await applyAccountCreate(f.cards[0].detail, g.deps, STEP_CATALOG.ads)).customerId, '1234567890')
    assert.equal((g.calls[0].fields as { timeZone: string }).timeZone, 'America/Denver')
    const bad = await proposeAccount('eng1', fakes(facts()).deps, 'Not/AZone')
    assert.equal(bad.proposed, false)
  })
  assert.equal(validTimeZone('America/Chicago'), 'America/Chicago')
  assert.equal(validTimeZone('chicago'), null)
})

test('Push: create for real, bind by id, step forward, then a separate invite card', async () => {
  const f = fakes(facts())
  const detail = { engagementId: 'eng1', descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Denver' }
  const r = await applyAccountCreate(detail, f.deps, STEP_CATALOG.ads)
  assert.deepEqual(r, { customerId: '1234567890', inviteApprovalId: 'ap1' })
  assert.deepEqual(f.calls.map((c) => c.validateOnly), [false])
  assert.deepEqual(f.binds, [{ customerId: '1234567890', nextStep: 'verification_docs' }])
  assert.equal(f.cards[0].kind, 'ads_invite')
  assert.deepEqual(f.cards[0].detail, { action: 'invite_user', engagementId: 'eng1', customerId: '1234567890', email: 'owner@example.com', role: 'ADMIN' })
  assert.deepEqual(f.invites, [])
  // The invite goes out only when that card is pushed.
  await applyInvite(f.cards[0].detail, f.deps)
  assert.deepEqual(f.invites, ['1234567890 owner@example.com ADMIN'])
})

test('Push refuses when things changed: an id bound since, details changed, or no id back', async () => {
  const detail = { engagementId: 'eng1', descriptiveName: 'Client A Painting', currencyCode: 'USD', timeZone: 'America/Denver' }
  await assert.rejects(applyAccountCreate(detail, fakes(facts({ existingCustomerId: '555' })).deps, STEP_CATALOG.ads), /already has a Google Ads account/)
  await assert.rejects(applyAccountCreate({ ...detail, timeZone: 'America/New_York' }, fakes(facts()).deps, STEP_CATALOG.ads), /changed since the card/)
  await assert.rejects(applyAccountCreate(detail, fakes(facts(), { createReturns: null }).deps, STEP_CATALOG.ads), /did not return a customer id/)
  // No q17 Gmail: no invite card.
  const noEmail = fakes(facts({ accountEmail: null }))
  assert.equal((await applyAccountCreate(detail, noEmail.deps, STEP_CATALOG.ads)).inviteApprovalId, null)
  // A step already past account is left alone.
  const later = fakes(facts(), { adsStep: 'campaign_build' })
  await applyAccountCreate(detail, later.deps, STEP_CATALOG.ads)
  assert.equal(later.binds[0].nextStep, null)
})

test('helpers: the id from the resource name, the next catalog step', () => {
  assert.equal(customerIdFrom('customers/1234567890'), '1234567890')
  assert.equal(customerIdFrom('customers/abc'), null)
  assert.equal(stepAfterAccount('account', STEP_CATALOG.ads), 'verification_docs')
  assert.equal(stepAfterAccount(null, STEP_CATALOG.ads), 'verification_docs')
  assert.equal(stepAfterAccount('running', STEP_CATALOG.ads), null)
})

test('no automatic path: autoflow cannot reach it, and only the chief tool and the Push call it', () => {
  assert.ok(!(AUTOFLOW_KINDS as readonly string[]).some((k) => /account|invite/.test(k)))
  assert.ok(AUTOFLOW_TABLE.every((r) => !/account|invite/.test(r.then)))
  const users = readdirSync(join(process.cwd(), 'lib', 'ops'), { recursive: true } as never)
    .map(String)
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.startsWith('ads-account'))
    .filter((p) => /ads-account-server/.test(readFileSync(join(process.cwd(), 'lib', 'ops', p), 'utf8')))
  assert.deepEqual(users.sort(), ['hq/approvals.ts', 'hq/chief.ts'])
})

test('flag off: no tool, no card kinds, and propose does nothing', async () => {
  await withFlag(false, async () => {
    const f = fakes(facts())
    assert.deepEqual(await proposeAccount('eng1', f.deps), { proposed: false, reason: 'ADS_ACCOUNT_CREATE is off' })
    assert.equal(f.calls.length, 0)
  })
  const chief = readFileSync(join(process.cwd(), 'lib', 'ops', 'hq', 'chief.ts'), 'utf8')
  assert.match(chief, /\.\.\.\(adsAccountCreateEnabled\(\) \? \[proposeAdsAccountTool\(ctx\)\] : \[\]\)/)
  const approvals = readFileSync(join(process.cwd(), 'lib', 'ops', 'hq', 'approvals.ts'), 'utf8')
  // ADS_BILLING_INVITE adds ads_invite alone (never ads_account_create) when ADS_ACCOUNT_CREATE is off.
  assert.match(approvals, /\.\.\.\(adsAccountCreateEnabled\(\) \? ACCOUNT_APPROVAL_KINDS : adsBillingInviteEnabled\(\) \? \['ads_invite'\] : \[\]\)/)
  assert.match(approvals, /if \(\(adsAccountCreateEnabled\(\) && \(ACCOUNT_APPROVAL_KINDS as readonly string\[\]\)\.includes\(approval\.kind\)\) \|\| \(adsBillingInviteEnabled\(\) && approval\.kind === 'ads_invite'\)\)/)
})
