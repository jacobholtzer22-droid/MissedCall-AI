import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getAdminBusinesses } from '@/lib/admin-stats'
import { AdminClient } from './AdminClient'

export default async function AdminPage() {
  const { userId } = await auth()

  if (!userId || userId !== process.env.ADMIN_USER_ID) {
    redirect('/dashboard')
  }

  const businesses = await getAdminBusinesses()

  return <AdminClient initialBusinesses={businesses} />
}
