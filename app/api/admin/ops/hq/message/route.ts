// ===========================================
// POST /api/admin/ops/hq/message: Jacob says something to the chief
// ===========================================
// Body { body?, attachments? } (lib/ops/photo-filing parseChatMessage): text,
// photos already uploaded to Blob under ops-inbox/, or both. Saves the message, starts the chief's run and answers at once
// with { messageId, runId }; the run continues with waitUntil and streams into
// the feed. The chief's reply arrives as an OpsMessage on the feed.

import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { runChief, startChiefRun } from '@/lib/ops/hq/chief'
import { InvalidAttachments, parseChatMessage } from '@/lib/ops/photo-filing'
import { BadRequest, readJsonObject } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    const { text, attachments } = parseChatMessage(body)

    const message = await db.opsMessage.create({
      data: { role: 'jacob', body: text, ...(attachments.length ? { attachments: attachments as unknown as Prisma.InputJsonValue } : {}) },
    })
    const run = await startChiefRun(message.id, text || `(${attachments.length} photo${attachments.length === 1 ? '' : 's'}, no text)`)
    waitUntil(runChief(run.id))
    return NextResponse.json({ messageId: message.id, runId: run.id })
  } catch (err) {
    if (err instanceof BadRequest || err instanceof InvalidAttachments) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/hq/message] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
