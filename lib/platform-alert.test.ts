import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STORM_EMAIL_CAP,
  STORM_DEDUPE_KEY,
  THROTTLE_HOURS_CONFIG,
  THROTTLE_HOURS_DEFAULT,
  _resetMemoryThrottle,
  alertEmailSubject,
  buildAlertStormAlert,
  buildBookDemoFailedAlert,
  buildCalendarDisconnectedAlert,
  buildCalendarRefreshErrorAlert,
  buildCalendarSyncFailedAlert,
  buildSmsSendFailedAlert,
  buildTestAlert,
  buildVoiceWebhookErrorAlert,
  decideOwnerNotifyAlert,
  isDefinitiveAuthFailure,
  last4,
  newOwnerNotifyOutcome,
  normalizeForDedupe,
  processPlatformAlert,
  sanitizeAlert,
  scrubMetadata,
  scrubText,
  type PlatformAlertDeps,
  type PlatformAlertInput,
} from './platform-alert'

// Nothing in this file touches the database or sends an email. Everything that
// would is injected through PlatformAlertDeps and replaced with the fake below.
// raisePlatformAlert() itself is deliberately NOT called here: it is wired to
// the live database and the live email path.

type Row = {
  id: string
  type: string
  severity: string
  businessId: string | null
  title: string
  detail: string
  metadata: Record<string, unknown>
  dedupeKey: string
  createdAt: Date
  emailedAt: Date | null
}

function fakeDeps(start = '2026-09-19T12:00:00.000Z') {
  const rows: Row[] = []
  const emails: { subject: string; html: string }[] = []
  let clock = new Date(start).getTime()
  let emailWorks = true
  const deps: PlatformAlertDeps = {
    now: () => new Date(clock),
    wasEmailedSince: async (key, since) => rows.some((r) => r.dedupeKey === key && r.emailedAt !== null && r.emailedAt >= since),
    countEmailedSince: async (since) => rows.filter((r) => r.type !== 'alert_storm' && r.emailedAt !== null && r.emailedAt >= since).length,
    countStormSuppressedSince: async (since) =>
      rows.filter((r) => r.createdAt >= since && r.emailedAt === null && r.metadata.emailSkipped === 'storm').length,
    createAlert: async (row) => {
      const id = `alert_${rows.length + 1}`
      rows.push({ ...row, id, createdAt: new Date(clock), emailedAt: null })
      return { id }
    },
    markEmailed: async (id, at) => {
      const r = rows.find((x) => x.id === id)
      if (r) r.emailedAt = at
    },
    sendEmail: async (subject, html) => {
      if (!emailWorks) return false
      emails.push({ subject, html })
      return true
    },
  }
  return {
    deps,
    rows,
    emails,
    advanceHours: (h: number) => { clock += h * 3_600_000 },
    advanceMinutes: (m: number) => { clock += m * 60_000 },
    breakEmail: () => { emailWorks = false },
  }
}

function silence() {
  const original = { error: console.error, log: console.log }
  const lines: string[] = []
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')) }
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')) }
  return { lines, restore: () => { console.error = original.error; console.log = original.log } }
}

const BIZ = { id: 'biz_1', name: 'Smith Landscaping' }
const sample = (over: Partial<PlatformAlertInput> = {}): PlatformAlertInput => ({
  type: 'sms_send_failed',
  severity: 'critical',
  businessId: 'biz_1',
  title: 'T',
  detail: 'D',
  dedupeKey: 'k1',
  ...over,
})

// ── Scrubbing ────────────────────────────────────────────────────────────

test('scrubText masks phone numbers in every common shape to the last 4 digits', () => {
  assert.equal(scrubText('to +15551234567 failed'), 'to ***4567 failed')
  assert.equal(scrubText('call (555) 123-4567 now'), 'call ***4567 now')
  assert.equal(scrubText('555.123.4567'), '***4567')
  assert.equal(scrubText('1-555-123-4567'), '***4567')
  assert.equal(scrubText('5551234567'), '***4567')
})

test('scrubText leaves dates, times, cuids and short numbers alone', () => {
  const s = 'at 2026-09-19 17:08:22 business cmmca3uc20003jl04biparw8c status 503 after 25s'
  assert.equal(scrubText(s), s)
})

test('scrubText removes bearer tokens and key-shaped strings, keeps ordinary hyphenated words', () => {
  assert.equal(scrubText('Authorization: Bearer abc.DEF-123_xyz'), 'Authorization: Bearer [redacted]')
  assert.equal(scrubText('key re_AbCdEfGh12345678 rejected'), 'key [redacted-key] rejected')
  assert.equal(scrubText('KEY0123456789ABCDEF0123 bad'), '[redacted-key] bad')
  // Built at runtime so no key-shaped literal lives in the repo.
  assert.equal(scrubText(['sk', 'ant', 'x'.repeat(24)].join('-')), '[redacted-key]')
  assert.equal(scrubText('re-authentication-required by Google'), 're-authentication-required by Google')
})

test('scrubMetadata drops body and credential keys, scrubs the strings it keeps', () => {
  const out = scrubMetadata({
    conversationId: 'c1',
    to: '+15551234567',
    text: 'the whole customer message',
    message: 'another body',
    accessToken: 'ya29.secret',
    nested: { refresh_token: 'x', note: 'call 555-123-4567', transcript: 'long transcript' },
    list: ['+15559876543'],
  }) as Record<string, any>
  assert.deepEqual(out, { conversationId: 'c1', to: '***4567', nested: { note: 'call ***4567' }, list: ['***6543'] })
})

test('last4 never returns more than four digits', () => {
  assert.equal(last4('+1 (555) 123-4567'), '4567')
  assert.equal(last4(''), null)
  assert.equal(last4(null), null)
})

test('sanitizeAlert scrubs the dedupeKey too, and defaults the throttle window', () => {
  const a = sanitizeAlert(sample({ dedupeKey: 'sms_send_failed:biz_1:+15551234567', title: 'to +15551234567', throttleHours: undefined }))
  assert.equal(a.dedupeKey, 'sms_send_failed:biz_1:***4567')
  assert.equal(a.title, 'to ***4567')
  assert.equal(a.throttleHours, THROTTLE_HOURS_DEFAULT)
  assert.equal(sanitizeAlert(sample({ throttleHours: -3 })).throttleHours, THROTTLE_HOURS_DEFAULT)
})

test('normalizeForDedupe: a per-call id or a timestamp does not defeat the throttle', () => {
  const a = normalizeForDedupe('Call v3:T9aXk2LmQp0ZrYw81bNcD4eF not found at 1726761600123')
  const b = normalizeForDedupe('Call v3:Zz81KkLp00aQwErTy77uIoP9sD not found at 1726769999999')
  assert.equal(a, b)
  assert.ok(a.length <= 40)
  assert.ok(!/\d/.test(a))
})

// ── Builders: type, severity, dedupeKey, scrubbing ───────────────────────

test('sms_send_failed: keyed per business and path, never per phone; phone reduced to last 4', () => {
  const err = new Error('Invalid destination +15551234567')
  const a = buildSmsSendFailedAlert({ business: BIZ, path: 'missed_call', error: err, toPhone: '+15551234567', conversationId: 'c1' })
  assert.equal(a.type, 'sms_send_failed')
  assert.equal(a.severity, 'critical')
  assert.equal(a.dedupeKey, 'sms_send_failed:biz_1:missed_call')
  assert.equal(a.throttleHours, THROTTLE_HOURS_DEFAULT)
  assert.equal(a.metadata?.toLast4, '4567')
  assert.ok(!JSON.stringify(a).includes('5551234567'))
  const reply = buildSmsSendFailedAlert({ business: BIZ, path: 'ai_reply', error: err })
  assert.equal(reply.dedupeKey, 'sms_send_failed:biz_1:ai_reply')
})

test('voice_webhook_error: no business, key built from the normalized message', () => {
  const one = buildVoiceWebhookErrorAlert({ error: new TypeError('Cannot read properties of undefined (reading call_control_id) v3:AbCdEfGhIjKlMnOpQrStUv 12345') })
  const two = buildVoiceWebhookErrorAlert({ error: new TypeError('Cannot read properties of undefined (reading call_control_id) v3:ZyXwVuTsRqPoNmLkJiHgFe 99999') })
  assert.equal(one.type, 'voice_webhook_error')
  assert.equal(one.severity, 'critical')
  assert.equal(one.businessId, null)
  assert.ok(one.dedupeKey.startsWith('voice_webhook_error:TypeError:'))
  assert.equal(one.dedupeKey, two.dedupeKey)
  const str = buildVoiceWebhookErrorAlert({ error: 'plain string thrown' })
  assert.equal(str.dedupeKey, 'voice_webhook_error:Error:plain string thrown')
})

test('book_demo_failed: one key per stage', () => {
  for (const stage of ['email', 'persist', 'both'] as const) {
    const a = buildBookDemoFailedAlert({ stage, error: new Error('Resend status=500') })
    assert.equal(a.type, 'book_demo_failed')
    assert.equal(a.severity, 'critical')
    assert.equal(a.dedupeKey, `book_demo_failed:${stage}`)
  }
  assert.match(buildBookDemoFailedAlert({ stage: 'both', error: 'x' }).title, /lost/)
})

test('calendar alerts: disconnect is critical and daily, a transient refresh error is a warning', () => {
  const d = buildCalendarDisconnectedAlert({ businessId: 'biz_1', error: new Error('invalid_grant') })
  assert.deepEqual([d.type, d.severity, d.dedupeKey, d.throttleHours], ['calendar_disconnected', 'critical', 'calendar_disconnected:biz_1', THROTTLE_HOURS_CONFIG])
  const r = buildCalendarRefreshErrorAlert({ businessId: 'biz_1', error: new Error('ECONNRESET') })
  assert.deepEqual([r.type, r.severity, r.dedupeKey, r.throttleHours], ['calendar_refresh_error', 'warning', 'calendar_refresh_error:biz_1', THROTTLE_HOURS_DEFAULT])
  const s = buildCalendarSyncFailedAlert({ business: BIZ, appointmentId: 'appt_9', error: new Error('403') })
  assert.deepEqual([s.type, s.severity, s.dedupeKey], ['calendar_sync_failed', 'warning', 'calendar_sync_failed:biz_1'])
  assert.equal(s.metadata?.appointmentId, 'appt_9')
})

test('alert_storm and test builders', () => {
  const s = buildAlertStormAlert({ suppressedCount: 7 })
  assert.deepEqual([s.type, s.dedupeKey, s.throttleHours], ['alert_storm', STORM_DEDUPE_KEY, 1])
  assert.match(s.title, /7 alert emails held back/)
  assert.notEqual(buildTestAlert({ nonce: 'a' }).dedupeKey, buildTestAlert({ nonce: 'b' }).dedupeKey)
})

test('email subject format is filterable', () => {
  assert.equal(alertEmailSubject({ severity: 'critical', title: 'Voice webhook handler threw' }), '[PLATFORM ALERT] critical: Voice webhook handler threw')
})

// ── Owner notify outcome decision ────────────────────────────────────────

test('owner notify: both channels switched off by setting is NOT an alert', () => {
  assert.equal(decideOwnerNotifyAlert({ business: BIZ, notifier: 'website_lead', outcome: newOwnerNotifyOutcome() }), null)
})

test('owner notify: everything enabled was delivered is NOT an alert', () => {
  const outcome = { sms: { enabled: true, delivered: true }, email: { enabled: true, delivered: true } }
  assert.equal(decideOwnerNotifyAlert({ business: BIZ, notifier: 'website_lead', outcome }), null)
  const emailOnly = { sms: { enabled: false, delivered: false }, email: { enabled: true, delivered: true } }
  assert.equal(decideOwnerNotifyAlert({ business: BIZ, notifier: 'website_lead', outcome: emailOnly }), null)
})

test('owner notify: nothing delivered with a channel enabled is critical; config reasons throttle 24h', () => {
  const outcome = {
    sms: { enabled: true, delivered: false, reason: 'no_recipient' as const },
    email: { enabled: true, delivered: false, reason: 'no_owner_email' as const },
  }
  const a = decideOwnerNotifyAlert({ business: BIZ, notifier: 'lead_captured', outcome })!
  assert.equal(a.type, 'owner_notify_none_delivered')
  assert.equal(a.severity, 'critical')
  assert.equal(a.dedupeKey, 'owner_notify_none:biz_1:config')
  assert.equal(a.throttleHours, THROTTLE_HOURS_CONFIG)
})

test('owner notify: nothing delivered because a send failed throttles 6h under its own key', () => {
  const outcome = {
    sms: { enabled: true, delivered: false, reason: 'no_sender' as const },
    email: { enabled: true, delivered: false, reason: 'send_error' as const, error: 'Resend error: 500 to owner@example.com' },
  }
  const a = decideOwnerNotifyAlert({ business: BIZ, notifier: 'booking_created', outcome })!
  assert.equal(a.type, 'owner_notify_none_delivered')
  assert.equal(a.dedupeKey, 'owner_notify_none:biz_1:send')
  assert.equal(a.throttleHours, THROTTLE_HOURS_DEFAULT)
})

test('owner notify: a single enabled channel that fails is "none delivered", not a warning', () => {
  const outcome = { sms: { enabled: false, delivered: false }, email: { enabled: true, delivered: false, reason: 'send_error' as const } }
  assert.equal(decideOwnerNotifyAlert({ business: BIZ, notifier: 'voicemail', outcome })!.type, 'owner_notify_none_delivered')
})

test('owner notify: one delivered, one failed is a warning keyed on channel and reason', () => {
  const missing = { sms: { enabled: true, delivered: false, reason: 'no_recipient' as const }, email: { enabled: true, delivered: true } }
  const a = decideOwnerNotifyAlert({ business: BIZ, notifier: 'website_lead', outcome: missing })!
  assert.deepEqual([a.type, a.severity, a.dedupeKey, a.throttleHours], ['owner_notify_failed', 'warning', 'owner_notify:biz_1:sms:no_recipient', THROTTLE_HOURS_CONFIG])

  const sendErr = { sms: { enabled: true, delivered: true }, email: { enabled: true, delivered: false, reason: 'send_error' as const } }
  const b = decideOwnerNotifyAlert({ business: BIZ, notifier: 'website_lead', outcome: sendErr })!
  assert.deepEqual([b.type, b.dedupeKey, b.throttleHours], ['owner_notify_failed', 'owner_notify:biz_1:email:send_error', THROTTLE_HOURS_DEFAULT])
})

// ── isDefinitiveAuthFailure against the real GaxiosError shapes ──────────

test('auth failure: the standard invalid_grant GaxiosError shape disconnects', () => {
  const e = Object.assign(new Error('invalid_grant'), {
    status: 400,
    response: { status: 400, data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
  })
  assert.equal(isDefinitiveAuthFailure(e), true)
})

test('auth failure: the ReAuth shape, where the library rewrites message to JSON, still disconnects', () => {
  const data = { error: 'invalid_grant', error_description: 'reauth related error (invalid_rapt)' }
  const withResponse = Object.assign(new Error(JSON.stringify(data)), { response: { status: 400, data } })
  assert.equal(isDefinitiveAuthFailure(withResponse), true)
  // Same message with the response stripped (e.g. after being re-thrown through a wrapper).
  assert.equal(isDefinitiveAuthFailure(new Error(JSON.stringify(data))), true)
  assert.equal(isDefinitiveAuthFailure(new Error('invalid_grant')), true)
})

test('auth failure: network errors, timeouts, 5xx and 429 do NOT disconnect', () => {
  const network = Object.assign(new Error('request to https://oauth2.googleapis.com/token failed, reason: read ECONNRESET'), { code: 'ECONNRESET' })
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { code: 'TimeoutError' })
  const fiveHundred = Object.assign(new Error('Internal Server Error'), { status: 503, response: { status: 503, data: { error: 'internal_failure' } } })
  const htmlBody = Object.assign(new Error('Bad Gateway'), { status: 502, response: { status: 502, data: '<html>502</html>' } })
  const rateLimited = Object.assign(new Error('rate_limit_exceeded'), { status: 429, response: { status: 429, data: { error: 'rate_limit_exceeded' } } })
  for (const e of [network, timeout, fiveHundred, htmlBody, rateLimited]) assert.equal(isDefinitiveAuthFailure(e), false)
})

test('auth failure: a platform credential problem does NOT disconnect a client, nor does junk input', () => {
  const invalidClient = Object.assign(new Error('invalid_client'), { response: { status: 401, data: { error: 'invalid_client' } } })
  const unauthorized = Object.assign(new Error('unauthorized_client'), { response: { status: 401, data: { error: 'unauthorized_client' } } })
  assert.equal(isDefinitiveAuthFailure(invalidClient), false)
  assert.equal(isDefinitiveAuthFailure(unauthorized), false)
  assert.equal(isDefinitiveAuthFailure(new Error('No refresh token is set.')), false)
  for (const junk of [null, undefined, 'invalid_grant', 42, {}, new Error('{not json')]) assert.equal(isDefinitiveAuthFailure(junk), false)
})

// ── Throttle ─────────────────────────────────────────────────────────────

test('throttle: first alert writes a row and emails; a repeat inside the window writes a row and does not email', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    const first = await processPlatformAlert(sample(), f.deps)
    f.advanceHours(5)
    const second = await processPlatformAlert(sample(), f.deps)
    assert.deepEqual([first.emailed, first.skipped], [true, null])
    assert.deepEqual([second.emailed, second.skipped], [false, 'throttled'])
  } finally { s.restore() }
  assert.equal(f.rows.length, 2)
  assert.equal(f.emails.length, 1)
  assert.ok(f.rows[0].emailedAt instanceof Date)
  assert.equal(f.rows[1].emailedAt, null)
  assert.equal(f.rows[1].metadata.emailSkipped, 'throttled')
  assert.equal(f.emails[0].subject, '[PLATFORM ALERT] critical: T')
})

test('throttle: the same key emails again once its window has passed', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    await processPlatformAlert(sample(), f.deps)
    f.advanceHours(6.01)
    const again = await processPlatformAlert(sample(), f.deps)
    assert.equal(again.emailed, true)
  } finally { s.restore() }
  assert.equal(f.emails.length, 2)
})

test('throttle: the window belongs to the alert. 24h for config reasons, 6h for send errors', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    await processPlatformAlert(sample({ dedupeKey: 'cfg', throttleHours: THROTTLE_HOURS_CONFIG }), f.deps)
    f.advanceHours(12)
    const halfDay = await processPlatformAlert(sample({ dedupeKey: 'cfg', throttleHours: THROTTLE_HOURS_CONFIG }), f.deps)
    f.advanceHours(12.1)
    const nextDay = await processPlatformAlert(sample({ dedupeKey: 'cfg', throttleHours: THROTTLE_HOURS_CONFIG }), f.deps)
    assert.equal(halfDay.skipped, 'throttled')
    assert.equal(nextDay.emailed, true)
  } finally { s.restore() }
})

test('throttle: a different key is not throttled, and a failed email does not start a window', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    await processPlatformAlert(sample({ dedupeKey: 'a' }), f.deps)
    const other = await processPlatformAlert(sample({ dedupeKey: 'b' }), f.deps)
    assert.equal(other.emailed, true)

    f.breakEmail()
    const failed = await processPlatformAlert(sample({ dedupeKey: 'c' }), f.deps)
    assert.deepEqual([failed.emailed, failed.skipped], [false, 'send_failed'])
    assert.equal(f.rows.at(-1)!.emailedAt, null)
  } finally { s.restore() }
})

// ── Storm cap ────────────────────────────────────────────────────────────

test('storm cap: the 11th email in an hour is held back and ONE storm notice goes out', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    for (let i = 0; i < STORM_EMAIL_CAP; i++) await processPlatformAlert(sample({ dedupeKey: `k${i}` }), f.deps)
    assert.equal(f.emails.length, STORM_EMAIL_CAP)

    const eleventh = await processPlatformAlert(sample({ dedupeKey: 'k-11' }), f.deps)
    assert.deepEqual([eleventh.emailed, eleventh.skipped, eleventh.stormNoticeSent], [false, 'storm', true])

    const twelfth = await processPlatformAlert(sample({ dedupeKey: 'k-12' }), f.deps)
    assert.deepEqual([twelfth.skipped, twelfth.stormNoticeSent], ['storm', false])
  } finally { s.restore() }

  const storms = f.rows.filter((r) => r.type === 'alert_storm')
  assert.equal(storms.length, 1)
  assert.equal(storms[0].metadata.suppressedCount, 1)
  assert.equal(f.emails.length, STORM_EMAIL_CAP + 1)
  assert.match(f.emails.at(-1)!.subject, /^\[PLATFORM ALERT\] critical: Alert storm: 1 alert email held back$/)
  // Both held-back alerts are still on record.
  assert.equal(f.rows.filter((r) => r.metadata.emailSkipped === 'storm').length, 2)
})

test('storm cap: repeat waves inside the hour share one notice, and the cap lifts when the hour clears', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    for (let i = 0; i < STORM_EMAIL_CAP; i++) await processPlatformAlert(sample({ dedupeKey: `k${i}` }), f.deps)
    await processPlatformAlert(sample({ dedupeKey: 'held-1' }), f.deps)
    f.advanceMinutes(30)
    for (let i = 0; i < STORM_EMAIL_CAP; i++) await processPlatformAlert(sample({ dedupeKey: `wave2-${i}` }), f.deps)
    f.advanceMinutes(31) // first wave and first notice are now >60 min old; wave 2 is 31 min old
    const later = await processPlatformAlert(sample({ dedupeKey: 'held-late' }), f.deps)
    assert.equal(later.emailed, true, 'only wave 1 sent emails, and it has aged out of the hour')

    f.advanceMinutes(120)
    const calm = await processPlatformAlert(sample({ dedupeKey: 'calm' }), f.deps)
    assert.equal(calm.emailed, true)
  } finally { s.restore() }
  // Wave 2 was entirely held back, under a single notice.
  assert.equal(f.rows.filter((r) => r.dedupeKey.startsWith('wave2-') && r.emailedAt === null).length, STORM_EMAIL_CAP)
  assert.equal(f.rows.filter((r) => r.type === 'alert_storm').length, 1)
})

// ── Never throws ─────────────────────────────────────────────────────────

test('never throws: every dependency rejecting still resolves, and says so in the log', async () => {
  _resetMemoryThrottle()
  const boom = async () => { throw new Error('database is down +15551234567') }
  const deps: PlatformAlertDeps = {
    now: () => new Date('2026-09-19T12:00:00Z'),
    wasEmailedSince: boom, countEmailedSince: boom, countStormSuppressedSince: boom,
    createAlert: boom, markEmailed: boom, sendEmail: boom as unknown as PlatformAlertDeps['sendEmail'],
  }
  const s = silence()
  let result
  try { result = await processPlatformAlert(sample(), deps) } finally { s.restore() }
  assert.deepEqual(result, { alertId: null, emailed: false, skipped: 'send_failed', stormNoticeSent: false })
  assert.ok(s.lines.some((l) => l.includes('ROW NOT WRITTEN')))
  assert.ok(s.lines.every((l) => !l.includes('5551234567')), 'even the failure logs are scrubbed')
})

test('never throws: with the database down the email still goes out, once per key per window per instance', async () => {
  _resetMemoryThrottle()
  const emails: string[] = []
  const down = async () => { throw new Error('db down') }
  const deps: PlatformAlertDeps = {
    now: () => new Date('2026-09-19T12:00:00Z'),
    wasEmailedSince: down, countEmailedSince: down, countStormSuppressedSince: down, createAlert: down, markEmailed: down,
    sendEmail: async (subject) => { emails.push(subject); return true },
  }
  const s = silence()
  try {
    const first = await processPlatformAlert(sample({ dedupeKey: 'db-down' }), deps)
    const second = await processPlatformAlert(sample({ dedupeKey: 'db-down' }), deps)
    assert.equal(first.emailed, true)
    assert.equal(second.skipped, 'throttled')
  } finally { s.restore() }
  assert.equal(emails.length, 1)
})

test('never throws: garbage input and a throwing clock resolve instead of rejecting', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    await assert.doesNotReject(processPlatformAlert(null as unknown as PlatformAlertInput, f.deps))
    await assert.doesNotReject(processPlatformAlert({} as PlatformAlertInput, f.deps))
    await assert.doesNotReject(processPlatformAlert(sample(), { ...f.deps, now: () => { throw new Error('no clock') } }))
    const circular: Record<string, unknown> = {}; circular.self = circular
    await assert.doesNotReject(processPlatformAlert(sample({ metadata: circular }), f.deps))
  } finally { s.restore() }
})

test('what is stored and emailed is scrubbed even when a caller passes raw values', async () => {
  const f = fakeDeps(); const s = silence()
  try {
    await processPlatformAlert(sample({
      title: 'Failed for +15551234567',
      detail: 'Telnyx said: number (555) 123-4567 unreachable. Bearer abc.def.ghi',
      metadata: { to: '+15551234567', text: 'customer message body', token: 'secret' },
      dedupeKey: 'x:+15551234567',
    }), f.deps)
  } finally { s.restore() }
  const stored = JSON.stringify(f.rows[0]) + JSON.stringify(f.emails[0])
  assert.ok(!stored.includes('5551234567') && !stored.includes('123-4567'))
  assert.ok(!stored.includes('customer message body') && !stored.includes('secret') && !stored.includes('abc.def.ghi'))
  assert.equal(f.rows[0].dedupeKey, 'x:***4567')
})
