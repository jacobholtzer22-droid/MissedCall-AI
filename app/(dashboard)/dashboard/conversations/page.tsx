// ===========================================
// CONVERSATIONS PAGE
// ===========================================
// Shows all SMS conversations with callers

import { db } from '@/lib/db'
import { MessageSquare, Search, Phone, Calendar } from 'lucide-react'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'
import Link from 'next/link'

async function getConversations() {
  const conversations = await db.conversation.findMany({
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

export default async function ConversationsPage() {
  const conversations = await getConversations()

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <p className="text-gray-500 mt-1">
          View all SMS conversations with callers
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat 
          label="Total" 
          value={conversations.length} 
        />
        <MiniStat 
          label="Active" 
          value={conversations.filter(c => c.status === 'active').length}
          highlight 
        />
        <MiniStat 
          label="Appointments" 
          value={conversations.filter(c => c.status === 'appointment_booked').length} 
        />
        <MiniStat 
          label="No Response" 
          value={conversations.filter(c => c.status === 'no_response').length} 
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
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {conversation.status === 'active' ? 'Active' : 
                       conversation.status === 'appointment_booked' ? 'Booked' : 
                       conversation.status === 'completed' ? 'Completed' : 'No response'}
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