import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHASE_CAP, CHASE_DRAFTS, chaseDraft, clientChaseEnabled, clientChaseList } from './client-chase'
import { STEP_CATALOG } from './steps'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const NOW = new Date('2026-11-01T16:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const deliverable = (p: Record<string, unknown> = {}) => ({
  id: 'd1',
  type: 'domain',
  step: 'transfer_requested',
  stepLabel: 'Client to unlock and send the auth code',
  waitingOn: 'client',
  stepUpdatedAt: daysAgo(5),
  ...p,
})
const engagement = (p: Record<string, unknown> = {}, deliverables = [deliverable()]) => ({
  id: 'e1',
  displayName: 'Vandenberg Roofing',
  contactName: 'Mike Vandenberg',
  phone: '+16165551234',
  stage: 'onboarding',
  lastContactedAt: daysAgo(4),
  deliverables,
  ...p,
})

test('CLIENT_CHASE_LIST is off unless exactly "true"', () => {
  assert.equal(clientChaseEnabled({}), false)
  assert.equal(clientChaseEnabled({ CLIENT_CHASE_LIST: 'on' }), false)
  assert.equal(clientChaseEnabled({ CLIENT_CHASE_LIST: 'true' }), true)
})

test('a row: client, deliverable, step label, days waiting, last contacted, draft', () => {
  assert.deepEqual(clientChaseList([engagement()], NOW), [
    {
      engagementId: 'e1',
      deliverableId: 'd1',
      clientName: 'Vandenberg Roofing',
      deliverable: 'Domain',
      stepLabel: 'Client to unlock and send the auth code',
      daysWaiting: 5,
      lastContacted: 'last contacted 4 days ago',
      phone: '+16165551234',
      draft:
        'Hey Mike, Jacob here. For the domain transfer I need you to unlock the domain at your registrar and send me ' +
        'the auth code (also called the EPP code). Happy to walk you through it on a quick call.',
    },
  ])
  assert.equal(clientChaseList([engagement({ lastContactedAt: null })], NOW)[0].lastContacted, 'never contacted')
  assert.equal(clientChaseList([engagement({ lastContactedAt: daysAgo(1) })], NOW)[0].lastContacted, 'last contacted 1 day ago')
})

test('eligibility: waiting on client, over 3 days, not terminal, not churned or ignored', () => {
  const n = (e: ReturnType<typeof engagement>) => clientChaseList([e], NOW).length
  assert.equal(n(engagement({}, [deliverable({ waitingOn: 'jacob' })])), 0)
  assert.equal(n(engagement({}, [deliverable({ stepUpdatedAt: daysAgo(2) })])), 0)
  assert.equal(n(engagement({}, [deliverable({ stepUpdatedAt: null })])), 0)
  assert.equal(n(engagement({}, [deliverable({ type: 'ads', step: 'paused_by_client', stepLabel: 'Paused' })])), 0)
  assert.equal(n(engagement({ stage: 'churned' })), 0)
  assert.equal(n(engagement({ stage: 'ignored' })), 0)
})

test('oldest first, capped', () => {
  const rows = clientChaseList(
    [
      engagement({ id: 'a', displayName: 'Newer' }, [deliverable({ id: 'x', stepUpdatedAt: daysAgo(4) })]),
      engagement({ id: 'b', displayName: 'Older' }, [deliverable({ id: 'y', stepUpdatedAt: daysAgo(9) })]),
    ],
    NOW
  )
  assert.deepEqual(rows.map((r) => r.clientName), ['Older', 'Newer'])
  const many = Array.from({ length: 40 }, (_, i) => deliverable({ id: `d${i}`, stepUpdatedAt: daysAgo(4 + i) }))
  const capped = clientChaseList([engagement({}, many)], NOW)
  assert.equal(capped.length, CHASE_CAP)
  assert.equal(capped[0].deliverableId, 'd39')
})

test('every client step in the catalog has its own draft; drafts are GSM-7, no dashes, first name', () => {
  for (const [type, steps] of Object.entries(STEP_CATALOG)) {
    for (const s of steps) {
      if (s.owner !== 'client' || s.terminal) continue
      assert.ok(CHASE_DRAFTS[`${type}.${s.key}`], `missing draft for ${type}.${s.key}`)
    }
  }
  for (const key of Object.keys(CHASE_DRAFTS)) {
    const [type, step] = key.split('.')
    const t = chaseDraft(type, step, 'Mike Vandenberg')
    assert.match(t, /^Hey Mike, Jacob here\. /)
    assert.match(t, GSM7, key)
    assert.doesNotMatch(t, /[\u2013\u2014]/)
  }
  assert.match(chaseDraft('website', 'brief', null), /^Hey, Jacob here\./)
})

test('the generic fallback covers any other step set to wait on the client', () => {
  assert.equal(
    chaseDraft('email', 'workspace', 'Mike'),
    "Hey Mike, Jacob here. Checking in on your business email. I'm waiting on one thing from you to keep it moving. " +
      'Can you call or text me back when you get a minute?'
  )
  const rows = clientChaseList([engagement({}, [deliverable({ type: 'website', step: 'build', stepLabel: 'Build in progress' })])], NOW)
  assert.match(rows[0].draft, /Checking in on your website\./)
})
