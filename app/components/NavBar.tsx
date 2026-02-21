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
          <div className="relative flex items-center space-x-3">
            <NavMenu />
            <Link href="/sign-in" className="text-gray-400 hover:text-white transition hidden sm:inline text-sm">
              Sign In
            </Link>
            <Link href="/sign-up" className="text-gray-300 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-lg transition text-sm font-medium hidden sm:inline-flex items-center">
              Sign Up
            </Link>
            <Link href="/missedcall-ai#book-demo" className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 text-white px-5 py-2.5 rounded-lg transition font-semibold text-base shadow-lg shadow-blue-500/25">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
