import Link from 'next/link'
import { Logo } from './Logo'
import { NavMenu } from './NavMenu'

export function NavBar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b-2"
      style={{
        background: 'rgba(22,24,28,0.94)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderColor: 'rgba(110,118,129,0.28)',
      }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex items-center justify-between py-3.5">

          {/* ── Left: Logo + wordmark ── */}
          <Link href="/" className="flex items-center gap-3 shrink-0 min-w-0">
            <Logo size="sm" className="shrink-0" />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[15px] font-extrabold tracking-tight" style={{ color: '#F2F0EB' }}>
                Align and Acquire
              </span>
            </div>
          </Link>

          {/* ── Center: 3 primary nav items (desktop only) ── */}
          <nav className="hidden lg:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
            <Link href="/missedcall-ai" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              MissedCall AI
            </Link>
            <Link href="/services" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              Services
            </Link>
            <Link href="/pricing" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              Pricing
            </Link>
            <Link href="/reviews" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              Testimonials
            </Link>
            <Link href="/about" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              About
            </Link>
          </nav>

          {/* ── Right: Sign in + CTA + hamburger ── */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/sign-in"
              className="hidden lg:block text-[13px] font-semibold transition-colors"
              style={{ color: '#6E7681' }}
            >
              Client Portal
            </Link>
            <Link
              href="/book"
              className="aa-btn inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Book a Free Call
            </Link>
            <NavMenu />
          </div>

        </div>
      </div>
    </nav>
  )
}
