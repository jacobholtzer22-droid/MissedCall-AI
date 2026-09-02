import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import MarketingThreadsClient from './MarketingThreadsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Marketing line',
  robots: { index: false, follow: false },
}

export default async function MarketingThreadsPage() {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) redirect('/dashboard')
  return <MarketingThreadsClient />
}
