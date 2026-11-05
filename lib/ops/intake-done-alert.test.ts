import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { intakeDoneAlertText, type IntakeDoneFacts } from './intake-done-alert'

const GSM7 = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/

const facts = (p: Partial<IntakeDoneFacts> = {}): IntakeDoneFacts => ({
  displayName: 'CM Home Services LLC',
  contactName: 'Cole Mejia',
  via: 'portal',
  services: ['website', 'ads', 'missedcall'],
  photos: 12,
  videos: 1,
  logo: true,
  missing: [],
  href: 'https://www.alignandacquire.com/admin/ops?tab=clients',
  ...p,
})

test('text: names the client, what they bought, the files and the gaps; GSM-7', () => {
  const t = intakeDoneAlertText(facts())
  assert.equal(
    t.smsText,
    'Intake done: Cole Mejia finished the sign-up intake for CM Home Services LLC. Bought: website, ads, missedcall. 12 photos, 1 video, logo yes. Nothing missing: ready for a brief. https://www.alignandacquire.com/admin/ops?tab=clients'
  )
  assert.match(t.smsText, GSM7)
  assert.equal(t.subject, '[Ops] Intake done: CM Home Services LLC (sign-up)')
  assert.match(t.html, /<strong>Cole Mejia<\/strong> finished the sign-up intake/)
  assert.match(t.html, /drafts itself/)
})

test('text: the link door, a missing list, no contact name, no files, no app url', () => {
  const t = intakeDoneAlertText(facts({ via: 'link', contactName: null, photos: 0, videos: 0, logo: false, missing: ['service area', 'photos'], href: null, services: [] }))
  assert.equal(
    t.smsText,
    'Intake done: The client finished the link intake for CM Home Services LLC. Bought: nothing recorded. 0 photos, logo no. Still missing: service area, photos.'
  )
  assert.match(t.smsText, GSM7)
  assert.equal(t.subject, '[Ops] Intake done: CM Home Services LLC (link)')
  assert.match(t.html, /chase the missing pieces/)
  assert.doesNotMatch(t.html, /href=/)
})

test('text: html escapes the names', () => {
  const t = intakeDoneAlertText(facts({ displayName: 'A&B <Roofing>', contactName: "O'Neil" }))
  assert.match(t.html, /A&amp;B &lt;Roofing&gt;/)
  assert.match(t.html, /O&#39;Neil/)
})

test('wiring: both Done routes send the alert only when the finish wrote a note, off the response path', () => {
  const routes = ['lib/ops/intake-wizard-routes.ts', 'app/api/intake/[token]/finish/route.ts']
  for (const f of routes) {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    assert.match(src, /if \(note\) waitUntil\(sendIntakeDoneAlert\(/, f)
  }
  const alert = readFileSync(join(process.cwd(), 'lib/ops/intake-done-alert.ts'), 'utf8')
  assert.match(alert, /notifyOwnerOfMarketingEvent\(/)
  assert.doesNotMatch(alert, /from 'telnyx'|resend\.com/)
})
