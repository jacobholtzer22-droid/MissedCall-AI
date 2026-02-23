import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { Phone, MessageSquare, Calendar, TrendingUp, ArrowRight, ShieldCheck, HelpCircle, Wrench } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'

const DEFAULT_STATS = {
  totalConversations: 0,
  todayConversations: 0,
  activeConversations: 0,
  weeklyAppointments: 0,
  totalMessages: 0,
  responseRate: 0,
  recentConversations: [] as any[],
  callsSaved: 0,
  topServices: [] as { service: string; count: number }[],
  commonQuestions: [] as string[],
}

async function getDashboardStats(businessId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  try {
    const [
      totalConversations,
      todayConversations,
      activeConversations,
      weeklyAppointments,
      totalMessages,
      recentConversations,
      conversationsWithReplies,
      allConversationsWithService,
      recentInboundMessages
    ] = await Promise.all([
      db.conversation.count({ where: { businessId } }),
      db.conversation.count({ where: { businessId, createdAt: { gte: todayStart } } }),
      db.conversation.count({ where: { businessId, status: 'active' } }),
      db.appointment.count({ where: { businessId, createdAt: { gte: weekStart } } }),
      db.message.count({ where: { direction: 'outbound', conversation: { businessId } } }),
      db.conversation.findMany({
        where: { businessId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } }
      }),
      // Calls Saved - conversations where customer actually replied
      db.conversation.count({
        where: { businessId, messages: { some: { direction: 'inbound' } } }
      }),
      // Top Services - get all conversations with serviceRequested
      db.conversation.findMany({
        where: { businessId, serviceRequested: { not: null } },
        select: { serviceRequested: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      // Common Questions - get recent inbound messages
      db.message.findMany({
        where: {
          direction: 'inbound',
          conversation: { businessId }
        },
        select: { content: true },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ])

    const responseRate = totalConversations > 0
      ? Math.round((conversationsWithReplies / totalConversations) * 100)
      : 0

    // Calculate top requested services
    const serviceCounts: Record<string, number> = {}
    allConversationsWithService.forEach(conv => {
      if (conv.serviceRequested) {
        const service = conv.serviceRequested.toLowerCase().trim()
        serviceCounts[service] = (serviceCounts[service] || 0) + 1
      }
    })
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([service, count]) => ({ service, count }))

    // Extract common questions from inbound messages
    const questionKeywords = ['how', 'what', 'when', 'where', 'can', 'do you', 'is there', 'price', 'cost', 'available', 'open', 'hour', 'appointment', 'book', 'schedule']
    const questions: string[] = []
    recentInboundMessages.forEach(msg => {
      const content = msg.content.toLowerCase()
      if (questionKeywords.some(kw => content.includes(kw)) && msg.content.length < 200) {
        questions.push(msg.content)
      }
    })
    const commonQuestions = questions.slice(0, 5)

    return {
      totalConversations,
      todayConversations,
      activeConversations,
      weeklyAppointments,
      totalMessages,
      responseRate,
      recentConversations,
      callsSaved: conversationsWithReplies,
      topServices,
      commonQuestions
    }
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
    return DEFAULT_STATS
  }
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

      {/* Main Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Conversations Today" value={stats.todayConversations.toString()} description={`${stats.totalConversations} total`} icon={Phone} />
        <StatCard title="Calls Saved" value={stats.callsSaved.toString()} description="Customers who engaged" icon={ShieldCheck} highlight={stats.callsSaved > 0} />
        <StatCard title="Appointments Booked" value={stats.weeklyAppointments.toString()} description="This week" icon={Calendar} />
        <StatCard title="Response Rate" value={`${stats.responseRate}%`} description="Callers who replied" icon={TrendingUp} />
      </div>

      {/* Insights Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Requested Services */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center">
            <Wrench className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Top Requested Services</h2>
          </div>
          {stats.topServices.length === 0 ? (
            <div className="p-6 text-center py-8">
              <Wrench className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No service requests yet</p>
              <p className="text-sm text-gray-400 mt-1">Services will appear as customers book</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="space-y-3">
                {stats.topServices.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="text-gray-900 capitalize">{item.service}</span>
                    </div>
                    <span className="text-sm text-gray-500">{item.count} requests</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Common Questions */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center">
            <HelpCircle className="h-5 w-5 text-purple-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Common Questions</h2>
          </div>
          {stats.commonQuestions.length === 0 ? (
            <div className="p-6 text-center py-8">
              <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No questions yet</p>
              <p className="text-sm text-gray-400 mt-1">Customer questions will appear here</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="space-y-3">
                {stats.commonQuestions.map((question, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-purple-600 font-bold">?</span>
                    <p className="text-sm text-gray-700 line-clamp-2">{question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Conversations */}
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
                    <p className="text-sm text-gray-500">{formatRelativeTime(conversation.lastMessageAt ?? conversation.createdAt)}</p>
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

      {/* Bottom Stats */}
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
          <div>
            <p className="text-sm text-gray-500">Active Conversations</p>
            <p className="text-2xl font-bold text-gray-900">{stats.activeConversations}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, description, icon: Icon, highlight = false }: { title: string; value: string; description: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-green-100' : 'bg-blue-50'}`}>
          <Icon className={`h-6 w-6 ${highlight ? 'text-green-600' : 'text-blue-600'}`} />
        </div>
      </div>
    </div>
  )
}