// ===========================================
// DELETE /api/dashboard/website-leads/[id]: client soft delete
// ===========================================
// Sets status 'deleted'. Never a hard delete: the row stays for /admin, the spam
// audit and the funnel. Owner-group scoped like the PATCH. 403 for another
// business's lead, 404 for an unknown id, 200 again on a repeat delete.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { getOwnerGroupBusinesses } from '@/lib/owner-group'
import { softDelete } from '../../lead-delete'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const group = await getOwnerGroupBusinesses(business)
  const out = await softDelete(
    {
      find: async (id) => {
        const lead = await db.websiteLead.findUnique({ where: { id }, select: { businessId: true, status: true } })
        return lead ? { businessId: lead.businessId, deleted: lead.status === 'deleted' } : null
      },
      markDeleted: async (id) => {
        await db.websiteLead.update({ where: { id }, data: { status: 'deleted' } })
      },
    },
    params.id,
    group.map((b) => b.id)
  )

  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ success: true, alreadyDeleted: out.alreadyDeleted })
}
