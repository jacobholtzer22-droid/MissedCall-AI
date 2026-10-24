import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOpsBoard } from '@/lib/ops/board'
import { OpsClient, type OpsTab } from './OpsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ops',
  robots: { index: false, follow: false },
}

const TABS: OpsTab[] = ['today', 'clients', 'money', 'agents']

export default async function OpsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { userId } = await auth()

  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    redirect('/dashboard')
  }

  const tab = TABS.includes(searchParams?.tab as OpsTab) ? (searchParams.tab as OpsTab) : 'today'
  const board = await getOpsBoard()

  return <OpsClient initialBoard={board} initialTab={tab} />
}
