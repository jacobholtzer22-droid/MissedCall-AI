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
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-gray-400 hover:text-white transition"
        aria-expanded={show}
        aria-haspopup="true"
        aria-controls="services-menu"
        id="services-trigger"
      >
        What we offer
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${show ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        id="services-menu"
        role="menu"
        aria-labelledby="services-trigger"
        className={`absolute top-full left-0 pt-2 min-w-[220px] z-50 ${
          show ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          className={`rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-lg shadow-xl py-2 transition-all duration-200 ease-out ${
            show
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2'
          }`}
        >
          {NAV_SERVICES.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/5 transition first:rounded-t-xl last:rounded-b-xl"
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.emoji}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
