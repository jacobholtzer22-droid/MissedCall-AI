// ===========================================
// Ops HQ: the photo inbox (server only)
// ===========================================
// Every unfiled photo Jacob dropped in the chat, across messages, plus blobs
// under ops-inbox/ that no message mentions (a drop whose send failed). The
// rules live in lib/ops/photo-filing (collectInbox); this reads the rows and
// Blob, adopts unsent blobs onto a message so they can carry captions, and
// writes onto a message's attachments under a row lock, so the photo run's
// captions and file_photos' filedTo never overwrite each other.

import { Prisma } from '@prisma/client'
import { list } from '@vercel/blob'
import { db } from '@/lib/db'
import { INBOX_MAX_AGE_DAYS, INBOX_PREFIX, applyCaptions, collectInbox, readAttachments, type ChatAttachment, type InboxEntry, type PhotoCaption } from '@/lib/ops/photo-filing'

/** Jacob's messages with attachments from the last INBOX_MAX_AGE_DAYS. */
export async function inboxMessages() {
  const since = new Date(Date.now() - INBOX_MAX_AGE_DAYS * 86_400_000)
  const rows = await db.opsMessage.findMany({
    where: { role: 'jacob', createdAt: { gte: since }, attachments: { not: Prisma.DbNull } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, createdAt: true, attachments: true },
  })
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, attachments: readAttachments(r.attachments) }))
}

async function inboxBlobs() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return []
  const out: { url: string; pathname: string; size: number; uploadedAt: Date }[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: INBOX_PREFIX, cursor, limit: 1000 })
    out.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return out
}

/** Every unfiled photo, oldest drop first, unsent blobs last. Read only. */
export async function listInbox(): Promise<InboxEntry[]> {
  const [messages, blobs] = await Promise.all([inboxMessages(), inboxBlobs()])
  return collectInbox(messages, blobs)
}

/** Read-modify-write one message's attachments under a row lock. */
export async function updateAttachments(messageId: string, change: (list: ChatAttachment[]) => ChatAttachment[]) {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ attachments: unknown }[]>`SELECT "attachments" FROM "OpsMessage" WHERE "id" = ${messageId} FOR UPDATE`
    if (!rows.length) return
    const next = change(readAttachments(rows[0].attachments))
    await tx.opsMessage.update({ where: { id: messageId }, data: { attachments: next as unknown as Prisma.InputJsonValue } })
  })
}

/**
 * Put unsent blobs on one message of Jacob's, dated when the first was
 * uploaded (so it sits where the drop happened and expires with the blobs).
 * Returns the entries with their new messageId.
 */
export async function adoptUnsent(entries: InboxEntry[]): Promise<InboxEntry[]> {
  const unsent = entries.filter((e) => !e.messageId)
  if (!unsent.length) return entries
  const attachments: ChatAttachment[] = unsent.map((e) => ({ url: e.url, filename: e.filename, width: e.width, height: e.height, bytes: e.bytes }))
  const message = await db.opsMessage.create({
    data: {
      role: 'jacob',
      body: `(${unsent.length} photo${unsent.length === 1 ? '' : 's'} uploaded here but never sent)`,
      createdAt: new Date(unsent[0].uploadedAt),
      attachments: attachments as unknown as Prisma.InputJsonValue,
    },
  })
  return entries.map((e) => (e.messageId ? e : { ...e, messageId: message.id }))
}

/** Save captions by url onto every message that carries those photos. */
export async function writeCaptions(captions: Map<string, PhotoCaption>) {
  const messages = await inboxMessages()
  const touched = messages.filter((m) => m.attachments.some((a) => captions.has(a.url)))
  for (const m of touched) await updateAttachments(m.id, (list) => applyCaptions(list, captions))
}
