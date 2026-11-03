// One-off: add AA-Template main's aa-build.yml and the AGENT.md CI section to client repos missing the workflow (dry by default, --live writes).
// Secrets are not set here; seal them from the Ops UI with Reseal secrets.

import { db } from '@/lib/db'
import { GITHUB_OWNER, TEMPLATE_REPO, getFileContent, getRepo, putFile } from '@/lib/ops/github'
import { WORKFLOW_PATH } from '@/lib/ops/agents/shared'
import { DEFAULT_TEMPLATE_OWNED } from '@/lib/ops/template-owned'

const SKIP = new Set(['KA-Lights']) // reconcile pending
const MESSAGE = 'ci: add the aa-build workflow and AGENT.md CI section (AA-Template main)'
const HEADING = 'Non-interactive (CI) mode'

async function main() {
  const live = process.argv.includes('--live')
  const template = `${GITHUB_OWNER}/${TEMPLATE_REPO}`
  const workflow = await getFileContent(template, WORKFLOW_PATH, 'main')
  const templateAgent = await getFileContent(template, 'AGENT.md', 'main')
  const { start, end } = DEFAULT_TEMPLATE_OWNED.sections.find((s) => s.file === 'AGENT.md')!
  const a = templateAgent?.indexOf(start) ?? -1
  const b = templateAgent?.indexOf(end) ?? -1
  if (!workflow) throw new Error(`template main has no ${WORKFLOW_PATH}`)
  if (a === -1 || b < a) throw new Error('template main AGENT.md has no template-owned:ci section')
  const section = templateAgent!.slice(a, b + end.length)
  console.log(`${live ? 'LIVE' : 'DRY'}: from AA-Template main`)

  const sites = await db.deliverable.findMany({ where: { type: 'website' }, select: { evidence: true, engagement: { select: { displayName: true, stage: true } } } })
  const repos = new Map<string, string>()
  for (const s of sites) {
    const url = String((s.evidence as Record<string, unknown> | null)?.repoUrl ?? '')
    const m = url.match(/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/)
    if (m) repos.set(m[2], `${s.engagement.displayName.trim()} (${s.engagement.stage})`)
    else console.log(`  ${s.engagement.displayName.trim()}: no repoUrl on the website deliverable, not checked`)
  }

  const missing: string[] = []
  for (const [name, client] of Array.from(repos).sort()) {
    const repo = `${GITHUB_OWNER}/${name}`
    try {
      const info = await getRepo(repo)
      if (!info) { console.log(`  ${name} [${client}]: repo not found`); continue }
      const branch = info.defaultBranch
      if (await getFileContent(repo, WORKFLOW_PATH, branch)) { console.log(`  ${name}: has workflow`); continue }
      if (SKIP.has(name)) { console.log(`  ${name} [${client}]: MISSING workflow, skipped (reconcile pending)`); continue }
      const agent = await getFileContent(repo, 'AGENT.md', branch)
      // No AGENT.md: not an AA-Template site, so the workflow has nothing to run.
      if (!agent) { console.log(`  ${name} [${client}]: MISSING workflow, skipped (no AGENT.md, not a template site)`); continue }
      missing.push(name)
      let agentPlan: string
      if (agent.includes(start) || agent.includes(end) || agent.includes(HEADING)) agentPlan = 'AGENT.md already has a CI section or marker, left alone'
      else agentPlan = 'append CI section'

      if (!live) { console.log(`  ${name} [${client}]: MISSING workflow on ${branch}; would add it; AGENT.md: ${agentPlan}`); continue }
      console.log(`  ${name}: workflow added on ${branch}, commit ${await putFile(repo, WORKFLOW_PATH, workflow, MESSAGE, branch)}`)
      if (agentPlan === 'append CI section') {
        const next = `${agent!.replace(/\s*$/, '')}\n\n${section}\n`
        console.log(`  ${name}: AGENT.md CI section appended, commit ${await putFile(repo, 'AGENT.md', next, MESSAGE, branch)}`)
      } else console.log(`  ${name}: ${agentPlan}`)
    } catch (err) {
      console.log(`  ${name}: ERROR ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`${missing.length} repo(s) ${live ? 'written' : 'to write'}: ${missing.join(', ') || 'none'}`)
}

main().finally(() => db.$disconnect())
