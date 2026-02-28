import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getBusinessForDashboard } from '@/lib/get-business-for-dashboard'
import { Building, Bot, Phone, Calendar, CheckCircle, ExternalLink, Bell } from 'lucide-react'
import { EmbedCodeSection } from '@/app/components/EmbedCodeSection'
import { revalidatePath } from 'next/cache'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const params = await searchParams
  const googleConnected = params.google_connected === '1'
  const googleError = params.google_error

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  const { business, isAdminViewAs } = await getBusinessForDashboard(userId, user?.business ?? null)
  if (!business) redirect('/onboarding')

  async function saveSettings(formData: FormData) {
    'use server'

    const { userId } = await auth()
    if (!userId) throw new Error('Not authenticated')

    const cookieStore = await cookies()
    if (cookieStore.get('adminViewAs')?.value) {
      throw new Error('Cannot save settings while viewing as another client')
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { business: true }
    })

    if (!user?.business) throw new Error('No business found')

    const name = formData.get('name') as string
    const aiGreeting = formData.get('aiGreeting') as string
    const servicesOffered = formData.get('servicesOffered') as string
    const aiInstructions = formData.get('aiInstructions') as string
    const aiContext = formData.get('aiContext') as string
    const missedCallVoiceMessage = formData.get('missedCallVoiceMessage') as string
    const ownerEmail = (formData.get('ownerEmail') as string)?.trim() || null
    const ownerPhone = (formData.get('ownerPhone') as string)?.trim() || null
    const notifyBySms = formData.get('notifyBySms') === 'on'
    const notifyByEmail = formData.get('notifyByEmail') === 'on'

    await db.business.update({
      where: { id: user.business.id },
      data: {
        name,
        aiGreeting: aiGreeting || null,
        servicesOffered: servicesOffered ? servicesOffered.split(',').map(s => s.trim()) : undefined,
        aiInstructions: aiInstructions || null,
        aiContext: aiContext || null,
        missedCallVoiceMessage: missedCallVoiceMessage || null,
        ownerEmail,
        ownerPhone,
        notifyBySms,
        notifyByEmail,
      }
    })

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your business profile and AI assistant</p>
      </div>

      {isAdminViewAs && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
          You are viewing as a client. Changes cannot be saved in this mode.
        </div>
      )}
      {googleConnected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Google Calendar connected successfully! Your booking page is ready.
        </div>
      )}
      {googleError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {googleError === 'denied' && 'Google Calendar connection was cancelled.'}
          {googleError === 'missing_params' && 'Invalid callback. Please try again.'}
          {googleError === 'exchange_failed' && 'Failed to connect. Please try again.'}
          {!['denied', 'missing_params', 'exchange_failed'].includes(googleError) && 'Something went wrong. Please try again.'}
        </div>
      )}
      <form action={saveSettings} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg"><Building className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Business Profile</h2>
              <p className="text-sm text-gray-500">Basic information about your business</p>
            </div>
          </div>
          <div className="ml-11 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              <input type="text" name="name" defaultValue={business.name} required className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="text" value={business.telnyxPhoneNumber || 'Not assigned'} disabled className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg"><Bot className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
              <p className="text-sm text-gray-500">Customize how your AI responds to callers</p>
            </div>
          </div>
          <div className="ml-11 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Greeting Message</label>
              <textarea name="aiGreeting" rows={3} defaultValue={business.aiGreeting || ''} placeholder="Hi! Sorry we missed your call. How can I help you today?" className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">First message sent when someone misses your call.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Services Offered</label>
              <textarea name="servicesOffered" rows={2} defaultValue={Array.isArray(business.servicesOffered) ? business.servicesOffered.join(', ') : ''} placeholder="Teeth cleaning, fillings, crowns, root canals" className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">Separate with commas. AI uses this to help book appointments.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Context</label>
              <textarea name="aiContext" rows={3} defaultValue={business.aiContext || ''} placeholder="We're a family dental practice. We accept most insurance plans." className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
              <textarea name="aiInstructions" rows={3} defaultValue={business.aiInstructions || ''} placeholder="Always ask for the patient's name. New patients arrive 15 min early." className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {business.calendarEnabled && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg"><Calendar className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Google Calendar</h2>
              <p className="text-sm text-gray-500">Sync bookings with your calendar and enable online booking</p>
            </div>
          </div>
          <div className="ml-11 space-y-4">
            {business.googleCalendarConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">Calendar connected</p>
                    <p className="text-sm text-green-700">Bookings sync to your Google Calendar. Booking page: /book/{business.slug}</p>
                    <a
                      href={`/book/${business.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 mt-2"
                    >
                      View booking page <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <EmbedCodeSection
                  businessSlug={business.slug}
                  baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alignandacquire.com')}
                  variant="light"
                />
              </div>
            ) : (
              <a
                href={isAdminViewAs ? '#' : `/api/auth/google?businessId=${business.id}`}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                  isAdminViewAs
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                onClick={e => isAdminViewAs && e.preventDefault()}
                aria-disabled={isAdminViewAs}
              >
                Connect Google Calendar
              </a>
            )}
          </div>
        </div>
        )}

        {business.calendarEnabled && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg"><Bell className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Booking Notifications</h2>
              <p className="text-sm text-gray-500">Get notified when appointments are booked or cancelled</p>
            </div>
          </div>
          <div className="ml-11 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
              <input type="email" name="ownerEmail" defaultValue={business.ownerEmail ?? ''} placeholder="you@yourbusiness.com" className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">Email address to receive booking and cancellation notifications.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone (optional)</label>
              <input type="tel" name="ownerPhone" defaultValue={business.ownerPhone ?? ''} placeholder={business.forwardingNumber ?? '+1234567890'} className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">SMS notifications go here. Leave blank to use your forwarding number.</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="notifyBySms" defaultChecked={business.notifyBySms ?? true} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-gray-700">Notify by SMS</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="notifyByEmail" defaultChecked={business.notifyByEmail ?? true} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-gray-700">Notify by Email</span>
              </label>
            </div>
          </div>
        </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg"><Phone className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Phone Setup</h2>
              <p className="text-sm text-gray-500">How to connect your business line</p>
            </div>
          </div>
          <div className="ml-11 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Missed Call Voice Message</label>
              <textarea name="missedCallVoiceMessage" rows={3} defaultValue={business.missedCallVoiceMessage ?? ''} placeholder="We're sorry we can't get to the phone right now. You should receive a text message shortly." className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">This message plays to callers when you don&apos;t answer the phone.</p>
            </div>
          </div>
          <div className="ml-11 bg-blue-50 rounded-lg p-4 mt-4">
            <h4 className="font-medium text-blue-900 mb-2">Call Forwarding Setup</h4>
            <p className="text-sm text-blue-800 mb-3">To capture missed calls, set up call forwarding from your business line:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>On your business phone, dial <strong>*71{business.telnyxPhoneNumber || '[your number]'}</strong></li>
              <li>Wait for confirmation tone</li>
              <li>Unanswered calls will now forward to your AI assistant</li>
            </ol>
            <p className="text-sm text-blue-700 mt-3">To disable: dial <strong>*73</strong></p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isAdminViewAs} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed">Save Changes</button>
        </div>
      </form>
    </div>
  )
}