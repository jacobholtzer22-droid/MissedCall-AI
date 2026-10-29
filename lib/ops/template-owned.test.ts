// ===========================================
// /admin/ops template-owned file sync tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseTemplateOwned, replaceSection } from './template-owned'

const S = '<!-- template-owned:ci:start -->'
const E = '<!-- template-owned:ci:end -->'

test('replaceSection swaps only the text between the markers', () => {
  const client = `# Site\nclient notes\n${S}\nold CI rules\n${E}\nclient tail\n`
  const template = `# Template\n${S}\nnew CI rules\n${E}\n`
  const r = replaceSection(client, template, S, E)
  assert.equal(r.status, 'replaced')
  assert.equal(r.text, `# Site\nclient notes\n${S}\nnew CI rules\n${E}\nclient tail\n`)
  assert.equal(replaceSection(r.text, template, S, E).status, 'same')
})

test('replaceSection never guesses when markers are missing', () => {
  assert.deepEqual(replaceSection('no markers', `${S}x${E}`, S, E), { status: 'no-markers-client', text: 'no markers' })
  assert.equal(replaceSection(`${S}x${E}`, 'template without markers', S, E).status, 'no-markers-template')
  assert.equal(replaceSection(`${S} only start`, `${S}x${E}`, S, E).status, 'no-markers-client')
})

test('parseTemplateOwned drops the sealed form and bad entries', () => {
  const t = parseTemplateOwned(JSON.stringify({ files: ['lib/content.ts', 'components/ContactForm.tsx', 3], sections: [{ file: 'AGENT.md', start: S, end: E }, { file: 'x' }] }))
  assert.deepEqual(t, { files: ['lib/content.ts'], sections: [{ file: 'AGENT.md', start: S, end: E }] })
  assert.equal(parseTemplateOwned('not json'), null)
  assert.equal(parseTemplateOwned(null), null)
})
