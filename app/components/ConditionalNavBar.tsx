'use client'

import { usePathname } from 'next/navigation'
import { NavBar } from './NavBar'

export function ConditionalNavBar() {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.includes('/embed') || pathname?.startsWith('/book')) {
    return null
  }
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up'
  return (
    <div className={isAuthPage ? 'hidden md:block' : ''}>
      <NavBar />
    </div>
  )
}
