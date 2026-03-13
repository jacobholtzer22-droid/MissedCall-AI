'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'

type ScrollToBookDemoLinkProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string
}

export default function ScrollToBookDemoLink({
  children,
  href = '/book',
  onClick,
  ...rest
}: ScrollToBookDemoLinkProps) {
  const router = useRouter()
  const pathname = usePathname()

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (onClick) {
      onClick(event)
    }
    if (event.defaultPrevented) return

    event.preventDefault()

    const targetId = 'book-demo'
    const isOnMissedCallPage = pathname === '/missedcall-ai'

    if (isOnMissedCallPage) {
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }

    router.push(href)
  }

  return (
    <button type="button" onClick={handleClick} {...rest}>
      {children}
    </button>
  )
}
