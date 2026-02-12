import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { LayoutDashboard, MessageSquare, Calendar, Settings, FlaskConical } from 'lucide-react'
import { Logo } from '@/app/components/Logo'

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessageSquare },
  { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { name: 'Test Mode', href: '/dashboard/test', icon: FlaskConical },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  if (!user || !user.business) {
    redirect('/onboarding')
  }

  const business = user.business

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden lg:block">
        <Link href="/" className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 hover:bg-gray-50 transition">
          <Logo size="sm" variant="light" className="shrink-0" />
          <span className="text-xl font-bold text-gray-900">MissedCall AI</span>
        </Link>

        <div className="px-6 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-500">Business</p>
          <p className="font-medium text-gray-900 truncate">{business.name}</p>
        </div>

        <nav className="px-4 py-6 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center space-x-3 px-3 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition"
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <UserButton afterSignOutUrl="/" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.firstName || user.email}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="sm" variant="light" className="shrink-0" />
            <span className="font-bold text-gray-900">MissedCall AI</span>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
        <nav className="flex overflow-x-auto px-4 py-2 space-x-4 border-t border-gray-100">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-700 whitespace-nowrap rounded-lg hover:bg-gray-100"
            >
              <item.icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main className="lg:pl-64 pt-[168px] lg:pt-16">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}