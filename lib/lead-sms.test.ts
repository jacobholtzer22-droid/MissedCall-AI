import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadTextBody } from './lead-sms'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/
const segments = (t: string) => (t.length <= 160 ? 1 : Math.ceil(t.length / 153))

test('lead text is the approved copy with the personalized /calendar link', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.alignandacquire.com'
  try {
    const text = leadTextBody({ calendarToken: 'Ab3dEf6hIj9kLm2n', watchArm: 'A' })
    const link = 'https://www.alignandacquire.com/calendar?l=Ab3dEf6hIj9kLm2n&utm_source=sms&utm_medium=funnel_return&utm_campaign=a'
    assert.equal(
      text,
      "This is Jacob with Align and Acquire. Thanks for taking a look. I'll follow up with you soon. " +
        "Want to skip the wait? Book a time on my calendar and we'll go over everything and see if it's a fit: " +
        link +
        '\n\nReply STOP to opt out.'
    )
    assert.ok(GSM7.test(text), 'must stay GSM-7 or every segment shrinks to 67 characters')
    assert.equal(text.length, 334)
    assert.equal(segments(text), 3)
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = prev
  }
})

test('lead text never carries the watch-page link, even when one is available', () => {
  const text = leadTextBody({ calendarToken: 'tok', watchUrl: 'lead.A.exp.sig', watchArm: 'B' })
  assert.ok(!text.includes('/watch'))
  assert.ok(text.includes('/calendar?l=tok'))
})
