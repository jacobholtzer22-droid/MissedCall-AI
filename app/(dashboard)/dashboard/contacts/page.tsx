// ===========================================
// CLIENT CONTACTS PAGE (Server Component)
// ===========================================
// Allows clients to import their personal phone contacts so those people
// won't receive an automated text when the client doesn't answer their phone.

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ContactsClient } from './ContactsClient'

export default async function ContactsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  if (!user?.business) redirect('/onboarding')

  // Fetch existing imported contacts for initial render
  const contacts = await db.blockedNumber.findMany({
    where: { businessId: user.business.id, source: 'contact' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, phoneNumber: true, label: true, createdAt: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Personal Contacts</h1>
        <p className="text-gray-500 mt-1">
          Import your phone contacts so they never receive an automated text when you miss their
          call. This is for your personal line — people who already know you.
        </p>
      </div>

      <ContactsClient initialContacts={contacts} />
    </div>
  )
}
