import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Discovery, GithubRepo, MatchableEngagement, VercelProject } from './checks/discover'
import { matchDiscovery } from './checks/discover'
import { similarity, suggestLinks, tokens } from './checks/link-suggest'

const repo = (name: string, p: Partial<GithubRepo> = {}): GithubRepo => ({
  fullName: `jacobholtzer22-droid/${name}`,
  name,
  url: `https://github.com/jacobholtzer22-droid/${name}`,
  defaultBranch: 'main',
  pushedAt: '2026-10-19T00:00:00.000Z',
  visibility: 'private',
  archived: false,
  hasWorkflow: false,
  hasSiteConfig: true,
  siteSlug: 'replace-before-launch',
  indexable: false,
  ...p,
})
const project = (name: string, p: Partial<VercelProject> = {}): VercelProject => ({
  id: `prj_${name}`,
  name,
  framework: 'nextjs',
  gitRepo: null,
  gitType: null,
  domains: [],
  production: null,
  preview: null,
  ...p,
})
const eng = (id: string, displayName: string, slug: string | null = null): MatchableEngagement => ({
  id,
  displayName,
  businessSlug: slug,
  website: { id: `w-${id}`, evidence: {} },
  domain: null,
})

test('tokens drop business-suffix noise', () => {
  assert.deepEqual(tokens('Cowboy Spray Foam LLC'), ['cowboy', 'spray', 'foam'])
  assert.deepEqual(tokens('Christian-Cowboy-Spray-Foam'), ['christian', 'cowboy', 'spray', 'foam'])
})

test('similarity: a renamed repo still ranks first, a stranger does not rank', () => {
  assert.ok(similarity('Cowboy Spray Foam', 'cowboy-spray-foam') === 1)
  assert.ok(similarity('Cowboy Spray Foam', 'Christian-Cowboy-Spray-Foam') >= 0.9)
  assert.ok(similarity('Cowboy Spray Foam', 'Prestige-Blinds') === 0)
  assert.ok(similarity('Cowboy Spray Foam', 'T-M-Spray-Foam') < similarity('Cowboy Spray Foam', 'Christian-Cowboy-Spray-Foam'))
})

test('suggestLinks: the Cowboy case (placeholder slug, renamed repo) gets both candidates; a linked client gets none', () => {
  const d: Discovery = {
    repos: [
      repo('Christian-Cowboy-Spray-Foam'),
      repo('T-M-Spray-Foam', { siteSlug: 'tm-spray-foam' }),
      repo('Prestige-Blinds', { siteSlug: 'prestige-blinds' }),
    ],
    projects: [
      project('cowboy-spray-foam', { gitRepo: 'jacobholtzer22-droid/Christian-Cowboy-Spray-Foam', domains: [{ name: 'www.cowboysprayfoamllc.com', verified: true, redirect: null }] }),
      project('prestige-blinds', { gitRepo: 'jacobholtzer22-droid/Prestige-Blinds' }),
    ],
    errors: [],
  }
  const engs = [eng('cowboy', 'Cowboy Spray Foam'), eng('prestige', 'Prestige Blinds', 'prestige-blinds'), eng('tm', 'T&M Construction Co', 'tm-spray-foam')]
  const m = matchDiscovery(engs, d)
  assert.ok(m.repoFor.has('prestige') && m.projectFor.has('prestige'), 'prestige links by slug + git link')
  assert.ok(!m.repoFor.has('cowboy'), 'cowboy never links by name in the strict matcher')

  const out = suggestLinks(engs, d, m, { websiteOnly: new Set(['cowboy', 'prestige', 'tm']) })
  const cowboy = out.find((x) => x.engagementId === 'cowboy')!
  assert.equal(cowboy.repos[0].fullName, 'jacobholtzer22-droid/Christian-Cowboy-Spray-Foam')
  assert.equal(cowboy.projects[0].id, 'prj_cowboy-spray-foam')
  assert.equal(cowboy.projects[0].score, 1, 'git link to the top repo makes the project certain')
  assert.ok(cowboy.repos.every((r) => r.fullName !== 'jacobholtzer22-droid/Prestige-Blinds'), 'a repo another client holds is never offered')
  assert.ok(!out.some((x) => x.engagementId === 'prestige'), 'fully linked clients are not listed')

  // T&M matched its repo by slug but has no Vercel project: listed with projects only.
  const tm = out.find((x) => x.engagementId === 'tm')!
  assert.equal(tm.repos.length, 0)
  assert.equal(tm.linked.repoUrl, 'https://github.com/jacobholtzer22-droid/T-M-Spray-Foam')
})

test('suggestLinks: no candidate below the floor, and websiteOnly filters', () => {
  const d: Discovery = { repos: [repo('Prestige-Blinds', { siteSlug: 'prestige-blinds' })], projects: [project('prestige-blinds')], errors: [] }
  const engs = [eng('x', 'Big Bear Truck Repair'), eng('y', 'Ads only client')]
  const m = matchDiscovery(engs, d)
  const out = suggestLinks(engs, d, m, { websiteOnly: new Set(['x']) })
  assert.equal(out.length, 1)
  assert.equal(out[0].repos.length, 0)
  assert.equal(out[0].projects.length, 0)
})
