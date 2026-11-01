// ===========================================
// DUPLICATE_GUARD: one client, one account
// ===========================================
// Run: npm test. Pure; no database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { duplicateGuardEnabled, likelyMatches, linkCardExpected, linkCardTitle, normName, telnyxClashWarning, type PoolEntry } from './duplicate-guard'

const pool: PoolEntry[] = [
  { kind: 'engagement', id: 'e1', name: 'Client A Painting 2 LLC', email: 'owner@client-a.example', phones: ['+15555550100'], engagementId: 'e1', businessId: 'b1' },
  { kind: 'business', id: 'b1', name: 'Client A Painting', email: 'owner@client-a.example', phones: ['(555) 555-0100', null], engagementId: 'e1', businessId: 'b1' },
  { kind: 'engagement', id: 'e2', name: 'Other Lawn Care', email: null, phones: ['+15555550199'], engagementId: 'e2', businessId: null },
]

test('flag is off unless exactly "true"', () => {
  assert.equal(duplicateGuardEnabled({}), false)
  assert.equal(duplicateGuardEnabled({ DUPLICATE_GUARD: 'true' }), true)
})

test('normName drops entity suffixes, numbering, punctuation and case', () => {
  assert.equal(normName('Client A Painting 2 LLC'), 'client a painting')
  assert.equal(normName('client-a painting, inc.'), 'client a painting')
  assert.equal(normName('Smith & Sons Co'), 'smith sons')
})

test('matches on phone (E.164), email and normalized name; strongest first', () => {
  const byPhone = likelyMatches({ name: 'Totally New Name', phones: ['555.555.0100'] }, pool)
  assert.deepEqual(byPhone.map((m) => [m.entry.id, m.on]), [['e1', ['phone']], ['b1', ['phone']]])
  const all = likelyMatches({ name: 'Client A Painting', email: 'OWNER@client-a.example', phones: ['5555550100'] }, pool)
  assert.deepEqual(all[0].on, ['phone', 'email', 'name'])
  assert.deepEqual(likelyMatches({ name: 'Other Lawn Care LLC' }, pool).map((m) => m.entry.id), ['e2'])
  assert.deepEqual(likelyMatches({ name: 'Brand New Roofing', email: 'x@y.example', phones: ['+15555550111'] }, pool), [])
  // A very short name alone is not a match.
  assert.deepEqual(likelyMatches({ name: 'AB' }, [{ ...pool[2], name: 'AB LLC' }]), [])
})

test('a signup does not match itself', () => {
  const m = likelyMatches({ name: 'Client A Painting', phones: ['+15555550100'] }, pool, { businessId: 'b1' })
  assert.deepEqual(m.map((x) => x.entry.id), [])
})

test('card and warning copy', () => {
  const [m] = likelyMatches({ name: 'Client A Painting', phones: ['+15555550100'] }, pool)
  assert.equal(linkCardTitle(m.entry.name), 'Link to existing Client A Painting 2 LLC?')
  assert.equal(
    linkCardExpected('Client A Painting', m),
    'Client A Painting looks like Client A Painting 2 LLC, already on the board (same phone, name). Push: treat it as the same client, nothing new is created. Reject: it is a different client; tell the chief to create it anyway.'
  )
  assert.equal(
    telnyxClashWarning('+15555550150', 'Other Lawn Care'),
    'Warning: +15555550150 is already the texting number on another platform account (Other Lawn Care). One number cannot serve two accounts; this change will fail unless that account gives it up first.'
  )
})

test('flag off: every hook is gated', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  assert.match(src('./sync.ts'), /if \(duplicateGuardEnabled\(\)\) \{\n\s+const held = await holdSignupIfDuplicate/)
  assert.match(src('./hq/approvals.ts'), /\.\.\.\(duplicateGuardEnabled\(\) \? \[LINK_CARD_KIND\] : \[\]\)/)
  assert.match(src('./hq/admin-change.ts'), /duplicateGuardEnabled\(\) && field === 'telnyxPhoneNumber'/)
  assert.match(src('./hq/chief.ts'), /if \(duplicateGuardEnabled\(\) && input\.notDuplicate !== true\)/)
})
