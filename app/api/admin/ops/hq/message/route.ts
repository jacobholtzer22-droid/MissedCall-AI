// ===========================================
// POST /api/admin/ops/hq/message: Jacob says something to the chief
// ===========================================
// Body { body?, attachments? } (lib/ops/photo-filing parseChatMessage): text,
// photos already uploaded to Blob under ops-inbox/, or both. Saves the message, starts the chief's run and answers at once
// with { messageId, runId }; the run continues with waitUntil and streams into
// the feed. The chief's reply arrives as an OpsMessage on the feed.
// More than BATCH_THRESHOLD photos: the message gets a job and the Photo desk
// starts captioning them alongside the chief; when it ends the chief is woken
// (lib/ops/hq/jobs) to file them.

import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/pipeline-server'
import { runChief, startChiefRun } from '@/lib/ops/hq/chief'
import { runPhotoRun, startPhotoRun } from '@/lib/ops/hq/photo'
import { InvalidAttachments, isBatch, parseChatMessage } from '@/lib/ops/photo-filing'
import { BadRequest, readJsonObject } from '@/lib/ops/validate'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = readJsonObject(await request.json())
    const { text, attachments } = parseChatMessage(body)

    const prompt = text || `(${attachments.length} photo${attachments.length === 1 ? '' : 's'}, no text)`
    const batch = isBatch(attachments.length)
    const job = batch ? await db.opsJob.create({ data: { prompt, status: 'running', engagementIds: [] } }) : null
    const message = await db.opsMessage.create({
      data: { role: 'jacob', body: text, jobId: job?.id ?? null, ...(attachments.length ? { attachments: attachments as unknown as Prisma.InputJsonValue } : {}) },
    })
    if (job) {
      // Another photo run already captioning: these wait; the chief can start caption_photos later.
      const photo = await startPhotoRun({ jobId: job.id, urls: attachments.map((a) => a.url), messageId: message.id }).catch((err) => {
        console.error('[admin/ops/hq/message] photo run not started:', err instanceof Error ? err.message : err)
        // No run to wait for: the job would stay open. The chief's turn reopens it if it delegates.
        return db.opsJob.update({ where: { id: job.id }, data: { status: 'done' } }).then(() => null)
      })
      if (photo) waitUntil(runPhotoRun(photo.run.id))
    }
    const run = await startChiefRun(message.id, prompt, job?.id ?? null)
    waitUntil(runChief(run.id))
    return NextResponse.json({ messageId: message.id, runId: run.id })
  } catch (err) {
    if (err instanceof BadRequest || err instanceof InvalidAttachments) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[admin/ops/hq/message] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
