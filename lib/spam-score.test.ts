// ===========================================
// SPAM SCORING TESTS
// ===========================================
// Run: npm test
//
// The LEGITIMATE cases matter more than the spam ones. A missed bot is an
// annoying email; a condemned real customer is a lost job for a client, and they
// never find out it happened. Every legitimate case below asserts an exact score,
// not just "below threshold", so a weight change that erodes headroom fails loudly
// instead of drifting.

import { test } from 'node:test'
import assert from 'node:assert/strict'

delete process.env.SPAM_SCORE_THRESHOLD

import {
  scoreSubmission,
  isGibberish,
  normalizeEmailForVelocity,
  DEFAULT_SPAM_THRESHOLD,
  SPAM_WEIGHTS,
  type SpamInput,
} from './spam-score'

const T = DEFAULT_SPAM_THRESHOLD // 100

// ---------------------------------------------------------------------------
// The four bots observed in client inboxes, verbatim.
// ---------------------------------------------------------------------------

const SAMPLE_1: SpamInput = {
  name: 'Bpfgutz Rnxacopji',
  phone: '2711934617',
  email: 'i.b.e.g.u.tu903@gmail.com',
  message: 'Property address: Aqvdnztd\n9969063456',
}

const SAMPLE_2: SpamInput = {
  name: 'rLOWoVPknxsiwrlyeuxk',
  phone: '2211534749',
  email: 'uw.u.cu.vu.pobu.z65@gmail.com',
  message: 'Lawn Care — dgxPowfhDnmEPpDUcSXWUfC',
}

const SAMPLE_3: SpamInput = {
  name: 'pDnYRKQXCVgpAKZl',
  phone: '5254356086',
  email: 'eruzun.a.l.oh.89.6@gmail.com',
  message: 'Service: Landscaping Design\n7129221395',
}

const SAMPLE_4: SpamInput = {
  name: 'Jennifer Obrien',
  phone: '9495909895',
  email: 'J.obr@getdandynow.com',
  message:
    "Landscaping — Hi Master Gardner, LLC / I've built and trained an AI employee " +
    'specifically for Master Gardner, LLC. / This isn’t a sales call. It’s a ' +
    '20-minute demo of what it can do. / On average, our agents help increase leads by 17%.',
}

test('sample 1 (gibberish + dotted gmail + bad exchange) is condemned', () => {
  const v = scoreSubmission(SAMPLE_1)
  assert.equal(v.score, 195)
  assert.equal(v.isSpam, true)
  assert.deepEqual(v.reasons.sort(), [
    'bare_digit_run',
    'email_name_mismatch',
    'gibberish_message',
    'gmail_dots_4plus',
    'phone_structural_invalid',
  ])
})

test('sample 2 (case-salad name, gibberish cap applies) is condemned', () => {
  const v = scoreSubmission(SAMPLE_2)
  assert.equal(v.score, 200)
  assert.equal(v.isSpam, true)
  // name 55 + message 35 = 90, capped to 80.
  assert.ok(v.detail.some((d) => d.includes('gibberish capped')))
})

test('sample 3 (structurally VALID phone, no area-code list yet) is condemned', () => {
  const v = scoreSubmission(SAMPLE_3)
  assert.equal(v.score, 175)
  assert.equal(v.isSpam, true)
  // 525 is unassigned but structurally legal — proves the phone signal is not
  // carrying this sample, and that the NANPA TODO is a pure gain when added.
  assert.ok(!v.reasons.includes('phone_structural_invalid'))
})

test('sample 4 (clean identity, pure B2B solicitation) is condemned by (f) alone', () => {
  const v = scoreSubmission(SAMPLE_4)
  assert.equal(v.score, SPAM_WEIGHTS.B2B_CAP) // 120
  assert.equal(v.isSpam, true)
  assert.deepEqual(v.reasons, ['b2b_strong'])
  // Detection floor: 3 strong phrases. Below that this bot ships.
  assert.ok(v.detail[0].includes('ai employee'))
})

// ---------------------------------------------------------------------------
// RESILIENCE: gmail dot-obfuscation is the cheapest thing for the operator to
// change, and three of four samples lean on it. All four must survive without it.
// ---------------------------------------------------------------------------

test('resilience: all four samples still condemned with signal (b) removed', () => {
  const strip = (s: SpamInput): SpamInput => ({ ...s, email: 'zqx99@outlook.com' })
  const scores = [SAMPLE_1, SAMPLE_2, SAMPLE_3, SAMPLE_4].map((s) => scoreSubmission(strip(s)))
  assert.deepEqual(scores.map((v) => v.score), [135, 140, 115, 120])
  for (const v of scores) assert.equal(v.isSpam, true)
  // Minimum margin over threshold must stay above 10.
  assert.ok(Math.min(...scores.map((v) => v.score)) - T >= 10)
})

// ---------------------------------------------------------------------------
// LEGITIMATE SUBMISSIONS — the set that matters.
// ---------------------------------------------------------------------------

test('legit: plain homeowner, one-word service request', () => {
  const v = scoreSubmission({
    name: 'Sarah Miller',
    phone: '(734) 555-2142',
    email: 'sarahmiller@gmail.com',
    message: 'Aeration',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('legit: full sentence quote request with address', () => {
  const v = scoreSubmission({
    name: 'David Okonkwo',
    phone: '5175551188',
    email: 'dokonkwo@comcast.net',
    message: 'Looking for a quote on weekly mowing at 812 Maple Street. Backyard is about a quarter acre.',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('legit: spring cleanup, no email supplied at all', () => {
  const v = scoreSubmission({
    name: 'Karen Doyle',
    phone: '2485552199',
    email: '',
    message: 'Spring cleanup and mulch. When can someone come look?',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('legit: terse message, no phone, email only', () => {
  const v = scoreSubmission({
    name: 'Anthony Ruiz',
    phone: '',
    email: 'aruiz84@gmail.com',
    message: 'Hedge trimming quote please',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('legit: landscape design enquiry mentioning budget figures', () => {
  const v = scoreSubmission({
    name: 'Priya Raman',
    phone: '7345552107',
    email: 'priya.raman@gmail.com', // 1 dot
    message: 'Landscaping Design — we have a budget around 8000 and want to redo the front beds.',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('legit: repeat customer, all caps enthusiasm', () => {
  const v = scoreSubmission({
    name: 'Bill Hartmann',
    phone: '+1 (517) 555-2164',
    email: 'bhartmann@outlook.com',
    message: 'SAME AS LAST YEAR PLEASE — FALL LEAF REMOVAL. THANKS!',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

// ---------------------------------------------------------------------------
// The five false-positive cases from the Phase 1 design, as named tests.
// ---------------------------------------------------------------------------

test('FP case: message is just "Aeration" and nothing else', () => {
  const v = scoreSubmission({ name: 'Greg Lang', phone: '7345552123', email: 'glang@gmail.com', message: 'Aeration' })
  assert.equal(v.score, 0)
})

test('FP case: address typed as digits only, phone field left empty', () => {
  // The suppression rule: phone field empty + structurally valid run = a real
  // person putting their number in the message box. Must score zero.
  const v = scoreSubmission({
    name: 'Tom Becker',
    phone: '',
    email: 'tbecker@yahoo.com',
    message: 'Property address: 7345552188',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('FP case: customer repeats their OWN number in the message — suppressed', () => {
  // Suppression rule 2: the run equals the phone field, so it is the customer
  // repeating themselves, not a bot stuffing a second number.
  const v = scoreSubmission({
    name: 'Tom Becker',
    phone: '7345552188',
    email: 'tbecker@yahoo.com',
    message: 'Best number:\n7345552188',
  })
  assert.equal(v.score, 0)
  assert.equal(v.isSpam, false)
})

test('FP case: same number in different formats still counts as equal', () => {
  const v = scoreSubmission({
    name: 'Tom Becker',
    phone: '+1 (734) 555-2188',
    email: 'tbecker@yahoo.com',
    message: 'Call me at\n7345552188',
  })
  assert.equal(v.score, 0)
})

test('FP case: dotted gmail + name mismatch + own number repeated does NOT condemn', () => {
  // The stack this suppression exists to close. Before rule 2 this scored
  // 60 (4-dot gmail) + 20 (name mismatch) + 40 (digit run) = 120 and condemned a
  // real customer: a dotted gmail whose local part does not match the name they
  // typed, who filled the phone field and then wrote "call me at <same number>".
  const v = scoreSubmission({
    name: 'Robert Chen',
    phone: '7345552188',
    email: 'r.j.c.k.1988@gmail.com', // 4 dots, shares no prefix with the name
    message: 'Weekly mowing please. Call me at 7345552188',
  })
  assert.equal(
    v.score,
    SPAM_WEIGHTS.GMAIL_DOTS_4_PLUS + SPAM_WEIGHTS.EMAIL_NAME_MISMATCH // 80
  )
  assert.equal(v.isSpam, false)
  assert.ok(!v.reasons.includes('bare_digit_run'))
})

test('a DIFFERENT number in the message is still scored — that is the bot pattern', () => {
  const v = scoreSubmission({
    name: 'Tom Becker',
    phone: '7345552188',
    email: 'tbecker@yahoo.com',
    message: 'Best number:\n3135552144',
  })
  assert.equal(v.score, SPAM_WEIGHTS.BARE_DIGIT_RUN) // 40
  assert.equal(v.isSpam, false)
})

test('FP case: gmail user with 2 dots is not penalised at all', () => {
  const v = scoreSubmission({
    name: 'John Smith',
    phone: '3135552111',
    email: 'john.a.smith@gmail.com',
    message: 'Need a quote for lawn care',
  })
  assert.equal(v.score, 0)
  assert.equal(v.reasons.length, 0)
})

test('FP case: 3-dot gmail is recorded but weighted zero today', () => {
  const v = scoreSubmission({
    name: 'Mary Jane Smith',
    phone: '3135552111',
    email: 'mary.j.a.smith@gmail.com', // exactly 3 dots
    message: 'Mowing quote please',
  })
  assert.equal(v.score, 0)
  assert.deepEqual(v.reasons, ['gmail_dots_3'])
})

test('FP case: short and unusual real surnames', () => {
  for (const name of ['Linh Nguyen', 'Wei Ng', 'Ann Xu', 'Anita Bhattacharya', 'Hans Schmidt', 'Krzysztof Wozniak']) {
    const v = scoreSubmission({ name, phone: '7345552150', email: 'contact@fastmail.com', message: 'Mowing quote' })
    assert.equal(v.score, 0, `${name} should score 0, got ${v.score} (${v.reasons.join(',')})`)
  }
})

test('FP case: commercial property manager using business jargon', () => {
  const v = scoreSubmission({
    name: 'Dana Whitfield',
    phone: '3135552144',
    email: 'dana@whitfieldpm.com',
    message:
      'Hi, I manage 12 rental properties in Ann Arbor. Our clients need weekly mowing this ' +
      'season. Can we book a call to discuss pricing?',
  })
  assert.equal(v.score, 2 * SPAM_WEIGHTS.B2B_WEAK) // 24
  assert.equal(v.isSpam, false)
})

// ---------------------------------------------------------------------------
// Headroom guard: the worst legitimate submission I can contrive must stay well
// clear. If this test starts failing, the weights drifted — do not just bump it.
// ---------------------------------------------------------------------------

test('headroom: contrived worst-case legitimate customer stays far below threshold', () => {
  // Worst case still reachable after both (e) suppressions: a customer who gives a
  // SECOND, different number (a spouse's) alongside their own, plus jargon.
  const v = scoreSubmission({
    name: 'Mary Smith',
    phone: '7345552134',
    email: 'mary.j.a.smith@gmail.com', // 3 dots, weight 0 today
    message: 'Aeration\n3135552144\nCan we book a call?',
  })
  assert.equal(v.score, 52) // 40 bare-digit + 12 jargon
  // At least 40% headroom. Phase 1 committed to "no plausible real customer
  // within 30% of threshold".
  assert.ok(v.score <= T * 0.7, `contrived legit scored ${v.score}, want <= ${T * 0.7}`)
})

// ---------------------------------------------------------------------------
// Gibberish detector regressions — the two near-misses identified in design.
// ---------------------------------------------------------------------------

test('gibberish: 2-of-3 rule spares real surnames that trip a single condition', () => {
  // Schmidt: vowel ratio 0.14 fires, but consonant run is 4 and there is 1 case
  // transition. One condition is not enough — this is why the rule is 2-of-3.
  assert.equal(isGibberish('Schmidt'), false)
  // Krzysztof: only spared because `y` counts as a vowel. Do not remove y.
  assert.equal(isGibberish('Krzysztof'), false)
  for (const w of ['Bhattacharya', 'Szczepanski', 'Wojcik', 'Rzeszewski', 'Zbigniew', 'Nguyen']) {
    assert.equal(isGibberish(w), false, `${w} misclassified as gibberish`)
  }
})

test('gibberish: tokens under 6 letters are never evaluated', () => {
  for (const w of ['Ng', 'Xu', 'Li', 'Vu', 'Smyth', 'Lynch']) {
    assert.equal(isGibberish(w), false)
  }
})

test('gibberish: the generated tokens from the samples are caught', () => {
  assert.equal(isGibberish('Aqvdnztd'), true)
  assert.equal(isGibberish('rLOWoVPknxsiwrlyeuxk'), true)
  assert.equal(isGibberish('pDnYRKQXCVgpAKZl'), true)
  assert.equal(isGibberish('dgxPowfhDnmEPpDUcSXWUfC'), true)
})

// ---------------------------------------------------------------------------
// Mechanics
// ---------------------------------------------------------------------------

test('honeypot auto-condemns and short-circuits every other signal', () => {
  const v = scoreSubmission({ name: 'Sarah Miller', phone: '7345552142', email: 'sarahmiller@gmail.com', message: 'Aeration', honeypot: 'http://x.co' })
  assert.equal(v.score, SPAM_WEIGHTS.HONEYPOT)
  assert.deepEqual(v.reasons, ['honeypot'])
  assert.equal(v.isSpam, true)
})

test('honeypot: empty or whitespace value is not a hit', () => {
  assert.equal(scoreSubmission({ name: 'A Person', honeypot: '' }).score, 0)
  assert.equal(scoreSubmission({ name: 'A Person', honeypot: '   ' }).score, 0)
  assert.equal(scoreSubmission({ name: 'A Person', honeypot: undefined }).score, 0)
})

test('threshold boundary is inclusive: score === threshold is spam', () => {
  // Guards the >= vs > decision. A sample landing exactly on the threshold must
  // be caught, not delivered.
  const v = scoreSubmission({ name: 'X', message: 'x' })
  assert.equal(v.isSpam, false)
  assert.equal(v.threshold, T)
  const onTheLine = { ...v, score: T }
  assert.equal(onTheLine.score >= onTheLine.threshold, true)
})

test('velocity: cross-tenant repeat sender adds score and is capped', () => {
  const base: SpamInput = { name: 'Sarah Miller', phone: '7345552142', email: 'sarahmiller@gmail.com', message: 'Aeration' }
  assert.equal(scoreSubmission(base, { emailPriorCount24h: 0, ipPriorCount24h: 0 }).score, 0)
  assert.equal(scoreSubmission(base, { emailPriorCount24h: 1, ipPriorCount24h: 0 }).score, SPAM_WEIGHTS.VELOCITY_EMAIL_2)
  assert.equal(scoreSubmission(base, { emailPriorCount24h: 3, ipPriorCount24h: 0 }).score, SPAM_WEIGHTS.VELOCITY_EMAIL_4)
  // 60 + 60 = 120, capped to 60. Velocity alone can never condemn.
  const both = scoreSubmission(base, { emailPriorCount24h: 9, ipPriorCount24h: 9 })
  assert.equal(both.score, SPAM_WEIGHTS.VELOCITY_CAP)
  assert.equal(both.isSpam, false)
})

test('velocity: gmail dots and +tags collapse to one inbox', () => {
  assert.equal(normalizeEmailForVelocity('i.b.e.g.u.tu903@gmail.com'), 'ibegutu903@gmail.com')
  assert.equal(normalizeEmailForVelocity('Sarah.Miller+lawn@GMAIL.com'), 'sarahmiller@gmail.com')
  // Dots are significant everywhere except gmail.
  assert.equal(normalizeEmailForVelocity('first.last@outlook.com'), 'first.last@outlook.com')
})

test('turnstile failure adds score but never condemns on its own', () => {
  const v = scoreSubmission({ name: 'Sarah Miller', phone: '7345552142', email: 'sarahmiller@gmail.com', message: 'Aeration', turnstileFailed: true })
  assert.equal(v.score, SPAM_WEIGHTS.TURNSTILE_FAILED)
  assert.equal(v.isSpam, false)
})

test('B2B: two strong phrases do not condemn, three do', () => {
  const two = scoreSubmission({ name: 'A Person', message: 'We built an AI employee. This is not a sales call.' })
  assert.equal(two.score, 80)
  assert.equal(two.isSpam, false)
  const three = scoreSubmission({ name: 'A Person', message: 'Our AI receptionist. Not a sales call. A quick 15-minute demo?' })
  assert.equal(three.score, SPAM_WEIGHTS.B2B_STRONG * 3)
  assert.equal(three.isSpam, true)
})

test('B2B: all six weak phrases together still do not condemn', () => {
  const v = scoreSubmission({
    name: 'A Person',
    message: 'book a call our clients our customers hours per week your reviews reach out to schedule',
  })
  assert.equal(v.score, 6 * SPAM_WEIGHTS.B2B_WEAK) // 72
  assert.equal(v.isSpam, false)
})


// ---------------------------------------------------------------------------
// SHADOW MODE
// ---------------------------------------------------------------------------
// Rollout plan: deploy with SPAM_SCORE_THRESHOLD=100000, watch /admin/spam for a
// week against real traffic, then lower to 100. These tests are the contract that
// makes that safe — at a very high threshold NOTHING is condemned, so every owner
// notification fires exactly as it does today, while scores and reasons are still
// computed and stored.

test('shadow mode: at threshold 100000 nothing is condemned, but everything is still scored', () => {
  const previous = process.env.SPAM_SCORE_THRESHOLD
  process.env.SPAM_SCORE_THRESHOLD = '100000'
  try {
    for (const sample of [SAMPLE_1, SAMPLE_2, SAMPLE_3, SAMPLE_4]) {
      const v = scoreSubmission(sample)
      assert.equal(v.threshold, 100000)
      assert.equal(v.isSpam, false, 'shadow mode must condemn nothing')
      assert.ok(v.score > 0, 'score is still computed')
      assert.ok(v.reasons.length > 0, 'reasons are still recorded')
    }
    // Even a filled honeypot is delivered in shadow mode. Intended: shadow mode
    // means condemn NOTHING, and 1000 < 100000.
    const hp = scoreSubmission({ name: 'A Person', honeypot: 'http://x.co' })
    assert.equal(hp.score, SPAM_WEIGHTS.HONEYPOT)
    assert.equal(hp.isSpam, false)
  } finally {
    if (previous === undefined) delete process.env.SPAM_SCORE_THRESHOLD
    else process.env.SPAM_SCORE_THRESHOLD = previous
  }
})

test('threshold is read per call, not captured at module load', () => {
  // This test would fail if getSpamThreshold() cached at import time. It is the
  // proof behind the rollout claim that SPAM_SCORE_THRESHOLD can be retuned
  // without a code change.
  const previous = process.env.SPAM_SCORE_THRESHOLD
  try {
    process.env.SPAM_SCORE_THRESHOLD = '100000'
    assert.equal(scoreSubmission(SAMPLE_1).isSpam, false)
    process.env.SPAM_SCORE_THRESHOLD = '100'
    assert.equal(scoreSubmission(SAMPLE_1).isSpam, true)
    process.env.SPAM_SCORE_THRESHOLD = '50'
    assert.equal(scoreSubmission(SAMPLE_1).threshold, 50)
  } finally {
    if (previous === undefined) delete process.env.SPAM_SCORE_THRESHOLD
    else process.env.SPAM_SCORE_THRESHOLD = previous
  }
})

test('a malformed threshold falls back to the default rather than condemning everything', () => {
  const previous = process.env.SPAM_SCORE_THRESHOLD
  try {
    for (const bad of ['', 'abc', '0', '-5']) {
      process.env.SPAM_SCORE_THRESHOLD = bad
      assert.equal(scoreSubmission(SAMPLE_1).threshold, T)
    }
  } finally {
    if (previous === undefined) delete process.env.SPAM_SCORE_THRESHOLD
    else process.env.SPAM_SCORE_THRESHOLD = previous
  }
})
