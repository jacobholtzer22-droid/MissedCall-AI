import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { ADS_ENV, adsPreflight, formatPreflight, hasPhone, isSpecBuild, webPreflight, type WebFacts } from './preflight'

const FULL_ENV = {
  GITHUB_OPS_TOKEN: 'x',
  OPS_CALLBACK_SECRET: 'x',
  ANTHROPIC_API_KEY_BUILDS: 'x',
  VERCEL_API_TOKEN: 'x',
  VERCEL_TEAM_ID: 'x',
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  ...Object.fromEntries(ADS_ENV.map((n) => [n, 'x'])),
}
const build = (p: Partial<WebFacts> = {}): WebFacts => ({
  kind: 'site_build',
  engagementId: 'eng1',
  hasBrief: true,
  photos: 8,
  oldSiteVerbatim: false,
  withStock: false,
  hasInstructions: false,
  businessLinked: true,
  hasRepo: true,
  repoHasWorkflow: true,
  ...p,
})
const texts = (items: { text: string }[]) => items.map((i) => i.text)

test('a ready site_build passes', () => {
  assert.deepEqual(webPreflight(build(), FULL_ENV), [])
})

test('site_build: each thing the run would fail on, in its group', () => {
  assert.deepEqual(webPreflight(build({ hasBrief: false }), FULL_ENV), [{ group: 'From you', text: 'a stored brief (write it with the chief and say "looks good")' }])
  // Photos never block (M12): the build runs without images and asks at the end.
  assert.deepEqual(webPreflight(build({ photos: 0 }), FULL_ENV), [])
  assert.deepEqual(webPreflight(build({ photos: 0, oldSiteVerbatim: true }), FULL_ENV), [])
  assert.deepEqual(webPreflight(build({ photos: 0, withStock: true }), FULL_ENV), [])
  assert.match(texts(webPreflight(build({ businessLinked: false }), FULL_ENV))[0], /^a platform account/)
  assert.match(texts(webPreflight(build({ repoHasWorkflow: false }), FULL_ENV))[0], /no aa-build workflow/)
  // Never checked is not a refusal: dispatch checks the workflow itself.
  assert.deepEqual(webPreflight(build({ repoHasWorkflow: null }), FULL_ENV), [])
  assert.deepEqual(texts(webPreflight(build(), { ...FULL_ENV, OPS_CALLBACK_SECRET: '' })), ['OPS_CALLBACK_SECRET is not set'])
  assert.deepEqual(texts(webPreflight(build(), { ...FULL_ENV, GITHUB_OPS_TOKEN: undefined })), ['GITHUB_OPS_TOKEN is not set'])
})

test('site_build with no repo: provisioning needs are checked, without one, they are not', () => {
  const noRepo = build({ hasRepo: false, repoHasWorkflow: null })
  assert.deepEqual(webPreflight(noRepo, FULL_ENV), [])
  assert.deepEqual(texts(webPreflight(noRepo, { ...FULL_ENV, VERCEL_API_TOKEN: '', VERCEL_TEAM_ID: '' })), ['VERCEL_API_TOKEN is not set', 'VERCEL_TEAM_ID is not set'])
  assert.match(texts(webPreflight(noRepo, { ...FULL_ENV, VERCEL_ENV: 'preview' }))[0], /production deployment/)
  // With a repo, the Vercel pair and production are not needed for a dispatch.
  assert.deepEqual(webPreflight(build(), { ...FULL_ENV, VERCEL_API_TOKEN: '', VERCEL_ENV: 'preview' }), [])
  // A name missing twice is listed once.
  assert.deepEqual(texts(webPreflight(noRepo, { ...FULL_ENV, OPS_CALLBACK_SECRET: '' })), ['OPS_CALLBACK_SECRET is not set'])
})

test('site_update: a repo and instructions; no brief or photo check', () => {
  const upd = (p: Partial<WebFacts>) => build({ kind: 'site_update', hasBrief: false, photos: 0, hasInstructions: true, ...p })
  assert.deepEqual(webPreflight(upd({}), FULL_ENV), [])
  assert.match(texts(webPreflight(upd({ hasRepo: false }), FULL_ENV))[0], /no repo yet/)
  assert.match(texts(webPreflight(upd({ hasInstructions: false }), FULL_ENV))[0], /instructions/)
})

test('ads: env and never-touch block; a missing call number does not (M12)', () => {
  const spec = '# Client A | Google Ads launch spec | Oct 27 2026\nBuild it paused.'
  assert.deepEqual(adsPreflight({ neverTouch: false, instructions: 'Audit search terms, change nothing.', ownerPhone: null, intakePhone: null }, FULL_ENV), [])
  // The run builds the campaign and stops short of the call asset; the enable gate holds it.
  assert.deepEqual(adsPreflight({ neverTouch: false, instructions: spec, ownerPhone: null, intakePhone: null }, FULL_ENV), [])
  for (const where of [{ ownerPhone: '+15555550100' }, { intakePhone: '(555) 555-0100' }, { instructions: `${spec}\nCall number: 555-555-0100` }]) {
    assert.deepEqual(adsPreflight({ neverTouch: false, instructions: spec, ownerPhone: null, intakePhone: null, ...where }, FULL_ENV), [], JSON.stringify(where))
  }
  assert.equal(adsPreflight({ neverTouch: true, instructions: 'x', ownerPhone: null, intakePhone: null }, FULL_ENV)[0].group, 'From you')
  const env = adsPreflight({ neverTouch: false, instructions: 'x', ownerPhone: null, intakePhone: null }, { ...FULL_ENV, GOOGLE_ADS_REFRESH_TOKEN: '', ANTHROPIC_API_KEY_BUILDS: '' })
  assert.deepEqual(texts(env), ['GOOGLE_ADS_REFRESH_TOKEN is not set', 'ANTHROPIC_API_KEY_BUILDS is not set'])
  assert.ok(env.every((i) => i.group === 'Setup'))
})

test('every launch spec on file is recognised as a build', () => {
  const dir = join(process.cwd(), 'docs', 'ads-specs')
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  assert.ok(files.length > 0)
  for (const f of files) assert.ok(isSpecBuild(readFileSync(join(dir, f), 'utf8')), f)
  assert.equal(hasPhone('no number here, 2026'), false)
})

test('one grouped message, client first, then you, then setup; nothing when ready', () => {
  assert.equal(formatPreflight('site build', 'Client A', []), null)
  const msg = formatPreflight('site build', 'Client A', [
    ...webPreflight(build({ hasBrief: false, photos: 0, hasRepo: false, repoHasWorkflow: null }), { ...FULL_ENV, VERCEL_TEAM_ID: '' }),
  ])
  assert.equal(
    msg,
    [
      'Not starting the site build for Client A. Missing:',
      'From you:',
      '- a stored brief (write it with the chief and say "looks good")',
      'Setup:',
      '- VERCEL_TEAM_ID is not set',
      'Nothing was started.',
    ].join('\n')
  )
  assert.doesNotMatch(msg!, /[\u2013\u2014]/)
})

test('flag off: every pre-flight call in the chief sits behind autoflowEnabled()', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'ops', 'hq', 'chief.ts'), 'utf8').split('\n')
  const calls = src.map((l, n) => [l, n] as const).filter(([l]) => /await (web|ads)PreflightFor\(/.test(l))
  assert.equal(calls.length, 2)
  for (const [, n] of calls) {
    const guard = src.slice(Math.max(0, n - 3), n).join('\n')
    assert.match(guard, /if \(autoflowEnabled\(\)/, `line ${n + 1} is not behind the flag`)
  }
})
