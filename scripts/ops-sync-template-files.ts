/**
 * Template-owned files into client repos (lib/ops/agents/sync-template-files.ts).
 *
 * --dry   READ ONLY. Lists each website repo and which template-owned files
 *         differ from AA-Template; writes nothing. The default.
 * --open  Opens a chore/template-sync PR per repo that differs. Never commits
 *         to a default branch. Only on Jacob's word.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ops-sync-template-files.ts --dry
 *
 * Requires: DATABASE_URL, GITHUB_OPS_TOKEN (read by name).
 */

import { db } from '@/lib/db'
import { syncTemplateFiles } from '@/lib/ops/agents/sync-template-files'

const open = process.argv.includes('--open')
if (!open && !process.argv.includes('--dry')) {
  console.error('Pass --dry (read only) or --open.')
  process.exit(1)
}

async function main() {
  const r = await syncTemplateFiles({ dry: !open })
  console.log(`${r.dry ? 'DRY RUN, read only' : 'OPEN PRS'} against ${r.ref}; file list: ${r.listSource}`)
  if (r.blocked.length) console.log(`blocked: ${r.blocked.join('; ')}`)
  for (const x of r.repos.sort((a, b) => a.engagement.localeCompare(b.engagement))) {
    console.log(`== ${x.engagement} (${x.repo})`)
    console.log(`   differs   ${x.changes.length ? x.changes.join(', ') : 'nothing'}`)
    if (x.notes.length) console.log(`   notes     ${x.notes.join('; ')}`)
    if (x.prUrl) console.log(`   PR        ${x.prUrl}`)
    if (x.errors.length) console.log(`   error     ${x.errors.join('; ')}`)
  }
  for (const s of r.skipped) console.log(`-- skipped ${s.engagement}: ${s.reason}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
