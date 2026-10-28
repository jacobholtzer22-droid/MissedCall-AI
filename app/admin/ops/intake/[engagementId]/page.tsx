import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { readIntake } from '@/lib/ops/intake'
import { IntakeClient } from './IntakeClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Intake',
  robots: { index: false, follow: false },
}

/** Admin only: Jacob fills it from what the client sent him. A client-facing link comes later. */
export default async function IntakePage({ params }: { params: { engagementId: string } }) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')
  const e = await db.engagement.findUnique({
    where: { id: params.engagementId },
    select: { id: true, displayName: true, intake: true, brief: true, phone: true, email: true, trade: true, location: true },
  })
  if (!e) notFound()
  return (
    <IntakeClient
      engagementId={e.id}
      name={e.displayName.trim()}
      initial={readIntake(e.intake)}
      hasBrief={Boolean(e.brief)}
      fallback={{ phone: e.phone, email: e.email, trade: e.trade, location: e.location }}
    />
  )
}
