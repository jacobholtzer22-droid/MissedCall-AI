'use client'

import Link from 'next/link'
import React from 'react'

type ScrollToBookDemoLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string
}

export default function ScrollToBookDemoLink({ children, ...rest }: ScrollToBookDemoLinkProps) {
  return (
    <Link href="/book" {...rest}>
      {children}
    </Link>
  )
}
