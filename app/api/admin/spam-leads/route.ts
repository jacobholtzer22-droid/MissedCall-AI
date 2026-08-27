// ===========================================
// ADMIN SPAM LEADS — cross-tenant scored submissions
// ===========================================
// Feeds /admin/spam. Read only: this route has no mutations by design, so
// auditing false positives cannot accidentally change client data.
//
// Returns rows that were condemned (status='spam') AND rows that merely scored
// (spamScore != null). The second set is the point: a view showing only condemned
// rows can never show a real lead that scored 85 and got through, which is exactly
// the row that says the weights are drifting.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSpamThreshold } from '@/lib/spam-score'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID
const MAX_ROWS = 200

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const minScore = Number.parseInt(
    new URL(request.url).searchParams.get('minScore') || '0',
    10
  )

  try {
    const leads = await db.websiteLead.findMany({
      where: {
        OR: [{ status: 'spam' }, { spamScore: { not: null } }],
        ...(Number.isFinite(minScore) && minScore > 0
          ? { spamScore: { gte: minScore } }
          : {}),
      },
      select: {
        id: true,
        businessId: true,
        name: true,
        phone: true,
        email: true,
        message: true,
        status: true,
        spamScore: true,
        spamReasons: true,
        sourceIp: true,
        userAgent: true,
        createdAt: true,
        business: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    })

    return NextResponse.json({
      threshold: getSpamThreshold(),
      count: leads.length,
      truncated: leads.length === MAX_ROWS,
      leads: leads.map((l) => ({
        ...l,
        businessName: l.business?.name ?? l.businessId,
        reasons: Array.isArray(l.spamReasons) ? (l.spamReasons as string[]) : [],
      })),
    })
  } catch (err) {
    console.error('[admin/spam-leads] query failed:', err)
    return NextResponse.json({ error: 'Failed to load spam leads' }, { status: 500 })
  }
}
