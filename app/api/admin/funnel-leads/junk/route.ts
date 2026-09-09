// ===========================================
// POST /api/admin/funnel-leads/junk — mark a lead as not a contractor
// ===========================================
// The only mutation on the funnel-leads surface, and deliberately a narrow one:
// it sets a single boolean and nothing else.
//
// Marking a lead junk stops the 24-hour follow-up cron and every automated
// lead-facing SMS, and drops the row from the /admin/arms funnel counts. It
// does NOT touch the pixel: Meta has already counted that conversion, and this
// app has no retraction to send. The flag is internal bookkeeping so Jacob's
// own numbers stop counting an agency as a lead.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMarketingBusiness } from '@/lib/marketing-funnel'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as { leadId?: string; junk?: boolean }
    const leadId = body.leadId?.trim() ?? ''
    if (!leadId || typeof body.junk !== 'boolean') {
      return NextResponse.json({ error: 'leadId and junk are required' }, { status: 400 })
    }

    // Scoped to the marketing business: this view is the /book funnel, and a
    // stray id must not be able to flip a flag on a client tenant's lead.
    const business = await getMarketingBusiness()
    if (!business) return NextResponse.json({ error: 'No marketing business' }, { status: 503 })

    const updated = await db.websiteLead.updateMany({
      where: { id: leadId, businessId: business.id },
      data: { junk: body.junk },
    })
    if (updated.count === 0) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    console.log(`[admin/funnel-leads] junk=${body.junk} leadId=${leadId}`)
    return NextResponse.json({ ok: true, junk: body.junk })
  } catch (err) {
    console.error('[admin/funnel-leads/junk] failed:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
