import { test } from 'node:test'
import assert from 'node:assert/strict'
import { followUpBody, leadTextBody } from './lead-sms'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const segments = (t: string) => (t.length <= 160 ? 1 : Math.ceil(t.length / 153))

function withAppUrl(fn: () => void) {
  const prev = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.alignandacquire.com'
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = prev
  }
}

const LINK =
  'https://www.alignandacquire.com/calendar?l=Ab3dEf6hIj9kLm2n&utm_source=sms&utm_medium=funnel_return&utm_campaign=a'
const ctx = {
  firstName: 'Marcus Vandenberg',
  businessName: 'Vandenberg Roofing',
  calendarToken: 'Ab3dEf6hIj9kLm2n',
  watchArm: 'A' as const,
}

test('MSG 2 lead text is the approved copy with the personalized /calendar link', () => {
  withAppUrl(() => {
    const text = leadTextBody(ctx)
    assert.equal(
      text,
      "Hey Marcus, it's Jacob from Align and Acquire. Thanks for taking a look. " +
        `If you want to see how it would work for Vandenberg Roofing, grab a time on my calendar: ${LINK}` +
        '\n\nReply STOP to opt out.'
    )
    assert.ok(GSM7.test(text), 'must stay GSM-7 or every segment shrinks to 67 characters')
    assert.equal(segments(text), 2, `length ${text.length}`)
  })
})

test('MSG 2 falls back to "Hey," and "your business"', () => {
  withAppUrl(() => {
    const text = leadTextBody({ calendarToken: 'Ab3dEf6hIj9kLm2n', watchArm: 'A' })
    assert.ok(text.startsWith("Hey, it's Jacob from Align and Acquire."))
    assert.match(text, /work for your business, grab a time/)
  })
})

test('MSG 2 never greets with the banked-lead phone placeholder', () => {
  assert.ok(leadTextBody({ firstName: '+16165551234', calendarToken: 't' }).startsWith("Hey, it's Jacob"))
})

test('lead texts never carry the watch-page link, even when one is available', () => {
  for (const text of [
    leadTextBody({ calendarToken: 'tok', watchUrl: 'lead.A.exp.sig', watchArm: 'B' }),
    followUpBody({ calendarToken: 'tok', watchUrl: 'lead.A.exp.sig', watchArm: 'B' }),
  ]) {
    assert.ok(!text.includes('/watch'))
    assert.ok(text.includes('/calendar?l=tok'))
  }
})

test('MSG 3 follow-up is the approved copy', () => {
  withAppUrl(() => {
    const text = followUpBody(ctx)
    assert.equal(
      text,
      'Hey Marcus, Jacob from Align and Acquire again. Still want to see how this would work for Vandenberg Roofing? ' +
        `It's a quick call, pick any time that works: ${LINK}` +
        '\n\nReply STOP to opt out.'
    )
    assert.ok(GSM7.test(text))
    assert.doesNotMatch(text, /yesterday|watched/, 'must not claim they watched anything')
  })
})

test('MSG 3 falls back to "Hey," and "your business"', () => {
  const text = followUpBody({ calendarToken: 't' })
  assert.ok(text.startsWith('Hey, Jacob from Align and Acquire again.'))
  assert.match(text, /work for your business\?/)
})
