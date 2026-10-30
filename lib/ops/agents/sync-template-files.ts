// ===========================================
// /admin/ops agents: keep template-owned files in client repos current
// ===========================================
// AA-Template's TEMPLATE-OWNED.json (lib/ops/template-owned.ts; the default
// list stands in while the template lacks it) names the files a client repo's
// agent may never edit in CI, and marked sections of shared files (AGENT.md's
// CI section). For every website deliverable with evidence.repoUrl, each file
// on the repo's default branch is compared with AA-Template at TEMPLATE_REF.
//
//   dry (default)  lists each repo and which files differ; writes nothing
//   real           commits the template versions to branch chore/template-sync
//                  and opens a PR into the default branch; never commits to
//                  the default branch itself
//
// Only repos built from AA-Template are synced (they carry site.config.ts and
// lib/config-schema.ts); a hand-built site is reported and left alone, since
// the template's next.config.mjs or schema would break a different codebase.
// A deliverable with evidence.handBuilt === true is skipped outright: its repo
// started from the template but its template-owned files were extended by hand
// (Titan's schema and hero scrim), so template changes are ported in by hand.
// A client file without the section markers is reported and left alone.
// components/ContactForm.tsx and its checksum are never synced. Three repos
// at a time.

import { db } from '@/lib/db'
import { GITHUB_OWNER, TEMPLATE_REPO, createBranchFromDefault, getFileContent, getRepo, openPullRequest, putFile, repoFullName } from '@/lib/ops/github'
import { mapLimited } from '@/lib/ops/checks/limit'
import { DEFAULT_TEMPLATE_OWNED, parseTemplateOwned, replaceSection, type TemplateOwned } from '@/lib/ops/template-owned'
import { TEMPLATE_REF, asObject } from './shared'

export const TEMPLATE_SYNC_BRANCH = 'chore/template-sync'
const OWNED_FILE = 'TEMPLATE-OWNED.json'

export type TemplateSyncRepo = {
  engagement: string
  repo: string
  /** Files whose template version differs (missing in the repo counts). */
  changes: string[]
  /** Files and sections that need nothing, or were left alone, with why. */
  notes: string[]
  prUrl?: string
  errors: string[]
}

export type TemplateSyncResult = {
  dry: boolean
  ref: string
  /** Where the file list came from. */
  listSource: string
  owned: TemplateOwned
  blocked: string[]
  repos: TemplateSyncRepo[]
  skipped: { engagement: string; reason: string }[]
}

export async function syncTemplateFiles(opts: { only?: string[]; dry: boolean }): Promise<TemplateSyncResult> {
  const template = `${GITHUB_OWNER}/${TEMPLATE_REPO}`
  const parsed = parseTemplateOwned(await getFileContent(template, OWNED_FILE, TEMPLATE_REF))
  const owned = parsed ?? DEFAULT_TEMPLATE_OWNED
  const out: TemplateSyncResult = {
    dry: opts.dry,
    ref: TEMPLATE_REF,
    listSource: parsed ? `${template} ${OWNED_FILE} on ${TEMPLATE_REF}` : `default list (${template} has no ${OWNED_FILE} on ${TEMPLATE_REF})`,
    owned,
    blocked: [],
    repos: [],
    skipped: [],
  }
  if (!process.env.GITHUB_OPS_TOKEN?.trim()) out.blocked.push('GITHUB_OPS_TOKEN is not set')

  // The template's own copies, read once.
  const paths = Array.from(new Set([...owned.files, ...owned.sections.map((s) => s.file)]))
  const templateText = new Map<string, string | null>()
  await mapLimited(paths, 4, async (p) => templateText.set(p, await getFileContent(template, p, TEMPLATE_REF)))

  const rows = await db.deliverable.findMany({
    where: { type: 'website', ...(opts.only?.length ? { engagementId: { in: opts.only } } : {}) },
    select: { evidence: true, engagement: { select: { displayName: true, stage: true } } },
  })
  const targets = rows.filter((d) => {
    const ev = asObject(d.evidence)
    const name = d.engagement.displayName.trim()
    if (d.engagement.stage === 'ignored') return false
    if (ev.handBuilt === true) {
      out.skipped.push({ engagement: name, reason: 'hand-built (evidence.handBuilt)' })
      return false
    }
    if (typeof ev.repoUrl !== 'string' || !ev.repoUrl) {
      out.skipped.push({ engagement: name, reason: 'no evidence.repoUrl' })
      return false
    }
    if (repoFullName(ev.repoUrl) === template) {
      out.skipped.push({ engagement: name, reason: 'is the template' })
      return false
    }
    return true
  })

  out.repos = await mapLimited(targets, 3, async (d) => {
    const repo = repoFullName(String(asObject(d.evidence).repoUrl))
    const r: TemplateSyncRepo = { engagement: d.engagement.displayName.trim(), repo, changes: [], notes: [], errors: [] }
    try {
      const info = await getRepo(repo)
      if (!info) throw new Error('repo not found or not accessible')
      const [siteConfig, schema] = await Promise.all([getFileContent(repo, 'site.config.ts', info.defaultBranch), getFileContent(repo, 'lib/config-schema.ts', info.defaultBranch)])
      if (siteConfig === null || schema === null) {
        r.notes.push(`not an ${TEMPLATE_REPO} site (no ${siteConfig === null ? 'site.config.ts' : 'lib/config-schema.ts'}), skipped`)
        return r
      }
      const writes: { path: string; content: string }[] = []

      for (const path of owned.files) {
        const want = templateText.get(path) ?? null
        if (want === null) {
          r.notes.push(`${path}: not in the template, skipped`)
          continue
        }
        const have = await getFileContent(repo, path, info.defaultBranch)
        if (have === want) continue
        r.changes.push(have === null ? `${path} (missing)` : path)
        writes.push({ path, content: want })
      }

      for (const sec of owned.sections) {
        const want = templateText.get(sec.file) ?? null
        const label = sec.file === 'AGENT.md' ? 'AGENT.md CI section' : `${sec.file} section`
        if (want === null) {
          r.notes.push(`${label}: not in the template, skipped`)
          continue
        }
        const have = await getFileContent(repo, sec.file, info.defaultBranch)
        if (have === null) {
          r.notes.push(`${label}: the repo has no ${sec.file}, skipped`)
          continue
        }
        const res = replaceSection(have, want, sec.start, sec.end)
        if (res.status === 'replaced') {
          r.changes.push(label)
          writes.push({ path: sec.file, content: res.text })
        } else if (res.status === 'no-markers-client') r.notes.push(`${label}: no markers, skipped`)
        else if (res.status === 'no-markers-template') r.notes.push(`${label}: the template has no markers yet, skipped`)
      }

      if (opts.dry || out.blocked.length > 0 || writes.length === 0) return r

      await createBranchFromDefault(repo, TEMPLATE_SYNC_BRANCH)
      for (const w of writes) await putFile(repo, w.path, w.content, `chore: sync ${w.path} from ${TEMPLATE_REPO}`, TEMPLATE_SYNC_BRANCH)
      const pr = await openPullRequest(
        repo,
        TEMPLATE_SYNC_BRANCH,
        info.defaultBranch,
        'chore: sync template-owned files',
        `Brings the files ${TEMPLATE_REPO} owns up to ${TEMPLATE_REF} (${out.listSource}):\n\n${r.changes.map((c) => `- ${c}`).join('\n')}\n\nThe site's own files (site.config.ts, content, components/ContactForm.tsx) are untouched. Run \`npm run verify\` on the preview before merging.`
      )
      r.prUrl = pr.url
    } catch (err) {
      r.errors.push(err instanceof Error ? err.message : String(err))
    }
    return r
  })
  return out
}
