import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { Building, ArrowRight, ArrowLeft } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to MissedCall AI</h1>
          <p className="text-gray-500 mt-2">Tell us about your business so the AI can help your customers</p>
        </div>

        <form action={createBusiness} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="businessName"
              required
              placeholder="Smith Family Dental"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What type of business? <span className="text-red-500">*</span>
            </label>
            <select
              name="businessType"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select your industry...</option>
              <option value="Dental Office">Dental Office</option>
              <option value="Hair Salon / Barbershop">Hair Salon / Barbershop</option>
              <option value="Medical Practice">Medical Practice</option>
              <option value="HVAC Company">HVAC Company</option>
              <option value="Plumbing Company">Plumbing Company</option>
              <option value="Auto Repair Shop">Auto Repair Shop</option>
              <option value="Law Firm">Law Firm</option>
              <option value="Spa / Wellness Center">Spa / Wellness Center</option>
              <option value="Veterinary Clinic">Veterinary Clinic</option>
              <option value="Real Estate Agency">Real Estate Agency</option>
              <option value="Accounting / Tax Services">Accounting / Tax Services</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Services */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What services do you offer? <span className="text-red-500">*</span>
            </label>
            <textarea
              name="services"
              required
              rows={2}
              placeholder="Teeth cleaning, fillings, crowns, root canals, teeth whitening..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Separate with commas. The AI will use this to help customers.</p>
          </div>

          {/* Business Hours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What are your business hours?
            </label>
            <input
              type="text"
              name="businessHours"
              placeholder="Mon-Fri 9am-5pm, Sat 10am-2pm"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Special Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anything special customers should know?
            </label>
            <textarea
              name="specialInfo"
              rows={2}
              placeholder="We accept most insurance, new patients welcome, free parking available..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cannot Help With */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What should the AI NOT try to help with?
            </label>
            <textarea
              name="cannotHelp"
              rows={2}
              placeholder="Pricing questions, insurance verification, medical advice..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">For these topics, AI will offer to have someone call them back.</p>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center"
          >
            Create My Business
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          You can always update these settings later.
        </p>
      </div>
    </div>
  )
}