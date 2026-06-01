'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { NAV_SERVICES } from '@/app/config/nav-services'

export function ServicesDropdown() {
  const [open, setOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const show = open || isHovering

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative hidden md:block"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="aa-nav-link flex items-center gap-1 text-[13px] font-semibold"
        style={{ color: '#F2F0EB' }}
        aria-expanded={show}
        aria-haspopup="true"
      >
        Services
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${show ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {/* Dropdown panel */}
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 w-[340px] z-50 transition-all duration-200 ease-out ${
          show ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="border-2 py-2" style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.4)' }}>
          {/* Orange top accent */}
          <div className="h-0.5 mx-4 mb-3" style={{ background: '#EE6B1A' }} />

          {NAV_SERVICES.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="group flex items-center gap-3.5 px-4 py-2.5 transition-colors duration-150"
                style={{ color: '#F2F0EB' }}
                onClick={() => setOpen(false)}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(242,240,235,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Icon box */}
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center"
                  style={{ background: 'rgba(26,74,112,0.6)' }}
                >
                  <Icon size={16} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                </span>

                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight" style={{ color: '#F2F0EB' }}>
                    {item.label}
                  </span>
                  <span className="block text-[11px] leading-tight mt-0.5" style={{ color: '#6E7681' }}>
                    {item.description}
                  </span>
                </span>

                <ArrowRight
                  size={13}
                  strokeWidth={2.25}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: '#EE6B1A' }}
                />
              </Link>
            )
          })}

          {/* Footer link */}
          <div className="mx-4 mt-2 border-t pt-2" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
              style={{ color: '#6E7681' }}
              onClick={() => setOpen(false)}
              onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6E7681')}
            >
              View all pricing
              <ArrowRight size={10} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
