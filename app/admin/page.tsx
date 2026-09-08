import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminBusinesses } from '@/lib/admin-stats'
import { AdminClient } from './AdminClient'

export default async function AdminPage() {
  const { userId } = await auth()

  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    redirect('/dashboard')
  }

  const cookieStore = await cookies()
  const initialShowRevenue = cookieStore.get('adminShowRevenue')?.value === '1'

  const businesses = await getAdminBusinesses()

  return <AdminClient initialBusinesses={businesses} initialShowRevenue={initialShowRevenue} />
}
