// Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FOLLOW_UP_EXCLUDED_STATUSES } from './statuses'

test('follow-up never texts spam or deleted leads', () => {
  assert.ok(FOLLOW_UP_EXCLUDED_STATUSES.includes('spam'))
  assert.ok(FOLLOW_UP_EXCLUDED_STATUSES.includes('deleted'))
})

test('the cron query filters on that list', () => {
  const src = readFileSync(join(__dirname, 'route.ts'), 'utf8')
  assert.match(src, /status: \{ notIn: FOLLOW_UP_EXCLUDED_STATUSES \}/)
  assert.doesNotMatch(src, /status: \{ not: 'spam' \}/)
})
