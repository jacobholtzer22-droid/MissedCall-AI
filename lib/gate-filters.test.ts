import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchBlockedKeyword, isBlockedTradeText, BLOCKED_KEYWORDS } from './gate-filters'

// ── the ones that must be blocked ──────────────────────────────────────────

test('the phrases the two agency submissions used are blocked', () => {
  for (const t of [
    'marketing agency',
    'Marketing Agency',
    'lead generation for contractors',
    'we do lead gen',
    'SaaS for home services',
    'AI chatbot software',
    'white label reseller',
    'SEO and ads',
    'funnel consulting',
    'CRM automation',
    'business coaching',
    'media buying',
  ]) {
    assert.ok(isBlockedTradeText(t), `should block: ${t}`)
  }
})

test('every keyword in the list matches itself', () => {
  for (const k of BLOCKED_KEYWORDS) {
    assert.equal(matchBlockedKeyword(k), k, `keyword should match itself: ${k}`)
  }
})

// ── the ones that must NOT be blocked ───────────────────────────────────────
// These are the whole reason the regex uses \b. Each is a real trade that a
// substring match would turn away, and turning away a contractor is a worse
// outcome than letting an agency through.

test('word boundaries: real trades containing a keyword as a substring pass', () => {
  const mustPass: [string, string][] = [
    ['painting', 'contains "ai"'],
    ['Painting and drywall', 'contains "ai"'],
    ['roads and paving', 'contains "ads"'],
    ['appliance repair', 'contains "app"'],
    ['appliance installation', 'contains "app"'],
    ['maid service', 'contains "ai"'],
    ['air duct cleaning', 'contains "ai"'],
    ['chimney sweeping', 'contains "seo"? no — control'],
    ['handyman', 'control'],
    ['pressure washing', 'the QA happy path'],
    ['gutter cleaning', 'control'],
    ['snow removal', 'control'],
    ['fencing', 'control'],
    ['pool maintenance', 'contains "ai" inside maintenance'],
    ['drain cleaning', 'contains "ai"'],
    ['stairs and railings', 'contains "ai"'],
    ['mobile detailing', 'contains "ai"'],
    ['bathroom remodeling', 'control'],
  ]
  for (const [t, why] of mustPass) {
    assert.equal(matchBlockedKeyword(t), null, `should NOT block ${JSON.stringify(t)} (${why})`)
  }
})

test('"ai" blocks only as its own word', () => {
  assert.equal(matchBlockedKeyword('painting'), null)
  assert.equal(matchBlockedKeyword('maintenance'), null)
  assert.equal(matchBlockedKeyword('AI automations'), 'ai')
  assert.equal(matchBlockedKeyword('we build AI'), 'ai')
})

test('"ads" blocks only as its own word', () => {
  assert.equal(matchBlockedKeyword('roads'), null)
  assert.equal(matchBlockedKeyword('roadside assistance'), null)
  assert.equal(matchBlockedKeyword('google ads'), 'ads')
})

test('"app" blocks only as its own word', () => {
  assert.equal(matchBlockedKeyword('appliance repair'), null)
  assert.equal(matchBlockedKeyword('we build an app'), 'app')
})

test('"leads" blocks but "lead paint removal" does not, via the singular', () => {
  // "lead" alone is deliberately NOT in the list: lead paint abatement is a
  // real trade. Only the plural and the two "lead gen" forms are blocked.
  assert.equal(matchBlockedKeyword('lead paint removal'), null)
  assert.equal(matchBlockedKeyword('we sell leads'), 'leads')
})

// ── shape ──────────────────────────────────────────────────────────────────

test('empty, null and whitespace are not blocks', () => {
  assert.equal(matchBlockedKeyword(''), null)
  assert.equal(matchBlockedKeyword('   '), null)
  assert.equal(matchBlockedKeyword(null), null)
  assert.equal(matchBlockedKeyword(undefined), null)
})

test('matching is case-insensitive and returns the keyword lowercased', () => {
  assert.equal(matchBlockedKeyword('MARKETING'), 'marketing')
  assert.equal(matchBlockedKeyword('Consulting'), 'consulting')
})

test('punctuation around a keyword still matches', () => {
  assert.equal(matchBlockedKeyword('marketing, roofing'), 'marketing')
  assert.equal(matchBlockedKeyword('roofing (and seo)'), 'seo')
})
