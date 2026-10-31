// ===========================================
// GitHub helpers
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isSameRepo } from './github'

test('isSameRepo: a rename redirect is not the asked-for repo; case does not matter', () => {
  assert.ok(isSameRepo('jacobholtzer22-droid/AA-Prestige', 'jacobholtzer22-droid/AA-Prestige'))
  assert.ok(isSameRepo('https://github.com/jacobholtzer22-droid/aa-prestige.git', 'jacobholtzer22-droid/AA-Prestige'))
  assert.ok(!isSameRepo('jacobholtzer22-droid/AA-YualexPainting', 'jacobholtzer22-droid/AA-YualexPainting-old'))
  assert.ok(!isSameRepo('jacobholtzer22-droid/AA-X', undefined))
})
