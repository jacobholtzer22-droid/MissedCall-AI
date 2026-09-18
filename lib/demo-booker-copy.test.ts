import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmationText, hourBeforeText, nightBeforeText } from './marketing-sms-copy'
import {
  DEMO_EMAIL_FROM,
  confirmationEmail,
  demoEmailEnvelope,
  demoInviteDescription,
  demoInviteTitle,
} from './demo-booker-copy'

// Tuesday Sep 22 2026, 4:00 PM EDT.
const TUE_4PM_ET = new Date('2026-09-22T20:00:00Z')
const MEET = 'https://meet.google.com/abc-defg-hij'
const VIDEO = 'https://www.alignandacquire.com/demo.mp4'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const NO_DASHES = /^[^\u2013\u2014]*$/

const pt = {
  scheduledAt: TUE_4PM_ET,
  firstName: 'Marcus Vandenberg',
  meetLink: MEET,
  ownerPhone: '+15175809709',
  timeZone: 'America/Los_Angeles',
  timeZoneSource: 'widget',
}

test('MSG 4 confirmation, exact copy', () => {
  assert.equal(
    confirmationText(pt),
    "Hey Marcus, it's Jacob from Align and Acquire. You're booked for Tue, Sep 22 at 1:00 PM PDT (your time). " +
      `Join here: ${MEET}\n\nNeed to move it? Text or call my cell at 517-580-9709. Reply STOP to opt out.`
  )
})

test('MSG 7 night before, exact copy, no STOP line', () => {
  assert.equal(
    nightBeforeText(pt),
    'Hey Marcus, Jacob from Align and Acquire. Looking forward to our call tomorrow at 1:00 PM PDT (your time). ' +
      "Reply YES so I know you're still good. If you need a different time, text or call my cell at 517-580-9709."
  )
})

test('MSG 8 hour before, exact copy, bare time, no STOP line', () => {
  assert.equal(
    hourBeforeText(pt),
    `Hey Marcus, Jacob from Align and Acquire. We're on at 1:00 PM PDT, about an hour from now. Join here: ${MEET}`
  )
})

test('an IP-guessed zone shows both times, in MSG 8 too', () => {
  const ip = { ...pt, timeZoneSource: 'ip' }
  assert.match(confirmationText(ip), /at 1:00 PM PDT \(4:00 PM EDT\)\. Join/)
  assert.match(hourBeforeText(ip), /on at 1:00 PM PDT \(4:00 PM EDT\), about/)
})

test('no zone reads ET with its abbreviation and no "(your time)"', () => {
  const none = { ...pt, timeZone: null, timeZoneSource: null }
  assert.match(confirmationText(none), /booked for Tue, Sep 22 at 4:00 PM EDT\. Join/)
  assert.match(nightBeforeText(none), /tomorrow at 4:00 PM EDT\. Reply YES/)
})

test('missing name, Meet link and owner phone drop cleanly', () => {
  const bare = { scheduledAt: TUE_4PM_ET, timeZone: 'America/Chicago', timeZoneSource: 'browser' }
  assert.equal(
    confirmationText(bare),
    "Hey, it's Jacob from Align and Acquire. You're booked for Tue, Sep 22 at 3:00 PM CDT (your time).\n\nReply STOP to opt out."
  )
  assert.equal(
    nightBeforeText(bare),
    "Hey, Jacob from Align and Acquire. Looking forward to our call tomorrow at 3:00 PM CDT (your time). Reply YES so I know you're still good."
  )
  assert.equal(hourBeforeText(bare), "Hey, Jacob from Align and Acquire. We're on at 3:00 PM CDT, about an hour from now.")
  // The banked-lead placeholder name is a phone number: never greet with it.
  assert.match(confirmationText({ ...bare, firstName: '+16165551234' }), /^Hey, it's Jacob/)
})

test('every text is GSM-7 across zones, seasons and fallbacks', () => {
  const zones: [string | null, string | null][] = [
    ['America/Los_Angeles', 'widget'],
    ['America/Denver', 'widget'],
    ['America/Phoenix', 'widget'],
    ['America/Chicago', 'widget'],
    ['America/New_York', 'widget'],
    ['America/Los_Angeles', 'ip'],
    [null, null],
  ]
  for (const at of [TUE_4PM_ET, new Date('2027-01-12T21:00:00Z')]) {
    for (const [timeZone, timeZoneSource] of zones) {
      const p = { ...pt, scheduledAt: at, timeZone, timeZoneSource }
      for (const t of [confirmationText(p), nightBeforeText(p), hourBeforeText(p)]) {
        assert.match(t, GSM7, `not GSM-7: ${t}`)
      }
    }
  }
})

test('MSG 5 email, exact subject and plain-text body', () => {
  const mail = confirmationEmail({ ...pt, videoUrl: VIDEO })
  assert.equal(mail.subject, "You're booked: Tue, Sep 22 at 1:00 PM PDT (your time)")
  assert.equal(
    mail.text,
    [
      'Hi Marcus,',
      "You're set for Tuesday, Sep 22 at 1:00 PM PDT (your time).",
      `Join here: ${MEET}`,
      "I'll show you the system running on real client accounts: the actual text-back conversations and the jobs " +
        "that got booked from them. Then I'll answer whatever questions you have. It usually takes about 15 minutes. " +
        "I block 30 so we're never rushed.",
      `Got 2 minutes before then? Watch this first: ${VIDEO}`,
      'Need a different time? Text or call my cell at 517-580-9709.',
      'Jacob\nAlign and Acquire',
    ].join('\n\n')
  )
  assert.match(mail.html, /Watch this first: <a href="https:\/\/www\.alignandacquire\.com\/demo\.mp4">Watch the video<\/a>/)
  assert.match(mail.html, /Jacob<br>Align and Acquire/)
  for (const s of [mail.subject, mail.text, mail.html]) assert.match(s, NO_DASHES)
})

test('MSG 5 email escapes the booker-supplied name in HTML', () => {
  const mail = confirmationEmail({ ...pt, firstName: '<b>Eve</b>' })
  assert.match(mail.html, /Hi &lt;b&gt;Eve&lt;\/b&gt;,/)
})

test('MSG 5 email subject for an IP guess and for no zone', () => {
  assert.equal(
    confirmationEmail({ ...pt, timeZoneSource: 'ip' }).subject,
    "You're booked: Tue, Sep 22 at 1:00 PM PDT (4:00 PM EDT)"
  )
  assert.equal(confirmationEmail({ ...pt, timeZone: null, timeZoneSource: null }).subject, "You're booked: Tue, Sep 22 at 4:00 PM EDT")
})

test('MSG 5 email sender is Jacob by name, replies go to ownerEmail when it is set', () => {
  assert.equal(DEMO_EMAIL_FROM, 'Jacob at Align and Acquire <notifications@alignandacquire.com>')
  assert.deepEqual(demoEmailEnvelope('jacob@alignandacquire.com'), {
    from: DEMO_EMAIL_FROM,
    reply_to: 'jacob@alignandacquire.com',
  })
  // Unset, blank or not an address: the key is absent, never present-and-empty.
  for (const bad of [null, undefined, '', '   ', 'not an email']) {
    const env = demoEmailEnvelope(bad)
    assert.deepEqual(env, { from: DEMO_EMAIL_FROM }, String(bad))
    assert.ok(!('reply_to' in env))
  }
})

test('MSG 6 invite title: first name and company, first word only, never "your business"', () => {
  const T = 'Align and Acquire demo with Jacob'
  assert.equal(demoInviteTitle('Marcus Vandenberg', 'Vandenberg Roofing'), `${T} | Marcus, Vandenberg Roofing`)
  assert.equal(demoInviteTitle('Marcus', null), `${T} | Marcus`)
  assert.equal(demoInviteTitle('Marcus', '  '), `${T} | Marcus`)
  assert.equal(demoInviteTitle(null, null), T)
  assert.equal(demoInviteTitle('', ''), T)
  // Same rules as greetingName: the banked-lead phone placeholder and a
  // one-letter name are not names.
  assert.equal(demoInviteTitle('+16165551234', null), T)
  assert.equal(demoInviteTitle('J', null), T)
  // Company without a usable name still says who the call is with.
  assert.equal(demoInviteTitle(null, 'Vandenberg Roofing'), `${T} | Vandenberg Roofing`)
  for (const t of [demoInviteTitle('Marcus', 'Vandenberg Roofing'), demoInviteTitle(null, null)]) {
    assert.doesNotMatch(t, /your business/)
    assert.match(t, NO_DASHES)
  }
})

test('MSG 6 invite description: header block, blank line, existing detail lines, no Join line', () => {
  const details = {
    customerName: 'Marcus',
    customerPhone: '+16165551234',
    customerEmail: 'marcus@example.com',
    businessName: 'Vandenberg Roofing',
    servicesInterested: [],
    message: 'Company: Vandenberg Roofing\nTrade: Roofing',
  }
  const withMeet = demoInviteDescription({ ...pt, videoUrl: VIDEO, details })
  assert.equal(
    withMeet,
    [
      'Time: Tuesday, Sep 22 at 1:00 PM PDT (your time)',
      `Watch this before we talk (2 min): ${VIDEO}`,
      'Need a different time? Text or call Jacob at 517-580-9709.',
      '',
      'Name: Marcus',
      'Phone: +16165551234',
      'Email: marcus@example.com',
      'Business: Vandenberg Roofing',
      'Message: Company: Vandenberg Roofing\nTrade: Roofing',
    ].join('\n')
  )
  assert.doesNotMatch(withMeet, /Booked via/)
  assert.match(withMeet, NO_DASHES)
  // Google puts its own Join button on the event: no Meet link in the text,
  // even when the caller happens to have one.
  assert.doesNotMatch(withMeet, /Join|meet\.google/)
})
