'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Menu, X, Home, MessageSquare, ChevronDown, DollarSign, Calendar } from 'lucide-react'
import { NAV_SERVICES } from '@/app/config/nav-services'

const ICONS: Record<string, React.ElementType> = {
  '/': Home,
  '/missedcall-ai': MessageSquare,
  '/pricing': DollarSign,
  '/book': Calendar,
}

export function NavMenu() {
  const [open, setOpen] = useState(false)
  const [servicesExpanded, setServicesExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const menuPortal =
    mounted &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-[9998] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'rgba(22,24,28,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
          aria-hidden
        />

        {/* Slide-in panel */}
        <div
          className={`fixed top-0 right-0 h-full min-h-screen w-72 max-w-[88vw] z-[9999] border-l-2 transition-transform duration-300 ease-out shadow-2xl flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.3)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 px-6 py-4 shrink-0" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#6E7681' }}>
              Menu
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center transition-colors"
              style={{ color: '#6E7681' }}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto py-3 px-4 space-y-1">
            {[
              { href: '/', label: 'Home', icon: Home },
              { href: '/missedcall-ai', label: 'MissedCall AI', icon: MessageSquare },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 min-h-[44px] font-semibold text-[14px] transition-colors"
                style={{ color: '#F2F0EB' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
                onMouseLeave={e => (e.currentTarget.style.color = '#F2F0EB')}
              >
                <item.icon className="h-4 w-4 shrink-0" style={{ color: '#6E7681' }} />
                {item.label}
              </Link>
            ))}

            {/* Services expandable */}
            <div>
              <button
                type="button"
                onClick={() => setServicesExpanded(e => !e)}
                className="flex items-center justify-between w-full px-4 py-3.5 min-h-[44px] font-semibold text-[14px] transition-colors"
                style={{ color: '#F2F0EB' }}
                aria-expanded={servicesExpanded}
              >
                <span className="flex items-center gap-3">
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${servicesExpanded ? 'rotate-180' : ''}`}
                    style={{ color: '#6E7681' }}
                  />
                  What we offer
                </span>
              </button>
              <div
                className={`grid transition-all duration-200 ease-out overflow-hidden ${servicesExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                aria-hidden={!servicesExpanded}
              >
                <div className="min-h-0">
                  <div className="pl-4 pr-2 pb-2 space-y-0.5 border-l-2 ml-6" style={{ borderColor: '#EE6B1A' }}>
                    {NAV_SERVICES.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-[13px] transition-colors"
                        style={{ color: '#6E7681' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#F2F0EB')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#6E7681')}
                      >
                        <span className="w-4 text-center text-[12px]">{item.emoji}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 min-h-[44px] font-semibold text-[14px] transition-colors"
              style={{ color: '#F2F0EB' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#F2F0EB')}
            >
              <DollarSign className="h-4 w-4 shrink-0" style={{ color: '#6E7681' }} />
              Pricing
            </Link>
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 min-h-[44px] font-semibold text-[14px] transition-colors"
              style={{ color: '#F2F0EB' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#F2F0EB')}
            >
              <Calendar className="h-4 w-4 shrink-0" style={{ color: '#6E7681' }} />
              Book a call
            </Link>
          </nav>

          {/* Footer actions */}
          <div className="shrink-0 border-t-2 p-5 space-y-3" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="block text-center px-4 py-3 min-h-[44px] text-[14px] font-semibold transition-colors border-2"
              style={{ color: '#F2F0EB', borderColor: 'rgba(110,118,129,0.35)' }}
            >
              Sign in
            </Link>
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="aa-btn block text-center px-4 py-3 min-h-[44px] text-[14px] font-bold uppercase tracking-wide"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Get started
            </Link>
          </div>
        </div>
      </>,
      document.body
    )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="grid h-10 w-10 place-items-center transition-colors md:hidden"
        style={{ color: '#6E7681' }}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <Menu className="h-6 w-6" />
      </button>
      {menuPortal}
    </>
  )
}
