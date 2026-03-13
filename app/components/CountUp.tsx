'use client'

import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  end: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
  decimals?: number
}

export default function CountUp({ end, prefix = '', suffix = '', duration = 2000, className = '', decimals = 0 }: CountUpProps) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          setStarted(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return

    const startTime = Date.now()
    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(eased * end)

      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(step)
  }, [started, end, duration])

  const display = decimals > 0
    ? count.toFixed(decimals)
    : Math.round(count).toLocaleString()

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  )
}
