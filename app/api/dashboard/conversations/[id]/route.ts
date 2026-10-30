// ===========================================
// DELETE /api/dashboard/conversations/[id]: client soft delete of a missed-call lead
// ===========================================
// Stamps deletedAt so the lead leaves the Leads page
// (GET /api/dashboard/conversations?view=leads) until the caller texts in again.
// Never a hard delete and no status change: the Conversations tab and /admin
// still show the thread, and the SMS system does not read deletedAt. Scoped to the caller's own business,
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
