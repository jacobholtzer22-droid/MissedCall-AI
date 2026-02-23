import Link from 'next/link'
import { Logo } from './Logo'
import { NavMenu } from './NavMenu'

export function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-white/10">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size="lg" className="shrink-0" />
            <span className="text-xl font-bold text-white">Align & Acquire</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-gray-400 hover:text-white transition hidden sm:inline">Home</Link>
            <Link href="/missedcall-ai" className="text-gray-400 hover:text-white transition hidden sm:inline">MissedCall AI</Link>
            <Link href="/websites" className="text-gray-400 hover:text-white transition hidden sm:inline">Websites</Link>
          </div>
          <div className="relative flex items-center space-x-4">
            <NavMenu />
            <Link href="/sign-in" className="text-gray-400 hover:text-white transition hidden sm:inline">
              Sign In
            </Link>
            <Link href="/sign-up" className="text-gray-400 hover:text-white transition hidden sm:inline">
              Sign Up
            </Link>
            <Link href="/#contact" className="bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-200 transition font-medium">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
