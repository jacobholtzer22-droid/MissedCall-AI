// ===========================================
// DELETE /api/dashboard/conversations/[id]: client soft delete of a missed-call lead
// ===========================================
// Stamps deletedAt so the thread leaves GET /api/dashboard/conversations and the
// Leads page. Never a hard delete and no status change: /admin still shows it,
// and if the caller texts again the SMS webhook handles the thread exactly as
// before (it does not read deletedAt). Scoped to the caller's own business,
// like the GET. 403 for another business's thread, 404 for an unknown id, 200
// again on a repeat delete.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { softDelete } from '../../lead-delete'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const out = await softDelete(
    {
      find: async (id) => {
        const convo = await db.conversation.findUnique({ where: { id }, select: { businessId: true, deletedAt: true } })
        return convo ? { businessId: convo.businessId, deleted: convo.deletedAt !== null } : null
      },
      markDeleted: async (id) => {
        await db.conversation.update({ where: { id }, data: { deletedAt: new Date() } })
      },
    },
    params.id,
    [business.id]
  )

  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ success: true, alreadyDeleted: out.alreadyDeleted })
}
