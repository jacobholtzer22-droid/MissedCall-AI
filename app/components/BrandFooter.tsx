'use client'

import Link from 'next/link'
import { Logo } from './Logo'
import { Wind, Leaf, Car, Droplets } from 'lucide-react'

const LINKS = [
  { label: 'MissedCall AI', href: '/missedcall-ai' },
  { label: 'Websites', href: '/websites' },
  { label: 'Google Ads', href: '/ads-management' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Spam Screening', href: '/spam-screening' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
]

const TRADES = [
  { icon: Wind, label: 'HVAC' },
  { icon: Leaf, label: 'Landscaping' },
  { icon: Car, label: 'Detailing' },
  { icon: Droplets, label: 'Plumbing' },
]

export default function BrandFooter() {
  return (
    <footer className="border-t-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: '#16181C' }}>
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Logo size="sm" />
            <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.6)' }}>
              Missed-call lead capture for working pros. HVAC, landscaping, plumbing, detailing — we keep your phone working while you work the job.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {TRADES.map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ borderColor: 'rgba(110,118,129,0.35)', color: '#6E7681' }}
                >
                  <t.icon size={12} strokeWidth={2.25} />
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 sm:grid-cols-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[13.5px] transition-colors py-1"
                style={{ color: 'rgba(242,240,235,0.65)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EE6B1A')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(242,240,235,0.65)')}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div
          className="mt-10 flex flex-col items-start justify-between gap-3 border-t-2 pt-6 sm:flex-row sm:items-center"
          style={{ borderColor: 'rgba(110,118,129,0.25)' }}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: '#6E7681' }}>
            © {new Date().getFullYear()} Align and Acquire · Michigan
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgba(110,118,129,0.55)' }}>
            Never miss a lead
          </span>
        </div>
      </div>
    </footer>
  )
}
