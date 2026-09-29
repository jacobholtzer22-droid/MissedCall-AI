import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APIError } from 'telnyx/core/error'
import { isCallEndedError, TELNYX_CALL_ENDED_CODE } from './telnyx-errors'

// The exact body Telnyx returns when a command targets a leg that is already gone.
const CALL_ENDED_BODY = {
  errors: [
    {
      code: '90018',
      title: 'Call has already ended',
      detail: 'The call you are trying to control has already ended.',
    },
  ],
}

/** Built the way the SDK builds it, so these tests break if the SDK changes shape. */
const telnyxError = (status: number, body: unknown) => APIError.generate(status, body as object, undefined, new Headers())

test('the real SDK error for a 90018 is recognised', () => {
  const err = telnyxError(422, CALL_ENDED_BODY)
  // Guard the assumption the matcher rests on: the body lands on .error, not .errors.
  assert.equal(err.constructor.name, 'UnprocessableEntityError')
  assert.deepEqual((err as { error?: unknown }).error, CALL_ENDED_BODY)
  assert.equal(isCallEndedError(err), true)
})

test('a numeric code is recognised (Telnyx sends a string, but do not depend on it)', () => {
  assert.equal(isCallEndedError(telnyxError(422, { errors: [{ code: 90018 }] })), true)
})

test('a flat errors array is recognised', () => {
  assert.equal(isCallEndedError({ errors: [{ code: '90018' }] }), true)
})

test('a top-level code is recognised', () => {
  assert.equal(isCallEndedError({ code: '90018' }), true)
})

test('the message fallback catches a re-thrown error that lost its structure', () => {
  assert.equal(isCallEndedError(new Error('422 {"errors":[{"code":"90018"}]}')), true)
})

test('90018 among several errors is recognised', () => {
  assert.equal(isCallEndedError(telnyxError(422, { errors: [{ code: '10015' }, { code: '90018' }] })), true)
})

// ── Everything below MUST stay loud. These are the regressions that matter: a
// matcher that is too broad silently swallows real failures on the call path.

test('a different 422 is NOT a call-ended error', () => {
  assert.equal(isCallEndedError(telnyxError(422, { errors: [{ code: '90013', title: 'Invalid payload' }] })), false)
})

test('an auth failure is NOT a call-ended error', () => {
  assert.equal(isCallEndedError(telnyxError(401, { errors: [{ code: '10009', title: 'Authentication failed' }] })), false)
})

test('a 500 is NOT a call-ended error', () => {
  assert.equal(isCallEndedError(telnyxError(500, { errors: [{ code: '90001' }] })), false)
})

test('a plain Error is NOT a call-ended error', () => {
  assert.equal(isCallEndedError(new Error('connection reset')), false)
})

test('a code that merely contains 90018 as a substring is NOT matched structurally', () => {
  // String(c) === code, not includes: 190018 and 900187 are different errors.
  assert.equal(isCallEndedError({ errors: [{ code: '190018' }] }), false)
  assert.equal(isCallEndedError({ errors: [{ code: '900187' }] }), false)
})

test('non-objects are NOT call-ended errors', () => {
  for (const v of [null, undefined, '90018', 90018, true, Symbol('90018')]) {
    assert.equal(isCallEndedError(v), false, `expected false for ${String(v)}`)
  }
})

test('malformed shapes do not throw', () => {
  for (const v of [{}, { errors: null }, { errors: 'nope' }, { errors: [null, undefined, 1, 'x'] }, { error: {} }, { error: { errors: {} } }]) {
    assert.doesNotThrow(() => isCallEndedError(v))
    assert.equal(isCallEndedError(v), false)
  }
})

test('the exported code is the string Telnyx sends', () => {
  assert.equal(TELNYX_CALL_ENDED_CODE, '90018')
})
