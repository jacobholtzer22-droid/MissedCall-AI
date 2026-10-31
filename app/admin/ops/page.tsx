import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOpsBoard } from '@/lib/ops/board'
import { OpsClient, type OpsTab } from './OpsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ops',
  robots: { index: false, follow: false },
}

const TABS: OpsTab[] = ['hq', 'home', 'clients', 'money', 'timeline', 'agents']
/** Today was folded into Home; old links land there. */
const OLD_HOME_TABS = ['today']

export default async function OpsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { userId } = await auth()

  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    redirect('/dashboard')
  }

  if (OLD_HOME_TABS.includes(searchParams?.tab ?? '')) redirect('/admin/ops?tab=home')
  const tab = TABS.includes(searchParams?.tab as OpsTab) ? (searchParams.tab as OpsTab) : 'hq'
  const [board, cookieStore] = await Promise.all([getOpsBoard(), cookies()])
  const initialShowRevenue = cookieStore.get('adminShowRevenue')?.value === '1'

  return <OpsClient initialBoard={board} initialTab={tab} initialShowRevenue={initialShowRevenue} />
}
