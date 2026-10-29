// ===========================================
// /admin/ops Google tag and conversion label tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { classifyConversionActions, gtagIdsIn, parseSendTo, trackingBlockFrom, trackingInstructions, type ConversionRow } from './tracking'

const snippet = (sendTo: string) => `<!-- Event snippet -->\n<script>\n  gtag('event', 'conversion', {'send_to': '${sendTo}'});\n</script>`

const row = (over: Partial<ConversionRow>): ConversionRow => ({ id: '1', name: 'x', type: 'WEBPAGE', category: 'DEFAULT', status: 'ENABLED', snippets: [], ...over })

test('parseSendTo reads the AW- id and label', () => {
  assert.deepEqual(parseSendTo(snippet('AW-17234567890/AbC-dEf_1')), { awId: 'AW-17234567890', label: 'AbC-dEf_1' })
  assert.deepEqual(parseSendTo(`"send_to":"AW-1234567/xyz"`), { awId: 'AW-1234567', label: 'xyz' })
  assert.equal(parseSendTo('no snippet'), null)
})

test('classify picks the form, the site call and the ads call', () => {
  const rows = [
    row({ id: '7877131431', name: 'Website lead form', category: 'SUBMIT_LEAD_FORM', snippets: [snippet('AW-111222333/FormLbl')] }),
    row({ id: '7877185822', name: 'Click to call on site', category: 'PHONE_CALL_LEAD', snippets: [snippet('AW-111222333/CallLbl')] }),
    row({ id: '55', name: 'Calls from ads', type: 'AD_CALL', category: 'PHONE_CALL_LEAD' }),
    row({ id: '66', name: 'Old form', category: 'SUBMIT_LEAD_FORM', status: 'REMOVED', snippets: [snippet('AW-111222333/Old')] }),
  ]
  assert.deepEqual(classifyConversionActions(rows), {
    googleAdsId: 'AW-111222333',
    conversionActions: { formId: '7877131431', formLabel: 'FormLbl', callId: '7877185822', callLabel: 'CallLbl', adCallId: '55' },
  })
})

test('a tag-fired form wins over a codeless one listed first', () => {
  const rows = [
    row({ id: '1', name: 'Submit lead form (Form submission)', type: 'WEBPAGE_CODELESS', category: 'CONTACT', snippets: [snippet('AW-9/Codeless')] }),
    row({ id: '2', name: 'Website form submit (example.com)', type: 'WEBPAGE', category: 'SUBMIT_LEAD_FORM', snippets: [snippet('AW-9/Tagged')] }),
  ]
  assert.equal(classifyConversionActions(rows).conversionActions.formLabel, 'Tagged')
})

test('pinned ids win, and the tracking id fills in when no snippet has one', () => {
  const rows = [
    row({ id: '1', name: 'Lead form A', category: 'SUBMIT_LEAD_FORM', snippets: [snippet('AW-9/A')] }),
    row({ id: '2', name: 'Lead form B', category: 'SUBMIT_LEAD_FORM', snippets: [snippet('AW-9/B')] }),
  ]
  assert.equal(classifyConversionActions(rows, { formId: '2' }).conversionActions.formLabel, 'B')
  const none = classifyConversionActions([row({ id: '3', name: 'Website lead form', category: 'SUBMIT_LEAD_FORM' })], {}, '123456789')
  assert.equal(none.googleAdsId, 'AW-123456789')
  assert.equal(none.conversionActions.formId, '3')
  assert.equal(none.conversionActions.formLabel, null)
})

test('trackingBlockFrom builds the site block or says what is missing', () => {
  const ev = { googleAdsId: 'AW-111222333', conversionActions: { formLabel: 'FormLbl', callLabel: 'CallLbl' } }
  assert.deepEqual(trackingBlockFrom(ev), {
    block: { googleAdsId: 'AW-111222333', conversions: { form: 'AW-111222333/FormLbl', call: 'AW-111222333/CallLbl' } },
    missing: [],
  })
  assert.deepEqual(trackingBlockFrom({ googleAdsId: 'AW-111222333', conversionActions: { formLabel: 'F' } }).missing, ['the click-to-call label'])
  assert.equal(trackingBlockFrom({ conversionActions: { formLabel: 'F' } }).block, null)
  assert.equal(trackingBlockFrom(null).block, null)
})

test('trackingInstructions carries the block for the site agent', () => {
  const text = trackingInstructions({ googleAdsId: 'AW-1234567', conversions: { form: 'AW-1234567/F' } })
  assert.match(text, /googleAdsId: 'AW-1234567'/)
  assert.match(text, /conversions: \{ form: 'AW-1234567\/F' \}/)
  assert.match(text, /change nothing else/)
})

test('gtagIdsIn finds the loader and escaped config calls', () => {
  const html = `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-111222333"></script><script>gtag(\\"config\\",\\"G-ABC123\\")</script>`
  assert.deepEqual(gtagIdsIn(html).sort(), ['AW-111222333', 'G-ABC123'])
  assert.deepEqual(gtagIdsIn('<html></html>'), [])
})
