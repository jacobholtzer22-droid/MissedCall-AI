'use client'

import { useEffect, useRef, ReactNode } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  delay?: number
  stagger?: boolean
}

export default function ScrollReveal({ children, className = '', delay = 0, stagger = false }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (stagger) {
              const children = el.querySelectorAll('.scroll-reveal')
              children.forEach((child) => child.classList.add('revealed'))
            } else {
              el.classList.add('revealed')
            }
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [stagger])

  if (stagger) {
    return (
      <div ref={ref} className={`scroll-reveal-stagger ${className}`}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
