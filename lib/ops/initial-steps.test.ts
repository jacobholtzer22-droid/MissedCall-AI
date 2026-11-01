import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INITIAL_STEP, STEP_CATALOG, initialStepData, initialStepFor, stepFor } from './steps'
import { DELIVERABLE_TYPES } from './types'
import { newDeliverableUpsert } from './sync'

const NOW = new Date('2026-11-01T15:00:00Z')

test('the mapping: every type, every key in the catalog, waitingOn from the owner', () => {
  assert.deepEqual(
    Object.fromEntries(DELIVERABLE_TYPES.map((t) => [t, initialStepFor(t)?.key ?? null])),
    { website: 'brief', domain: 'owner_unknown', email: 'workspace', missedcall: 'number', ads: 'account', gbp: 'manager_access' }
  )
  for (const t of DELIVERABLE_TYPES) {
    assert.ok(stepFor(t, INITIAL_STEP[t]), `${t}: ${INITIAL_STEP[t]} is not in STEP_CATALOG`)
    assert.equal(initialStepFor(t)?.terminal, false)
  }
  assert.deepEqual(initialStepData('website', {}, NOW), { step: 'brief', waitingOn: 'client', stepUpdatedAt: NOW })
  assert.deepEqual(initialStepData('domain', {}, NOW), { step: 'owner_unknown', waitingOn: 'client', stepUpdatedAt: NOW })
  assert.deepEqual(initialStepData('gbp', {}, NOW), { step: 'manager_access', waitingOn: 'client', stepUpdatedAt: NOW })
  assert.deepEqual(initialStepData('ads', {}, NOW), { step: 'account', waitingOn: 'jacob', stepUpdatedAt: NOW })
  assert.deepEqual(initialStepData('missedcall', {}, NOW), { step: 'number', waitingOn: 'jacob', stepUpdatedAt: NOW })
  assert.deepEqual(initialStepData('email', {}, NOW), { step: 'workspace', waitingOn: 'jacob', stepUpdatedAt: NOW })
})

test('evidence that shows the first step done leaves the step unset; unknown types get nothing', () => {
  assert.equal(initialStepFor('ads', { adsCustomerId: '1234567890' }), null)
  assert.equal(initialStepFor('missedcall', { telnyxNumber: '+15555550100' }), null)
  assert.deepEqual(initialStepData('ads', { adsCustomerId: '1234567890' }, NOW), {})
  assert.equal(initialStepFor('ads', { adsCustomerId: '' })?.key, 'account')
  assert.equal(initialStepFor('seo'), null)
  // Every catalog type has a first step to fall back to.
  for (const t of DELIVERABLE_TYPES) assert.ok(STEP_CATALOG[t][0])
})

test('create only: a new row gets the step, an existing row is never changed', () => {
  const args = newDeliverableUpsert('eng1', 'website', {}, NOW)
  assert.deepEqual(args.update, {})
  assert.deepEqual(args.where, { engagementId_type: { engagementId: 'eng1', type: 'website' } })
  assert.deepEqual(args.create, { engagementId: 'eng1', type: 'website', evidence: {}, step: 'brief', waitingOn: 'client', stepUpdatedAt: NOW })
  // The sync-owned evidence goes in exactly as before.
  const ads = newDeliverableUpsert('eng1', 'ads', { adsCustomerId: '1234567890' }, NOW)
  assert.deepEqual(ads.create, { engagementId: 'eng1', type: 'ads', evidence: { adsCustomerId: '1234567890' } })
  assert.deepEqual(ads.update, {})
})
