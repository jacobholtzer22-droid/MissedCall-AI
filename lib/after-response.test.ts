import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterResponse } from './after-response'

function captureErrors() {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  return { lines, restore: () => { console.error = original } }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('afterResponse returns before the task finishes', async () => {
  let done = false
  const started = Date.now()
  afterResponse('test', 'slow', async () => { await tick(50); done = true })
  assert.ok(Date.now() - started < 20)
  assert.equal(done, false)
  await tick(80)
  assert.equal(done, true)
})

test('afterResponse logs a rejection with route and task label', async () => {
  const cap = captureErrors()
  try {
    afterResponse('demo-book', 'confirmation-email', async () => { throw new Error('Resend status=500') })
    await tick(10)
  } finally { cap.restore() }
  assert.ok(cap.lines.some((l) => l.includes('[demo-book] after-response FAILED task=confirmation-email') && l.includes('Resend status=500')))
})

test('afterResponse logs a timeout instead of hanging', async () => {
  const cap = captureErrors()
  try {
    afterResponse('demo-lead/wizard', 'lead-sms', () => new Promise(() => {}), 30)
    await tick(60)
  } finally { cap.restore() }
  assert.ok(cap.lines.some((l) => l.includes('task=lead-sms') && l.includes('timed out after 30ms')))
})

test('owner alert that cannot text is logged as OWNER ALERT NOT DELIVERED', async () => {
  const saved = { t: process.env.TELNYX_API_KEY, r: process.env.RESEND_API_KEY, m: process.env.MARKETING_TELNYX_NUMBER }
  delete process.env.TELNYX_API_KEY
  delete process.env.RESEND_API_KEY
  delete process.env.MARKETING_TELNYX_NUMBER
  const { notifyOwnerOrShout } = await import('./marketing-funnel')
  const cap = captureErrors()
  try {
    await notifyOwnerOrShout('demo-book', 'appointmentId=test', { subject: 's', html: 'h', smsText: 'Booked: x' })
  } finally {
    cap.restore()
    if (saved.t !== undefined) process.env.TELNYX_API_KEY = saved.t
    if (saved.r !== undefined) process.env.RESEND_API_KEY = saved.r
    if (saved.m !== undefined) process.env.MARKETING_TELNYX_NUMBER = saved.m
  }
  assert.ok(cap.lines.some((l) => l.includes('[demo-book] OWNER ALERT NOT DELIVERED channel=sms') && l.includes('reason=no_sender') && l.includes('appointmentId=test')))
})
