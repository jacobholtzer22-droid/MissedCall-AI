// ===========================================
// DASHBOARD: DELETE VOICEMAIL
// ===========================================
// DELETE /api/dashboard/voicemails/[id]
// Clears recordingUrl and voicemailTranscription on the Conversation
// without deleting the conversation record itself.

import { NextResponse } from 'next/server'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { db } from '@/lib/db'

export async function DELETE(
  _request: Request,
  context: { params: { id: string } },
) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult
  const { id } = context.params

  const conversation = await db.conversation.findFirst({
    where: {
      id,
      businessId: business.id,
      recordingUrl: { not: null },
    },
    select: { id: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Voicemail not found' }, { status: 404 })
  }

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      recordingUrl: null,
      voicemailTranscription: null,
    },
  })

  return NextResponse.json({ success: true })
}
