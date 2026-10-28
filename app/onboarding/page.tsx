import type { Metadata } from 'next'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { OnboardingForm } from './OnboardingForm'
import { getIndustryDefaults } from '@/lib/industry-defaults'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const { userId } = await auth()
  const clerkUser = await currentUser()

  if (!userId || !clerkUser) {
    redirect('/sign-in')
  }

  const existingUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  if (existingUser?.business) {
    redirect('/dashboard')
  }

  // A platform account Jacob created from Ops (no signup yet) is claimed by the
  // first user who signs up with its owner email, verified by Clerk. Only a
  // Business with no users at all can be claimed.
  const verifiedEmails = clerkUser.emailAddresses
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.trim().toLowerCase())
  if (verifiedEmails.length) {
    const claimable = await db.business.findFirst({
      where: { OR: verifiedEmails.map((e) => ({ ownerEmail: { equals: e, mode: 'insensitive' as const } })), users: { none: {} } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, ownerEmail: true },
    })
    if (claimable) {
      const email = claimable.ownerEmail?.toLowerCase() ?? verifiedEmails[0]
      await db.user.upsert({
        where: { clerkId: userId },
        update: { businessId: claimable.id, email },
        create: {
          clerkId: userId,
          businessId: claimable.id,
          email,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
          role: 'owner',
        },
      })
      redirect('/dashboard')
    }
  }

  async function createBusiness(formData: FormData) {
    'use server'

    const { userId } = await auth()
    const clerkUser = await currentUser()

    if (!userId || !clerkUser) {
      throw new Error('Not authenticated')
    }

    const businessName = formData.get('businessName') as string
    const businessType = formData.get('businessType') as string
    const services = formData.get('services') as string
    const businessHours = formData.get('businessHours') as string
    const specialInfo = formData.get('specialInfo') as string
    const cannotHelp = formData.get('cannotHelp') as string

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const industryDefaults = getIndustryDefaults(businessType)

    // Build AI context from all the info
    const aiContext = `Business Type: ${businessType}
Hours: ${businessHours || 'Not specified'}
${specialInfo ? `About Us: ${specialInfo}` : ''}
${cannotHelp ? `Cannot Help With: ${cannotHelp}` : ''}`

    const aiInstructions = `If asked about something you don't know or cannot help with, say: "I don't have that information, but I'll have someone from our team call you back shortly to help!"
${cannotHelp ? `Do NOT try to help with: ${cannotHelp}. Instead, offer to have someone call them back.` : ''}`

    await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: slug + '-' + Date.now(),
          businessType,
          aiGreeting: industryDefaults.aiGreeting,
          aiContext: aiContext,
          aiInstructions: aiInstructions,
          servicesOffered: services ? services.split(',').map(s => s.trim()) : [],
          businessHours: businessHours ? { description: businessHours } : undefined,
          bookingPageTitle: industryDefaults.bookingPageTitle,
          bookingPageServiceLabel: industryDefaults.bookingPageServiceLabel,
          bookingRequiresAddress: industryDefaults.bookingRequiresAddress,
        }
      })

      await tx.user.upsert({
        where: { clerkId: userId },
        update: {
          businessId: business.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
        },
        create: {
          clerkId: userId,
          businessId: business.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
          role: 'owner',
        }
      })
    })

    revalidatePath('/dashboard')
    redirect('/dashboard')
  }

  return <OnboardingForm createBusiness={createBusiness} />
}
