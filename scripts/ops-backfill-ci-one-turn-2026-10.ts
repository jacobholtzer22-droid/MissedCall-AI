// One-off: copy AA-Template 9379175's aa-build.yml and AGENT.md CI section
// into the provisioned client repos, on their default branch, the way the
// Oct 2026 URL workflow was copied (ops-backfill-dispatch-workflow-2026-10.ts).
// TEMPLATE_REF still pins the template sync to an older commit, so the sync
// would not carry this.
//
// 9379175: CI is one turn (no subagents, Task and Agent denied), caption-led
// alt text for big photo sets, no deleting an original before its references,
// stale reports removed before the agent runs, a red gate or a missing report
// sent as status failure with verify_tail, and a site_update based on the open
// build PR branch while main is still the template sample.
//
// The workflow is replaced only when the repo's copy is exactly some earlier
// AA-Template version (KNOWN_BLOBS), so a hand-edited workflow is reported and
// left alone. AGENT.md: only the text between the template-owned:ci markers is
// replaced (replaceSection); a file without the markers is reported.
//
//   npx tsx --env-file=.env.local scripts/ops-backfill-ci-one-turn-2026-10.ts          dry (default)
//   npx tsx --env-file=.env.local scripts/ops-backfill-ci-one-turn-2026-10.ts --live   write

import { createHash } from 'node:crypto'
import { GITHUB_OWNER, TEMPLATE_REPO, getFileContent, getRepo, putFile } from '@/lib/ops/github'
import { WORKFLOW_PATH } from '@/lib/ops/agents/shared'
import { DEFAULT_TEMPLATE_OWNED, replaceSection } from '@/lib/ops/template-owned'

const REPOS = ['AA-YualexPainting', 'AA-OneUnitedConstruction', 'KA-Lights', 'Anthony-Lonestar']
const TEMPLATE_COMMIT = '93791751efc85f443124a9d40046abde9e31e3c8'
const MESSAGE = 'ci: aa-build is one turn and reports a red gate as failed (AA-Template 9379175)'
/** git blob shas of every earlier AA-Template aa-build.yml (git log -- .github/workflows/aa-build.yml). */
const KNOWN_BLOBS = new Set([
  '55bed6bc69f3c449b6b2c6b8954117c7cdd6a280', // ed5475e
  '92d850d0d9ab175e1f4a4217525c5026778ecd9e', // de5f447
  '928456b5d6a8318ace1f07586d8710ea92c82378', // 581a817
  'efbf1b1be4d4cb8d68cf989d9aa0690768d516fd', // ef98347
  'dc05c0958e0d2b574aaae0c2dade71ae69809a2f', // 3464b60
  '842963bc0a6e2df29b557215c994c9cf6c2cfef6', // 6b2c39e
  '0da897f0d13d78204de364e7588b077a8419716d', // 24cc317
  'ce1c7eee7b28d685e67325f2156ca05763788bdc', // 4ce6be4
  'ca990e23a1cd38ff657101b6d2552b18a11a8455', // 9ecf77b
  'd77ad4da9bc1e573f2b26c4fe0348fbeac6f99f0', // fd50081
  '92aadfc5764adbc04a6b6298891a14118d0f33c0', // 5aee24d
])

const blobSha = (text: string) => {
  const buf = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

async function main() {
  const live = process.argv.includes('--live')
  const template = `${GITHUB_OWNER}/${TEMPLATE_REPO}`
  const nextWorkflow = await getFileContent(template, WORKFLOW_PATH, TEMPLATE_COMMIT)
  const templateAgent = await getFileContent(template, 'AGENT.md', TEMPLATE_COMMIT)
  if (!nextWorkflow?.includes('"Task" "Agent"')) throw new Error(`template ${TEMPLATE_COMMIT} ${WORKFLOW_PATH} is not the one-turn workflow`)
  if (!templateAgent?.includes('One turn. The run ends when you stop.')) throw new Error(`template ${TEMPLATE_COMMIT} AGENT.md has no one-turn rule`)
  const section = DEFAULT_TEMPLATE_OWNED.sections.find((s) => s.file === 'AGENT.md')!
  console.log(`${live ? 'LIVE' : 'DRY'}: from AA-Template ${TEMPLATE_COMMIT.slice(0, 7)}`)

  for (const name of REPOS) {
    const repo = `${GITHUB_OWNER}/${name}`
    try {
      const info = await getRepo(repo)
      if (!info) { console.log(`  ${name}: SKIP, repo not found`); continue }
      const branch = info.defaultBranch

      const current = await getFileContent(repo, WORKFLOW_PATH, branch)
      const sha = current ? blobSha(current) : null
      if (current === nextWorkflow) console.log(`  ${name}: workflow already current`)
      else if (!sha || !KNOWN_BLOBS.has(sha)) console.log(`  ${name}: workflow SKIP, ${sha?.slice(0, 7) ?? 'missing'} is not a template version; port by hand`)
      else if (!live) console.log(`  ${name}: would update ${WORKFLOW_PATH} on ${branch} (${sha.slice(0, 7)} -> ${blobSha(nextWorkflow).slice(0, 7)})`)
      else console.log(`  ${name}: workflow updated on ${branch}, commit ${await putFile(repo, WORKFLOW_PATH, nextWorkflow, MESSAGE, branch)}`)

      let agent = await getFileContent(repo, 'AGENT.md', branch)
      if (!agent) { console.log(`  ${name}: AGENT.md SKIP, missing`); continue }
      // KA-Lights and Anthony-Lonestar carry the end marker but not the start
      // one. The section starts at its heading, as in the template: add the
      // start marker there when the heading occurs exactly once, before the end.
      const heading = '\nNon-interactive (CI) mode\n'
      if (!agent.includes(section.start) && agent.includes(section.end) && agent.split(heading).length === 2 && agent.indexOf(heading) < agent.indexOf(section.end)) {
        agent = agent.replace(heading, `\n${section.start}${heading}`)
        console.log(`  ${name}: AGENT.md had no start marker; placed it before "Non-interactive (CI) mode"`)
      }
      const r = replaceSection(agent, templateAgent, section.start, section.end)
      if (r.status === 'same') console.log(`  ${name}: AGENT.md CI section already current`)
      else if (r.status !== 'replaced') console.log(`  ${name}: AGENT.md SKIP, ${r.status}; port by hand`)
      else if (!live) console.log(`  ${name}: would replace AGENT.md's CI section on ${branch}`)
      else console.log(`  ${name}: AGENT.md CI section updated on ${branch}, commit ${await putFile(repo, 'AGENT.md', r.text, MESSAGE, branch)}`)
    } catch (err) {
      console.log(`  ${name}: ERROR ${err instanceof Error ? err.message : err}`)
    }
  }
}

main()
