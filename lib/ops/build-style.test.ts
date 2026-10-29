// ===========================================
// /admin/ops build style, extras and questions tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildExtras, parseDesignDirection, questionsFrom, styleFromIntake } from './build-style'

test('parseDesignDirection reads the three keys through bullets and bold', () => {
  const text = ['## 2. Design direction', '- **direction:** workshop', '* pairing: Fraunces + Manrope', '1. headingAccent: `italic-word`', 'Why: few photos'].join('\n')
  assert.deepEqual(parseDesignDirection(text), { direction: 'workshop', pairing: 'Fraunces + Manrope', headingAccent: 'italic-word' })
  assert.deepEqual(parseDesignDirection('Heading accent = gradient-word'), { direction: null, pairing: null, headingAccent: 'gradient-word' })
  assert.equal(parseDesignDirection('nothing structured here'), null)
  assert.equal(parseDesignDirection(null), null)
})

test('questionsFrom takes the Questions for Jacob section, one per line', () => {
  const todo = ['# CLIENT-TODO', '## Questions for Jacob', '- What hours do you answer the phone?', '- [ ] Is the address public?', '', '## Photos to replace', '- hero'].join('\n')
  assert.deepEqual(questionsFrom(todo), ['What hours do you answer the phone?', 'Is the address public?'])
  assert.deepEqual(questionsFrom('1. Do you offer financing?\n2) Any warranty?'), ['Do you offer financing?', 'Any warranty?'])
  assert.deepEqual(questionsFrom(''), [])
})

test('styleFromIntake maps the intake names and merges both spellings', () => {
  assert.deepEqual(styleFromIntake({ referenceSites: ['https://kalights.com'], colors: ['#123456'], sitesLiked: ['https://kalights.com', 'https://otsmobile.com'] }), {
    sitesLiked: ['https://kalights.com', 'https://otsmobile.com'],
    brandColors: ['#123456'],
  })
  assert.equal(styleFromIntake({ avoid: 'pink' }), null)
  assert.equal(styleFromIntake(null), null)
})

test('buildExtras keeps five styles with content and drops empty parts', () => {
  const s = (n: number) => ({ client: `C${n}`, direction: 'night', pairing: `P${n}`, headingAccent: null })
  const ex = buildExtras({ recentStyles: [...Array.from({ length: 7 }, (_, i) => s(i)), { client: 'X', direction: null, pairing: null, headingAccent: null }], gbp: { placeId: 'p' }, style: { colors: ['#000'] } })
  assert.equal(ex?.recent_styles?.length, 5)
  assert.deepEqual(ex?.gbp, { placeId: 'p' })
  assert.deepEqual(ex?.style, { brandColors: ['#000'] })
  assert.equal(buildExtras({ recentStyles: [], gbp: {}, style: null }), null)
})
