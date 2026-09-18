import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PipelineClient } from './PipelineClient'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const { userId } = await auth()
  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    redirect('/dashboard')
  }

  // Same revenue cookie as /admin, so the eye toggle carries across pages.
  const initialShowRevenue = cookies().get('adminShowRevenue')?.value === '1'

  return <PipelineClient initialShowRevenue={initialShowRevenue} />
}
