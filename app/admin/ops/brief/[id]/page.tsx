import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { tradeLabel } from '@/lib/ops/trades'
import { BriefSections } from '../../BriefCard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Campaign brief',
  robots: { index: false, follow: false },
}

/** Admin only: one Research desk brief in full, every section open. */
export default async function BriefPage({ params }: { params: { id: string } }) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')
  const b = await db.adsBrief.findUnique({
    where: { id: params.id },
    select: { id: true, body: true, data: true, tradeKey: true, createdAt: true, engagement: { select: { displayName: true } } },
  })
  if (!b) notFound()
  const when = b.createdAt.toLocaleString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <a href="/admin/ops?tab=hq" className="inline-flex items-center min-h-[44px] text-sm text-blue-400 hover:text-blue-300">
          Back to HQ
        </a>
        <header>
          <h1 className="text-lg font-semibold">Campaign brief: {b.engagement.displayName.trim()}</h1>
          <p className="text-sm text-gray-500">
            {b.tradeKey ? `${tradeLabel(b.tradeKey)}, ` : ''}written {when}, brief {b.id}
          </p>
        </header>
        <div className="rounded-lg border border-gray-800 bg-gray-900">
          <BriefSections brief={{ body: b.body, data: b.data }} openFirst={99} />
        </div>
      </div>
    </main>
  )
}
