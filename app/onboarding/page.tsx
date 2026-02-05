import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { OnboardingForm } from './OnboardingForm'

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
          aiGreeting: `Hi! Sorry we missed your call at ${businessName}. I'm an automated assistant - how can I help you today?`,
          aiContext: aiContext,
          aiInstructions: aiInstructions,
          servicesOffered: services ? services.split(',').map(s => s.trim()) : [],
          businessHours: businessHours ? { description: businessHours } : undefined,
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
