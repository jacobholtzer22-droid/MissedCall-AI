// ===========================================
// POST /api/admin/pipeline/person/notes — append a note, optionally log a contact
// ===========================================
// Append-only. There is deliberately no PUT or DELETE anywhere for
// PipelineNote: the log is the history of what was said to whom and when.
//
// Body: { key, body?, logContact?, nextFollowUpAt? }
//   logContact true  → stamps lastContactedAt = now; the note (if any) is kind
//                      "contact". A contact with no text is still logged.
//   logContact false → plain note, body required, lastContactedAt untouched.
//   nextFollowUpAt   → only honoured with logContact, so "called, try again
//                      Friday" is one tap. Omit to leave it as it is.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loadPerson, requireAdmin } from '@/lib/pipeline-server'

export const dynamic = 'force-dynamic'

const MAX_TEXT = 4000

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const input = (await request.json()) as { key?: unknown; body?: unknown; logContact?: unknown; nextFollowUpAt?: unknown }
    const key = typeof input.key === 'string' ? input.key.trim() : ''
    const text = typeof input.body === 'string' ? input.body.trim().slice(0, MAX_TEXT) : ''
    const logContact = input.logContact === true
    if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
    if (!logContact && !text) return NextResponse.json({ error: 'Note is empty' }, { status: 400 })

    let nextFollowUpAt: Date | null | undefined
    if (logContact && input.nextFollowUpAt !== undefined) {
      if (input.nextFollowUpAt === null || input.nextFollowUpAt === '') nextFollowUpAt = null
      else if (typeof input.nextFollowUpAt === 'string' && !isNaN(Date.parse(input.nextFollowUpAt))) {
        nextFollowUpAt = new Date(input.nextFollowUpAt)
      } else return NextResponse.json({ error: 'Invalid nextFollowUpAt' }, { status: 400 })
    }

    const found = await loadPerson(key)
    if (!found) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const { businessId } = found

    const contact = logContact
      ? { lastContactedAt: new Date(), ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}) }
      : {}
    await db.$transaction(async (tx) => {
      const rec = await tx.pipelinePerson.upsert({
        where: { businessId_personKey: { businessId, personKey: key } },
        create: { businessId, personKey: key, ...contact },
        update: contact,
      })
      if (text) await tx.pipelineNote.create({ data: { personId: rec.id, body: text, kind: logContact ? 'contact' : 'note' } })
    })
    console.log(`[admin/pipeline] person ${key} ${logContact ? 'contact logged' : 'note added'}`)

    const refreshed = await loadPerson(key)
    return NextResponse.json({ person: refreshed?.person ?? null })
  } catch (err) {
    console.error('[admin/pipeline] note failed:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
