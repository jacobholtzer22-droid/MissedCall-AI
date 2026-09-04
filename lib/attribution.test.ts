import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyReferrer,
  buildTouch,
  touchHasSignal,
  mergeTouch,
  buildFbc,
  describeTouch,
  describeJourney,
  withSmsUtms,
  sanitizePair,
  REFERRER_FACEBOOK,
  REFERRER_INSTAGRAM,
  REFERRER_GOOGLE,
  REFERRER_DIRECT,
} from './attribution'

// ── classifyReferrer ────────────────────────────────────────────────────────

test('every Facebook host in the spec maps to facebook_referral', () => {
  for (const host of [
    'https://facebook.com/', 'https://l.facebook.com/', 'https://lm.facebook.com/',
    'https://m.facebook.com/', 'https://www.facebook.com/', 'https://fb.com/',
  ]) {
    assert.equal(classifyReferrer(host), REFERRER_FACEBOOK, host)
  }
})

test('Instagram hosts map to instagram_referral', () => {
  assert.equal(classifyReferrer('https://instagram.com/'), REFERRER_INSTAGRAM)
  assert.equal(classifyReferrer('https://l.instagram.com/'), REFERRER_INSTAGRAM)
})

test('google.* maps to google_organic across country domains', () => {
  assert.equal(classifyReferrer('https://www.google.com/'), REFERRER_GOOGLE)
  assert.equal(classifyReferrer('https://google.de/'), REFERRER_GOOGLE)
  assert.equal(classifyReferrer('https://www.google.co.uk/search?q=x'), REFERRER_GOOGLE)
})

test('empty and unparseable referrers are direct', () => {
  assert.equal(classifyReferrer(''), REFERRER_DIRECT)
  assert.equal(classifyReferrer(null), REFERRER_DIRECT)
  assert.equal(classifyReferrer('not a url'), REFERRER_DIRECT)
})

test('anything else keeps its hostname', () => {
  assert.equal(classifyReferrer('https://news.ycombinator.com/item?id=1'), 'news.ycombinator.com')
})

test('a lookalike host is NOT credited as Facebook', () => {
  // A substring test would call both of these facebook_referral, which would let
  // anyone label their own traffic as our best channel.
  assert.equal(classifyReferrer('https://facebook.com.evil.example/'), 'facebook.com.evil.example')
  assert.equal(classifyReferrer('https://notfacebook.com/'), 'notfacebook.com')
})

// ── signal / first touch ────────────────────────────────────────────────────

test('a bare direct visit carries no signal', () => {
  assert.equal(touchHasSignal(buildTouch({ search: '', referrer: '' })), false)
})

test('fbclid alone is a signal, and so is a classified referrer alone', () => {
  assert.equal(touchHasSignal(buildTouch({ search: '?fbclid=abc', referrer: '' })), true)
  assert.equal(touchHasSignal(buildTouch({ search: '', referrer: 'https://l.facebook.com/' })), true)
})

test('our own texted link is never a first touch', () => {
  const fromSms = buildTouch({ search: '?utm_source=sms&utm_medium=funnel_return&utm_campaign=a', referrer: '' })
  assert.equal(touchHasSignal(fromSms), false)
  const pair = mergeTouch({}, fromSms)
  assert.equal(pair.first, undefined, 'the SMS must not claim to have found them')
  assert.equal(pair.last?.medium, 'funnel_return')
})

test('QA case: ad first, direct second — first touch survives', () => {
  const ad = buildTouch({ search: '?fbclid=test1&utm_term=adX', referrer: '', path: '/book' })
  const later = buildTouch({ search: '', referrer: '', path: '/book/a' })
  const pair = mergeTouch(mergeTouch({}, ad), later)
  assert.equal(pair.first?.fbclid, 'test1')
  assert.equal(pair.first?.term, 'adX')
  assert.equal(pair.last?.referrer, REFERRER_DIRECT)
  assert.equal(pair.last?.fbclid, undefined)
})

test('a direct first visit does not block a later real first touch', () => {
  const direct = buildTouch({ search: '', referrer: '' })
  const ad = buildTouch({ search: '?utm_source=facebook&utm_campaign=c1', referrer: '' })
  const pair = mergeTouch(mergeTouch({}, direct), ad)
  assert.equal(pair.first?.campaign, 'c1')
})

// ── _fbc ────────────────────────────────────────────────────────────────────

test('buildFbc follows Meta format and refuses an empty fbclid', () => {
  assert.equal(buildFbc('abc123', 1_700_000_000_000), 'fb.1.1700000000000.abc123')
  assert.equal(buildFbc(''), null)
  assert.equal(buildFbc(null), null)
})

// ── readout ─────────────────────────────────────────────────────────────────

test('describeTouch never returns an empty or "untagged" string', () => {
  assert.equal(describeTouch(null), 'no signal captured')
  assert.equal(describeTouch(buildTouch({ search: '', referrer: '' })), 'direct')
  assert.equal(describeTouch(buildTouch({ search: '', referrer: 'https://l.facebook.com/' })), 'Facebook')
  assert.equal(
    describeTouch(buildTouch({ search: '?utm_source=facebook&utm_medium=ad&utm_campaign=aa_v1', referrer: '' })),
    'facebook ad aa_v1'
  )
})

test('the journey sentence names first touch, return and booking surface', () => {
  const first = buildTouch({
    search: '?utm_source=Facebook&utm_medium=ad&utm_campaign=aa_founder_tirekicker_v1',
    referrer: '',
    now: new Date('2026-09-03T12:00:00Z'),
  })
  const last = buildTouch({ search: '', referrer: '', now: new Date('2026-09-04T12:00:00Z') })
  const sentence = describeJourney({ first, last }, 'landing')
  assert.match(sentence, /^First saw us via Facebook ad aa_founder_tirekicker_v1 on Sep 3/)
  assert.match(sentence, /returned direct on Sep 4/)
  assert.match(sentence, /booked from the landing calendar\.$/)
})

test('a lead with nothing captured says so instead of "untagged"', () => {
  assert.equal(describeJourney({}, null), 'No attribution captured for this lead.')
})

test('one visit does not report itself as a return', () => {
  const only = buildTouch({ search: '?utm_source=facebook', referrer: '', now: new Date('2026-09-03T12:00:00Z') })
  assert.doesNotMatch(describeJourney({ first: only, last: only }, null), /returned/)
})

// ── SMS tagging ─────────────────────────────────────────────────────────────

test('withSmsUtms tags a link and keeps its existing query', () => {
  const out = withSmsUtms('https://x.example/book/a/watch?t=abc', 'A')
  const u = new URL(out)
  assert.equal(u.searchParams.get('t'), 'abc')
  assert.equal(u.searchParams.get('utm_source'), 'sms')
  assert.equal(u.searchParams.get('utm_medium'), 'funnel_return')
  assert.equal(u.searchParams.get('utm_campaign'), 'a')
})

test('withSmsUtms leaves a non-URL untouched rather than throwing', () => {
  assert.equal(withSmsUtms('not a url', 'A'), 'not a url')
})

// ── untrusted input ─────────────────────────────────────────────────────────

test('a hand-edited cookie cannot inject fields or unbounded values', () => {
  const pair = sanitizePair({
    first: { source: 'x'.repeat(500), evil: 'drop table', ts: '2026-09-03T00:00:00.000Z' },
    last: 'not an object',
  })
  assert.equal(pair.first?.source?.length, 200)
  assert.equal((pair.first as Record<string, unknown>).evil, undefined)
  assert.equal(pair.last, undefined)
})
