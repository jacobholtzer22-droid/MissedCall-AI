// ===========================================
// CONVERSATIONS PAGE
// ===========================================
// Shows all SMS conversations with callers

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MessageSquare, Calendar } from 'lucide-react'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'
import Link from 'next/link'

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'appointment_booked', label: 'Booked' },
  { value: 'no_response', label: 'No response' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'completed', label: 'Completed' },
  { value: 'spam_blocked', label: 'Spam blocked' },
  { value: 'screening_blocked', label: 'Screening blocked' }
]

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Active',
    appointment_booked: 'Booked',
    no_response: 'No response',
    needs_review: 'Needs review',
    completed: 'Completed',
    spam_blocked: 'Spam blocked',
    screening_blocked: 'Screening blocked'
  }
  return map[status] ?? status.replace(/_/g, ' ')
}

async function getStatusCounts(businessId: string): Promise<Record<string, number>> {
  const rows = await db.conversation.groupBy({
    by: ['status'],
    where: { businessId },
    _count: { status: true }
  })
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.status] = row._count.status
  }
  return counts
}

async function getConversations(businessId: string, statusParam?: string | null) {
  const where: { businessId: string; status?: string } = { businessId }
  if (statusParam && statusParam !== 'all') {
    where.status = statusParam
  }
  const conversations = await db.conversation.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      appointment: true
    }
  })
  return conversations
}

export default async function ConversationsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  if (!user?.business) redirect('/onboarding')

  const { status: statusParam } = await searchParams
  const [conversations, statusCounts] = await Promise.all([
    getConversations(user.business.id, statusParam),
    getStatusCounts(user.business.id)
  ])
  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const currentStatus = statusParam && statusParam !== 'all' ? statusParam : 'all'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <p className="text-gray-500 mt-1">
          View all SMS conversations with callers
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {STATUS_TABS.map(({ value, label }) => (
          <Link
            key={value}
            href={value === 'all' ? '/dashboard/conversations' : `/dashboard/conversations?status=${value}`}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentStatus === value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Stats bar - counts from ALL conversations */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat 
          label="Total" 
          value={totalCount} 
        />
        <MiniStat 
          label="Active" 
          value={statusCounts.active ?? 0}
          highlight 
        />
        <MiniStat 
          label="Appointments" 
          value={statusCounts.appointment_booked ?? 0} 
        />
        <MiniStat 
          label="No Response" 
          value={statusCounts.no_response ?? 0} 
        />
      </div>

      {/* Conversations list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {conversations.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              When someone misses your call and responds to our text, 
              their conversation will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {conversations.map((conversation) => (
              <Link 
                key={conversation.id} 
                href={`/dashboard/conversations/${conversation.id}`}
                className="block px-6 py-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Status indicator */}
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      conversation.status === 'active' ? 'bg-green-500' : 
                      conversation.status === 'appointment_booked' ? 'bg-blue-500' :
                      conversation.status === 'spam_blocked' ? 'bg-red-500' :
                      conversation.status === 'screening_blocked' ? 'bg-amber-500' :
                      'bg-gray-300'
                    }`} />
                    
                    {/* Caller info */}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900">
                          {conversation.callerName || formatPhoneNumber(conversation.callerPhone)}
                        </p>
                        {conversation.appointment && (
                          <span className="flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            <Calendar className="h-3 w-3 mr-1" />
                            Booked
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate max-w-md">
                        {conversation.messages[0]?.content || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Right side */}
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm text-gray-500">
                      {formatRelativeTime(conversation.lastMessageAt)}
                    </p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      conversation.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : conversation.status === 'appointment_booked'
                        ? 'bg-blue-100 text-blue-700'
                        : conversation.status === 'completed'
                        ? 'bg-gray-100 text-gray-600'
                        : conversation.status === 'no_response' || conversation.status === 'needs_review'
                        ? 'bg-yellow-100 text-yellow-700'
                        : conversation.status === 'spam_blocked'
                        ? 'bg-red-100 text-red-700'
                        : conversation.status === 'screening_blocked'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {getStatusLabel(conversation.status)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}