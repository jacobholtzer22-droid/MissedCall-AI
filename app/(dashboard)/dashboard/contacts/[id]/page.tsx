// ===========================================
// CONTACT DETAIL PAGE
// ===========================================

import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { ContactDetailClient } from './ContactDetailClient'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true },
  })

  const { business } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
    include: {
      contactTags: { include: { tag: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      jobs: { orderBy: { scheduledDate: 'desc' } },
    },
  })

  if (!contact) notFound()

  const { phonesMatch } = await import('@/lib/phone-utils')
  const conversations = await db.conversation.findMany({
    where: {
      businessId: business.id,
      messages: { some: {} },
    },
    orderBy: { lastMessageAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const contactConversations = conversations.filter((c) =>
    phonesMatch(c.callerPhone, contact.phoneNumber)
  )

  const contactData = {
    id: contact.id,
    name: contact.name,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    address: contact.address,
    city: contact.city,
    state: contact.state,
    zip: contact.zip,
    source: contact.source,
    status: contact.status ?? 'new',
    notes: contact.notes,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    totalRevenue: contact.totalRevenue ?? 0,
    tags: contact.contactTags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color,
    })),
    activities: contact.activities.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
    jobs: contact.jobs.map((j) => ({
      id: j.id,
      serviceName: j.serviceName,
      status: j.status,
      scheduledDate: j.scheduledDate?.toISOString() ?? null,
      amount: j.amount,
      completedDate: j.completedDate?.toISOString() ?? null,
    })),
    conversations: contactConversations.map((conv) => ({
      id: conv.id,
      callerPhone: conv.callerPhone,
      status: conv.status,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      lastMessage: conv.messages[0]?.content ?? null,
    })),
  }

  return <ContactDetailClient contact={contactData} />
}
