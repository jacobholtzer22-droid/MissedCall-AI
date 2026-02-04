import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { Phone, ArrowLeft, Calendar, User, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatPhoneNumber } from '@/lib/utils'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  if (!user?.business) redirect('/onboarding')

  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      appointment: true,
      business: true
    }
  })

  // Make sure conversation belongs to this business
  if (!conversation || conversation.businessId !== user.business.id) {
    notFound()
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-700' },
    completed: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
    appointment_booked: { label: 'Appointment Booked', color: 'bg-blue-100 text-blue-700' },
    no_response: { label: 'No Response', color: 'bg-yellow-100 text-yellow-700' },
    needs_review: { label: 'Needs Review', color: 'bg-red-100 text-red-700' }
  }

  const status = statusConfig[conversation.status] || statusConfig.active

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard/conversations" className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {conversation.callerName || formatPhoneNumber(conversation.callerPhone)}
            </h1>
            <p className="text-gray-500 flex items-center">
              <Phone className="h-4 w-4 mr-1" />
              {formatPhoneNumber(conversation.callerPhone)}
            </p>
          </div>
        </div>
        
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>

      {conversation.status === 'needs_review' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Needs Human Review</h3>
            <p className="text-sm text-red-700">The AI flagged this conversation for follow-up. Please review and contact the customer if needed.</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Conversation</h2>
          </div>
          
          <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
            {conversation.messages.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No messages yet</p>
            ) : (
              conversation.messages.map((message) => (
                <div key={message.id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${message.direction === 'outbound' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className={`text-xs mt-1 ${message.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Contact Info</h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <User className="h-4 w-4 text-gray-400 mr-3" />
                <span className="text-gray-600">{conversation.callerName || 'Unknown'}</span>
              </div>
              <div className="flex items-center text-sm">
                <Phone className="h-4 w-4 text-gray-400 mr-3" />
                <span className="text-gray-600">{formatPhoneNumber(conversation.callerPhone)}</span>
              </div>
              <div className="flex items-center text-sm">
                <Clock className="h-4 w-4 text-gray-400 mr-3" />
                <span className="text-gray-600">Started {new Date(conversation.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {conversation.appointment && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Calendar className="h-5 w-5 text-blue-600 mr-2" />
                Appointment Booked
              </h3>
              <div className="space-y-2 text-sm">
                <p><strong>Service:</strong> {conversation.appointment.serviceType}</p>
                <p><strong>Date:</strong> {new Date(conversation.appointment.scheduledAt).toLocaleDateString()}</p>
                <p><strong>Time:</strong> {new Date(conversation.appointment.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p><strong>Status:</strong> <span className="capitalize">{conversation.appointment.status}</span></p>
                {conversation.appointment.notes && <p><strong>Notes:</strong> {conversation.appointment.notes}</p>}
              </div>
            </div>
          )}

          {(conversation.intent || conversation.serviceRequested) && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">AI Analysis</h3>
              {conversation.intent && (
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Intent:</strong> <span className="capitalize">{conversation.intent.replace('_', ' ')}</span>
                </p>
              )}
              {conversation.serviceRequested && (
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Service:</strong> {conversation.serviceRequested}
                </p>
              )}
              {conversation.summary && (
                <p className="text-sm text-gray-600">{conversation.summary}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}