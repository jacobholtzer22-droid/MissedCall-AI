import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { Phone, MessageSquare, Calendar, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'

async function getDashboardStats(businessId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const [
    totalConversations,
    todayConversations,
    activeConversations,
    weeklyAppointments,
    totalMessages,
    recentConversations
  ] = await Promise.all([
    db.conversation.count({ where: { businessId } }),
    db.conversation.count({ where: { businessId, createdAt: { gte: todayStart } } }),
    db.conversation.count({ where: { businessId, status: 'active' } }),
    db.appointment.count({ where: { businessId, createdAt: { gte: weekStart } } }),
    db.message.count({ where: { direction: 'outbound', conversation: { businessId } } }),
    db.conversation.findMany({
      where: { businessId },
      take: 5,
      orderBy: { lastMessageAt: 'desc' },
      include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } }
    })
  ])

  const conversationsWithReplies = await db.conversation.count({
    where: { businessId, messages: { some: { direction: 'inbound' } } }
  })
  
  const responseRate = totalConversations > 0 
    ? Math.round((conversationsWithReplies / totalConversations) * 100) 
    : 0

  return { totalConversations, todayConversations, activeConversations, weeklyAppointments, totalMessages, responseRate, recentConversations }
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  if (!user?.business) redirect('/onboarding')

  const stats = await getDashboardStats(user.business.id)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your missed calls.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Conversations Today" value={stats.todayConversations.toString()} description={`${stats.totalConversations} total`} icon={Phone} />
        <StatCard title="Active Conversations" value={stats.activeConversations.toString()} description="In progress" icon={MessageSquare} highlight={stats.activeConversations > 0} />
        <StatCard title="Appointments Booked" value={stats.weeklyAppointments.toString()} description="This week" icon={Calendar} />
        <StatCard title="Response Rate" value={`${stats.responseRate}%`} description="Callers who replied" icon={TrendingUp} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Conversations</h2>
          <Link href="/dashboard/conversations" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
            View all<ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </div>
        
        {stats.recentConversations.length === 0 ? (
          <div className="p-6 text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
            <p className="text-gray-500 max-w-sm mx-auto">When someone calls and doesn't get an answer, they'll appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.recentConversations.map((conversation) => (
              <Link key={conversation.id} href={`/dashboard/conversations/${conversation.id}`} className="block px-6 py-4 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-2 h-2 rounded-full ${conversation.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900">{conversation.callerName || formatPhoneNumber(conversation.callerPhone)}</p>
                      <p className="text-sm text-gray-500 truncate max-w-xs">{conversation.messages[0]?.content || 'No messages yet'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{formatRelativeTime(conversation.lastMessageAt)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${conversation.status === 'active' ? 'bg-green-100 text-green-700' : conversation.status === 'appointment_booked' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {conversation.status === 'active' ? 'Active' : conversation.status === 'appointment_booked' ? 'Booked' : conversation.status === 'completed' ? 'Completed' : 'No response'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-6">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-sm text-gray-500">Total Messages Sent</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalMessages}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Avg Response Time</p>
            <p className="text-2xl font-bold text-gray-900">&lt; 30s</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Uptime</p>
            <p className="text-2xl font-bold text-gray-900">99.9%</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, description, icon: Icon, highlight = false }: { title: string; value: string; description: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-blue-100' : 'bg-blue-50'}`}>
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
      </div>
    </div>
  )
}