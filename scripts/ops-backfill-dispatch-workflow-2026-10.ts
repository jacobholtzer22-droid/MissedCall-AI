// One-off: copy the URL-reading aa-build.yml into already-provisioned client
// repos, on their default branch, the way the Oct 25 workflow fix was copied.
// A repo is updated only when its current aa-build.yml is exactly FROM_BLOB
// (AA-Template main before the change), so a hand-edited workflow is reported
// and left alone. Titan is not in the list (hand-built).
//
//   npx tsx scripts/ops-backfill-dispatch-workflow-2026-10.ts          dry (default)
//   npx tsx scripts/ops-backfill-dispatch-workflow-2026-10.ts --live   write
//
// Needs GITHUB_OPS_TOKEN (node --env-file=.env.local).

import { createHash } from 'node:crypto'
import { GITHUB_OWNER, TEMPLATE_REPO, getFileContent, getRepo, putFile } from '@/lib/ops/github'
import { URL_MARKER } from '@/lib/ops/agents/dispatch-payload'
import { WORKFLOW_PATH } from '@/lib/ops/agents/shared'

const REPOS = ['AA-YualexPainting', 'AA-OneUnitedConstruction', 'KA-Lights', 'Anthony-Lonestar']
/** AA-Template's branch fix/dispatch-assets-manifest: main's workflow plus the URL fetch. */
const TEMPLATE_COMMIT = '581a8177f4685480caf9531c8f76ac21cd08f8b2'
/** git blob sha of AA-Template main's aa-build.yml (ef98347), what the repos run today. */
const FROM_BLOB = 'efbf1b1be4d4cb8d68cf989d9aa0690768d516fd'
const MESSAGE = 'ci: aa-build fetches assets, GBP and extras by URL (AA-Template 581a817)'

const blobSha = (text: string) => {
  const buf = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

async function main() {
  const live = process.argv.includes('--live')
  const next = await getFileContent(`${GITHUB_OWNER}/${TEMPLATE_REPO}`, WORKFLOW_PATH, TEMPLATE_COMMIT)
  if (!next?.includes(URL_MARKER)) throw new Error(`template ${TEMPLATE_COMMIT} has no ${URL_MARKER} in ${WORKFLOW_PATH}`)
  console.log(`${live ? 'LIVE' : 'DRY'}: ${WORKFLOW_PATH} from AA-Template ${TEMPLATE_COMMIT.slice(0, 7)} (${next.length} chars, blob ${blobSha(next).slice(0, 7)})`)
  for (const name of REPOS) {
    const repo = `${GITHUB_OWNER}/${name}`
    try {
      const info = await getRepo(repo)
      if (!info) { console.log(`  ${name}: SKIP, repo not found`); continue }
      const current = await getFileContent(repo, WORKFLOW_PATH, info.defaultBranch)
      const sha = current ? blobSha(current) : null
      if (current && current === next) { console.log(`  ${name}: already current`); continue }
      if (sha !== FROM_BLOB) { console.log(`  ${name}: SKIP, its aa-build.yml is ${sha?.slice(0, 7) ?? 'missing'}, not template main ${FROM_BLOB.slice(0, 7)}; port by hand`); continue }
      if (!live) { console.log(`  ${name}: would update ${WORKFLOW_PATH} on ${info.defaultBranch} (${FROM_BLOB.slice(0, 7)} -> ${blobSha(next).slice(0, 7)})`); continue }
      const commit = await putFile(repo, WORKFLOW_PATH, next, MESSAGE, info.defaultBranch)
      console.log(`  ${name}: updated on ${info.defaultBranch}, commit ${commit}`)
    } catch (err) {
      console.log(`  ${name}: ERROR ${err instanceof Error ? err.message : err}`)
    }
  }
}

main()
