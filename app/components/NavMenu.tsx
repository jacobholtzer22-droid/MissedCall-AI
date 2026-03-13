'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Menu, X, Home, MessageSquare, ChevronDown, DollarSign, Calendar } from 'lucide-react'
import { NAV_SERVICES } from '@/app/config/nav-services'

export function NavMenu() {
  const [open, setOpen] = useState(false)
  const [servicesExpanded, setServicesExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const menuPortal =
    mounted &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setOpen(false)}
          aria-hidden
        />

        {/* Slide-in panel - full viewport height, scrollable content */}
        <div
          className={`fixed top-0 right-0 h-full min-h-screen w-72 max-w-[85vw] bg-gray-900/98 backdrop-blur-lg border-l border-white/10 z-[9999] transition-transform duration-300 ease-out shadow-2xl ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="flex flex-col h-full min-h-screen p-6">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <span className="text-lg font-bold text-white">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="space-y-1 flex-1 min-h-0 overflow-y-auto py-2">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
              >
                <Home className="h-5 w-5 shrink-0 text-gray-500" />
                Home
              </Link>
              <Link
                href="/missedcall-ai"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
              >
                <MessageSquare className="h-5 w-5 shrink-0 text-gray-500" />
                MissedCall AI
              </Link>

              {/* Services expandable */}
              <div className="space-y-0">
                <button
                  type="button"
                  onClick={() => setServicesExpanded((e) => !e)}
                  className="flex items-center justify-between w-full gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
                  aria-expanded={servicesExpanded}
                >
                  <span className="flex items-center gap-3">
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200 ${servicesExpanded ? 'rotate-180' : ''}`}
                    />
                    What we offer
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-200 ease-out overflow-hidden ${servicesExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  aria-hidden={!servicesExpanded}
                >
                  <div className="min-h-0">
                    <div className="pl-4 pr-2 pb-2 space-y-0.5">
                      {NAV_SERVICES.map((item) => (
                        <Link
                          key={item.href + item.label}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition min-h-[44px]"
                        >
                          <span className="text-lg leading-none">{item.emoji}</span>
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
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
              >
                <DollarSign className="h-5 w-5 shrink-0 text-gray-500" />
                Pricing
              </Link>
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
              >
                <Calendar className="h-5 w-5 shrink-0 text-gray-500" />
                Book a Call
              </Link>
            </nav>

            <div className="pt-6 border-t border-white/10 space-y-3 flex-shrink-0">
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="block text-center px-4 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition min-h-[44px]"
              >
                Sign In
              </Link>
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className="block text-center bg-white text-gray-900 px-4 py-3 rounded-xl hover:bg-gray-200 transition font-semibold min-h-[44px]"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </>,
      document.body
    )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <Menu className="h-6 w-6" />
      </button>

      {menuPortal}
    </>
  )
}
