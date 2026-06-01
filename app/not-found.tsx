import Link from 'next/link'
import { ArrowRight, PhoneMissed } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 aa-grid-bg" style={{ background: '#16181C', color: '#F2F0EB' }}>
      <div className="text-center max-w-lg">
        <div className="flex justify-center mb-6">
          <PhoneMissed size={52} strokeWidth={1.75} style={{ color: '#EE6B1A' }} />
        </div>
        <div className="text-[clamp(5rem,20vw,10rem)] font-black leading-none tabular-nums mb-4" style={{ color: '#EE6B1A' }}>
          404
        </div>
        <h1 className="text-[clamp(1.6rem,4vw,2.6rem)] font-black uppercase leading-[0.95] tracking-tight mb-4">
          This page got lost.
        </h1>
        <p className="text-[15px] mb-8" style={{ color: '#6E7681' }}>
          Unlike your leads &mdash; we don&apos;t let those slip away.
        </p>
        <Link
          href="/"
          className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          Take me home <ArrowRight size={16} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  )
}
