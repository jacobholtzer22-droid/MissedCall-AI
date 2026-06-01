import Link from 'next/link'
import { Logo } from './Logo'
import { NavMenu } from './NavMenu'
import { ServicesDropdown } from './ServicesDropdown'

export function NavBar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b-2"
      style={{
        background: 'rgba(22,24,28,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderColor: 'rgba(110,118,129,0.3)',
      }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex items-center justify-between py-3.5">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Logo size="sm" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-7 md:flex">
            <Link href="/" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              Home
            </Link>
            <Link href="/missedcall-ai" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              MissedCall AI
            </Link>
            <ServicesDropdown />
            <Link href="/pricing" className="aa-nav-link text-[13px] font-semibold" style={{ color: '#F2F0EB' }}>
              Pricing
            </Link>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/sign-in"
              className="hidden text-[13px] font-semibold sm:block aa-nav-link"
              style={{ color: '#6E7681' }}
            >
              Sign in
            </Link>
            <Link
              href="/book"
              className="aa-btn inline-flex items-center gap-1.5 border-0 px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Get started
            </Link>
            <NavMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}
