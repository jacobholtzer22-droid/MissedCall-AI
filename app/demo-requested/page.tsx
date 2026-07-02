import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheckBig, ArrowRight } from 'lucide-react'

// Post-form confirmation page — not a landing page, so keep it out of the index.
export const metadata: Metadata = {
  title: 'Demo Request Received',
  robots: { index: false, follow: false },
}

export default function DemoRequestedPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>
      <div className="max-w-md w-full text-center border-2 p-10" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
        <div className="flex justify-center mb-6">
          <CircleCheckBig size={56} strokeWidth={1.75} style={{ color: '#EE6B1A' }} />
        </div>
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
          <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
          <span style={{ color: '#EE6B1A' }}>Demo request received</span>
        </div>
        <h1 className="text-[clamp(1.8rem,5vw,2.8rem)] font-black uppercase leading-[0.95] tracking-tight mb-4">
          You&apos;re all set.
        </h1>
        <p className="text-[15px] leading-relaxed mb-3" style={{ color: 'rgba(242,240,235,0.65)' }}>
          Thanks for your interest in MissedCall AI. We&apos;ll reach out within 24 hours to schedule your free demo call.
        </p>
        <p className="text-[13.5px] mb-8" style={{ color: '#6E7681' }}>
          Check your email for a confirmation.
        </p>
        <Link
          href="/"
          className="aa-btn inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-bold uppercase tracking-wide"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          Back to home <ArrowRight size={15} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  )
}
