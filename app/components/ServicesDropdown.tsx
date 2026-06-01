'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
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
      className="relative hidden sm:block"
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
        aria-controls="services-menu"
        id="services-trigger"
      >
        What we offer
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${show ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        id="services-menu"
        role="menu"
        aria-labelledby="services-trigger"
        className={`absolute top-full left-0 pt-3 min-w-[230px] z-50 ${show ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div
          className={`border-2 py-2 transition-all duration-200 ease-out ${show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
          style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.4)' }}
        >
          {/* Orange top accent bar */}
          <div className="h-0.5 w-full mb-2" style={{ background: '#EE6B1A' }} />
          {NAV_SERVICES.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{ color: '#6E7681' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#F2F0EB'; e.currentTarget.style.background = 'rgba(242,240,235,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6E7681'; e.currentTarget.style.background = 'transparent' }}
            >
              <span className="w-4 text-center text-[12px]" aria-hidden>{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
