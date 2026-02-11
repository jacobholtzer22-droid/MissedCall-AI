'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Home, MessageSquare, Globe, Calculator, Calendar, ImageIcon } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/missedcall-ai', label: 'MissedCall AI', icon: MessageSquare },
  { href: '/websites', label: 'Websites', icon: Globe },
  { href: '/missedcall-ai#roi-calculator', label: 'ROI Calculator', icon: Calculator },
  { href: '/websites#portfolio', label: 'Our Work', icon: ImageIcon },
  { href: '/missedcall-ai#book-demo', label: 'Book a Meeting', icon: Calendar },
]

export function NavMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 mt-2 w-64 py-2 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 max-h-[80vh] overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-white/5 transition"
                >
                  <Icon className="h-5 w-5 shrink-0 text-gray-500" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
