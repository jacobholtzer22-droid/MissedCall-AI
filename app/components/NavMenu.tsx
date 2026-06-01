'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'

const NAV_LINKS = [
  { label: 'MissedCall AI', href: '/missedcall-ai' },
  { label: 'Services',      href: '/services' },
  { label: 'Pricing',       href: '/pricing' },
  { label: 'About',         href: '/about' },
  { label: 'Book a call',   href: '/book' },
]

export function NavMenu() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const close = () => setOpen(false)

  const portal = mounted && typeof document !== 'undefined' && createPortal(
    <>
      <div
        className={`fixed inset-0 z-[9998] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(22,24,28,0.72)', backdropFilter: 'blur(4px)' }}
        onClick={close}
        aria-hidden
      />
      <div
        className={`fixed top-0 right-0 h-full min-h-screen w-72 max-w-[88vw] z-[9999] border-l-2 flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.3)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 px-5 py-4 shrink-0" style={{ borderColor: 'rgba(110,118,129,0.28)' }}>
          <Logo size="sm" />
          <button
            type="button"
            onClick={close}
            className="grid h-9 w-9 place-items-center"
            style={{ color: '#6E7681' }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="flex items-center px-3 py-3.5 min-h-[44px] text-[15px] font-semibold transition-colors border-l-2"
              style={{ color: '#F2F0EB', borderColor: 'transparent' }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#EE6B1A'
                e.currentTarget.style.borderColor = '#EE6B1A'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#F2F0EB'
                e.currentTarget.style.borderColor = 'transparent'
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t-2 p-4 space-y-2.5" style={{ borderColor: 'rgba(110,118,129,0.28)' }}>
          <Link
            href="/sign-in"
            onClick={close}
            className="flex items-center justify-center px-4 py-3 min-h-[44px] text-[14px] font-semibold border-2 transition-colors"
            style={{ color: '#F2F0EB', borderColor: 'rgba(110,118,129,0.35)' }}
          >
            Sign in
          </Link>
          <Link
            href="/book"
            onClick={close}
            className="aa-btn flex items-center justify-center px-4 py-3 min-h-[44px] text-[14px] font-bold uppercase tracking-wide"
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
        className="grid h-10 w-10 place-items-center md:hidden"
        style={{ color: '#6E7681' }}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <Menu size={22} />
      </button>
      {portal}
    </>
  )
}
