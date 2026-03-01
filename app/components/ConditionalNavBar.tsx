'use client'

import { usePathname } from 'next/navigation'
import { NavBar } from './NavBar'

export function ConditionalNavBar() {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.includes('/embed') || pathname?.startsWith('/book')) {
    return null
  }
  return <NavBar />
}
