'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { Menu, X, LayoutDashboard, MessageSquare, MessageCircle, Calendar, Settings, PhoneOff, Mail, Users, Briefcase, Mailbox, BarChart3 } from 'lucide-react'
import { Logo } from '@/app/components/Logo'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
  Calendar,
  Settings,
  PhoneOff,
  Mail,
  Users,
  Briefcase,
  Mailbox,
  BarChart3,
}

type NavItem = { name: string; href: string; icon: string }

export function DashboardShellClient({
  children,
  navigation,
  businessName,
  isAdminViewAs,
  userLabel,
}: {
  children: React.ReactNode
  navigation: NavItem[]
  businessName: string
  isAdminViewAs?: boolean
  userLabel?: string
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sidebarContent = (
    <>
      <Link href="/" className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 hover:bg-gray-50 transition" onClick={() => setSidebarOpen(false)}>
        <Logo size="sm" variant="light" className="shrink-0" />
        <span className="text-xl font-bold text-gray-900">MissedCall AI</span>
      </Link>
      <div className="px-6 py-3 border-b border-gray-100">
        <p className="text-sm text-gray-500">Business</p>
        <p className="font-medium text-gray-900 truncate">{businessName}</p>
      </div>
      <nav className="px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center space-x-3 px-3 py-2.5 text-gray-700 rounded-lg hover:bg-gray-100 transition min-h-[44px]"
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <UserButton afterSignOutUrl="/" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userLabel ?? 'Admin'}</p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar - hidden below md (768px), use 768 to match "screens smaller than 768px" */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden md:block">
        {sidebarContent}
      </aside>

      {/* Mobile: overlay when open */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-white border-r border-gray-200 shadow-xl md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-end p-2 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-56px)]">
              {sidebarContent}
            </div>
          </aside>
        </>
      )}

      {/* Mobile top bar: hamburger + business name + UserButton */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px]">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6 text-gray-700" />
          </button>
          <p className="flex-1 min-w-0 font-semibold text-gray-900 truncate text-sm">
            {businessName}
          </p>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="md:pl-64 pt-14 md:pt-16">
        {isAdminViewAs && (
          <div className="bg-amber-500/90 text-amber-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 mb-4">
            <span>Viewing as client: {businessName}</span>
            <a
              href="/api/admin/view-as?exit=1"
              className="underline font-semibold hover:no-underline"
            >
              Exit view
            </a>
          </div>
        )}
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
