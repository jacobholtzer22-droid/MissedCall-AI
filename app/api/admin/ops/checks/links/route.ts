// ===========================================
// ADMIN: LINK CLIENTS TO THEIR REPO AND VERCEL PROJECT
// ===========================================
// GET  /api/admin/ops/checks/links[?refresh=1]
//      Every website client missing a repo or a Vercel project, each with its
//      ranked candidates, plus the full unmatched repo and project lists for a
//      manual pick. Read only; cached 10 minutes (lib/ops/checks/link.ts).
// POST /api/admin/ops/checks/links
//      { engagementId, repo?, project? }  The confirmed link. Verifies both,
//      writes the website deliverable's evidence, logs it, reruns that
//      client's web checks. Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/pipeline-server'
import { linkSite, loadLinkSuggestions } from '@/lib/ops/checks/link'
import { BadRequest, nullableString, readJsonObject, rejectUnknownKeys } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json(await loadLinkSuggestions({ refresh: request.nextUrl.searchParams.get('refresh') === '1' }))
  } catch (err) {
    console.error('[admin/ops/checks/links] GET failed:', err)
    return NextResponse.json({ error: 'Could not load link suggestions', detail: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    rejectUnknownKeys(body, ['engagementId', 'repo', 'project'])
    const engagementId = nullableString(body.engagementId, 'engagementId', 64)
    if (!engagementId) throw new BadRequest('engagementId is required')
    const result = await linkSite({
      engagementId,
      repo: nullableString(body.repo, 'repo', 300),
      project: nullableString(body.project, 'project', 200),
      by: 'jacob',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/checks/links] POST failed:', err)
    return NextResponse.json({ error: 'Link failed', detail: String(err) }, { status: 500 })
  }
}
