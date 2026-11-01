import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRIEF_DRAFT_MAX,
  BRIEF_DRAFT_MIN_PHOTOS,
  DRAFT_TRIGGERS,
  briefProblem,
  briefShapeProblem,
  draftBriefIfReady,
  draftMessage,
  intakeVersion,
  shouldDraftBrief,
  type BriefDraftState,
  type DraftDeps,
  type IntakeWithDraft,
} from './brief-draft'
import type { IntakeAsset } from './intake'

const NOW = new Date('2026-11-01T15:00:00Z')
const photo = (n: number): IntakeAsset => ({ id: `p${n}`, url: `u${n}`, filename: `job-${n}.jpg`, kind: 'photo', uploadedAt: NOW.toISOString() })
const ready = (p: Partial<IntakeWithDraft> = {}): IntakeWithDraft => ({
  business: { phone: '+15555550100', serviceArea: ['Town A', 'Town B'] },
  services: [{ name: 'Interior painting', moneyMaker: true }],
  about: 'Started painting in 2012.',
  assets: Array.from({ length: BRIEF_DRAFT_MIN_PHOTOS }, (_, n) => photo(n)),
  ...p,
})
const STANDARDS = '\n\n## Standards applied\n- Display name without LLC.\n- No published job ranges.\n- Hours as given.'
const GOOD_BRIEF = `# Brief\n\nbusinessSlug: client-a-123\n${'Service copy from the answers. '.repeat(10)}${STANDARDS}`

test('complete enough: the existing intakeMissing list plus the photo minimum', () => {
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: ready() }).draft, true)
  for (const [why, intake] of [
    ['no phone', ready({ business: { serviceArea: ['A'] } })],
    ['no services', ready({ services: [] })],
    ['no service area', ready({ business: { phone: '+15555550100' } })],
    ['no about', ready({ about: '' })],
    ['no photos', ready({ assets: [] })],
  ] as [string, IntakeWithDraft][]) {
    const d = shouldDraftBrief({ websiteStep: 'brief', brief: null, intake })
    assert.equal(d.draft, false, why)
    assert.match((d as { reason: string }).reason, /^intake still missing: /, why)
  }
  const few = shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: ready({ assets: ready().assets!.slice(0, BRIEF_DRAFT_MIN_PHOTOS - 1) }) })
  assert.deepEqual(few, { draft: false, reason: `${BRIEF_DRAFT_MIN_PHOTOS - 1} photos on file, ${BRIEF_DRAFT_MIN_PHOTOS} needed` })
  // Logos, GBP photos and videos do not count as client photos.
  const mixed = ready({ assets: [...ready().assets!.slice(0, 5), { ...photo(9), kind: 'gbp' }, { ...photo(10), kind: 'logo' }] })
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: mixed }).draft, false)
})

test('never with a stored brief, never past brief, never without a website deliverable', () => {
  assert.equal(shouldDraftBrief({ websiteStep: null, brief: null, intake: ready() }).draft, true)
  assert.deepEqual(shouldDraftBrief({ websiteStep: undefined, brief: null, intake: ready() }), { draft: false, reason: 'no website deliverable' })
  for (const step of ['build', 'review', 'send_preview', 'client_review', 'approved', 'live']) {
    assert.equal(shouldDraftBrief({ websiteStep: step, brief: null, intake: ready() }).draft, false, step)
  }
  assert.deepEqual(shouldDraftBrief({ websiteStep: 'brief', brief: '# stored', intake: ready() }), { draft: false, reason: 'a brief is already stored' })
})

test('once per intake version; a material change replaces a waiting draft once; capped', () => {
  const i = ready()
  const v = intakeVersion(i)
  const state = (p: Partial<BriefDraftState>): BriefDraftState => ({ version: v, status: 'pending', startedAt: NOW.toISOString(), count: 1, ...p })
  assert.match(String((shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: { ...i, briefDraft: state({}) } }) as { reason?: string }).reason), /already drafted for this intake version \(pending\)/)
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: { ...i, briefDraft: state({ status: 'failed', error: 'bad shape' }) } }).draft, false)
  // A call that broke (not the output) may try the same version again.
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: { ...i, briefDraft: state({ status: 'failed', retryable: true }) } }).draft, true)
  // The intake changed materially while a draft waits: one new draft replaces it.
  const changed = { ...i, about: 'Started painting in 2010 with his father.', briefDraft: state({}) }
  assert.deepEqual(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: changed }), { draft: true, version: intakeVersion(changed), replaces: v })
  // A draft being written blocks, unless it went stale.
  const drafting = { ...changed, briefDraft: state({ status: 'drafting', version: 'other', startedAt: NOW.toISOString() }) }
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: drafting, now: new Date(NOW.getTime() + 60_000) }).draft, false)
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: drafting, now: new Date(NOW.getTime() + 20 * 60_000) }).draft, true)
  // At most BRIEF_DRAFT_MAX automatic drafts per client.
  const capped = { ...changed, briefDraft: state({ version: 'old', count: BRIEF_DRAFT_MAX }) }
  assert.equal(shouldDraftBrief({ websiteStep: 'brief', brief: null, intake: capped }).draft, false)
})

test('material version: answers count; files, timestamps, the GBP lookup time, the link and the draft do not', () => {
  const i = ready({ gbp: { placeId: 'p', lookedUpAt: 'a' }, questionnaire: { answers: { '1': 'Client A' } } })
  const v = intakeVersion(i)
  assert.equal(intakeVersion({ ...i, assets: [...i.assets!, photo(99)] }), v)
  assert.equal(intakeVersion({ ...i, updatedAt: 'later' }), v)
  assert.equal(intakeVersion({ ...i, gbp: { placeId: 'p', lookedUpAt: 'b' } }), v)
  assert.equal(intakeVersion({ ...i, briefDraft: { version: 'x', status: 'pending', startedAt: '', count: 1 } }), v)
  assert.equal(intakeVersion({ ...(i as object), clientLink: { nonce: 'n' } } as IntakeWithDraft), v)
  assert.notEqual(intakeVersion({ ...i, offer: '$50 off' }), v)
  assert.notEqual(intakeVersion({ ...i, questionnaire: { answers: { '1': 'Client A', '2': 'Painting' } } }), v)
  assert.notEqual(intakeVersion({ ...i, rawNotes: 'Owner wants navy and gold.' }), v)
})

test('the shape checks are set_brief\'s, word for word', () => {
  assert.equal(briefShapeProblem('short'), 'the brief is too short to build from; fill the template')
  assert.match(briefShapeProblem('x'.repeat(300)) ?? '', /^the brief needs a "## Standards applied" section/)
  assert.equal(briefShapeProblem(`${'x'.repeat(300)}\nlaunch.indexable: true${STANDARDS}`), 'launch.indexable must stay false in a brief; go_live flips it later')
  assert.equal(briefProblem(GOOD_BRIEF, 'client-a-123'), null)
  assert.equal(briefProblem(GOOD_BRIEF, 'client-b-999'), 'the brief must carry businessSlug client-b-999 exactly')
})

function fakes(opts: { websiteStep?: string | null; brief?: string | null; intake?: IntakeWithDraft; text?: string; throws?: string } = {}) {
  const rec = { intake: opts.intake ?? ready(), posts: [] as string[], acts: [] as string[], writes: 0, storedBrief: opts.brief ?? null }
  const step = 'websiteStep' in opts ? opts.websiteStep : 'brief'
  const deps: DraftDeps = {
    load: async () => ({ name: 'Client A', websiteStep: step, brief: rec.storedBrief, slug: 'client-a-123', intake: { ...rec.intake } }),
    claim: async () => {
      const d = shouldDraftBrief({ websiteStep: step, brief: rec.storedBrief, intake: rec.intake, now: NOW })
      if (!d.draft) return null
      const s: BriefDraftState = { version: d.version, status: 'drafting', startedAt: NOW.toISOString(), count: (rec.intake.briefDraft?.count ?? 0) + 1 }
      rec.intake = { ...rec.intake, briefDraft: s }
      return s
    },
    write: async () => {
      rec.writes++
      if (opts.throws) throw new Error(opts.throws)
      return opts.text ?? GOOD_BRIEF
    },
    finish: async (_id, s) => {
      if (rec.intake.briefDraft?.version === s.version) rec.intake = { ...rec.intake, briefDraft: s }
    },
    post: async (_id, name, text, replaces) => {
      rec.posts.push(draftMessage(name, text, replaces))
    },
    activity: async (_id, body) => {
      rec.acts.push(body)
    },
    log: () => {},
  }
  return { deps, rec }
}

test('the runner drafts once, posts it for Jacob, stores no brief, sends nothing', async () => {
  const f = fakes()
  const r = await draftBriefIfReady('e1', 'save_intake', f.deps, NOW)
  assert.equal(r.drafted, true)
  assert.equal(f.rec.writes, 1)
  assert.equal(f.rec.intake.briefDraft?.status, 'pending')
  assert.equal(f.rec.storedBrief, null)
  assert.match(f.rec.posts[0], /^Brief draft for Client A, written from the intake\. Nothing is stored or built yet\.\nSay "looks good" and I'll store it with set_brief, or tell me what to change\./)
  assert.match(f.rec.acts[0], /^\[autoflow\] Brief drafted from the intake, waiting for your OK \(trigger save_intake/)
  // Every trigger after that, same intake: nothing.
  for (const t of DRAFT_TRIGGERS) assert.equal((await draftBriefIfReady('e1', t, f.deps, NOW)).drafted, false)
  assert.equal(f.rec.writes, 1)
  assert.equal(f.rec.posts.length, 1)
})

test('a broken call is retryable; a draft set_brief would refuse is never posted', async () => {
  const broken = fakes({ throws: 'ANTHROPIC_API_KEY_BUILDS is not set' })
  assert.equal((await draftBriefIfReady('e1', 'intake_link_done', broken.deps, NOW)).drafted, false)
  assert.equal(broken.rec.intake.briefDraft?.retryable, true)
  assert.equal(broken.rec.posts.length, 0)
  const bad = fakes({ text: 'Here is a short brief.' })
  assert.equal((await draftBriefIfReady('e1', 'file_photos', bad.deps, NOW)).drafted, false)
  assert.equal(bad.rec.intake.briefDraft?.status, 'failed')
  assert.equal(bad.rec.intake.briefDraft?.retryable, undefined)
  assert.equal(bad.rec.posts.length, 0)
  assert.match(bad.rec.acts[0], /Brief draft not posted/)
  // The same version is not tried again after a bad draft.
  assert.equal((await draftBriefIfReady('e1', 'save_intake', bad.deps, NOW)).drafted, false)
  assert.equal(bad.rec.writes, 1)
})

test('no draft past brief, with a stored brief, or before the intake is ready: the model is never called', async () => {
  for (const o of [{ websiteStep: 'build' }, { brief: '# stored brief' }, { intake: ready({ about: '' }) }, { websiteStep: undefined }]) {
    const f = fakes(o)
    assert.equal((await draftBriefIfReady('e1', 'save_intake', f.deps, NOW)).drafted, false)
    assert.equal(f.rec.writes, 0)
  }
})

test('flag off: autoDraftBrief returns at once and touches nothing', async () => {
  const prev = process.env.OPS_AUTOFLOW
  delete process.env.OPS_AUTOFLOW
  try {
    const { autoDraftBrief } = await import('./hq/chief')
    assert.equal(await autoDraftBrief('no-such-client', 'save_intake'), undefined)
  } finally {
    if (prev !== undefined) process.env.OPS_AUTOFLOW = prev
  }
})
