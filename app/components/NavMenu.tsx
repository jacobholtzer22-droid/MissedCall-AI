'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Menu, X } from 'lucide-react'
import { NAV_SERVICES } from '@/app/config/nav-services'
import { Logo } from './Logo'

/**
 * Mobile hamburger menu — flat list, no nested accordion.
 * Services drill into top-level pages directly; no expand/collapse.
 * Keeps the panel scannable on small screens.
 */

const PRIMARY_LINKS = [
  { label: 'MissedCall AI', href: '/missedcall-ai' },
  { label: 'Pricing',        href: '/pricing' },
  { label: 'Book a call',    href: '/book' },
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

  const menuPortal =
    mounted &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-[9998] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'rgba(22,24,28,0.72)', backdropFilter: 'blur(4px)' }}
          onClick={close}
          aria-hidden
        />

        {/* Slide-in panel */}
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

          {/* Nav content — scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">

            {/* Primary links */}
            {PRIMARY_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="flex items-center px-3 py-3 min-h-[44px] text-[14px] font-semibold rounded-none transition-colors"
                style={{ color: '#F2F0EB' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
                onMouseLeave={e => (e.currentTarget.style.color = '#F2F0EB')}
              >
                {l.label}
              </Link>
            ))}

            {/* Services divider */}
            <div className="pt-3 pb-1">
              <span className="block px-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: '#6E7681' }}>
                Services
              </span>
            </div>

            {/* Flat service links — each with icon */}
            {NAV_SERVICES.map(item => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] text-[13px] font-medium transition-colors"
                  style={{ color: '#6E7681' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#F2F0EB')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6E7681')}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center border" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
                    <Icon size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </div>

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
      {menuPortal}
    </>
  )
}
