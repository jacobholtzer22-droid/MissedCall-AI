'use client'

import { useEffect, useState } from 'react'
import { SETUP_FEE_FULL, SETUP_FEE_DISCOUNTED, DISCOUNT_PERCENT, type CouponState } from '@/lib/coupon'

// ─────────────────────────────────────────────────────────
// The 24 hour window starts automatically on first pageview. There is no claim
// button and nothing for the visitor to do: booking inside the window applies
// the discount by itself.
//
// The deadline is whatever the server stored at first visit. This component
// never invents one and never restarts one. It receives the server state as a
// prop so the countdown is correct on first paint, then re-reads from the
// server on mount to survive a cached page being restored from bfcache.
//
// $400 is the real setup fee and matches the live ads. There is no inflated
// anchor: the percentage is derived from the two real numbers.
// ─────────────────────────────────────────────────────────

function remaining(expiresAt: string): { done: boolean; label: string } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { done: true, label: '00:00:00' }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { done: false, label: `${pad(h)}:${pad(m)}:${pad(s)}` }
}

export default function CouponBanner({ initial }: { initial: CouponState }) {
  const [state, setState] = useState<CouponState>(initial)
  const [, setTick] = useState(0)

  // Re-sync with the server after mount. A page restored from bfcache can be
  // minutes or hours stale, and a countdown that resumes from a stale number
  // would be lying.
  useEffect(() => {
    let cancelled = false
    const sync = () => {
      fetch('/api/coupon/status')
        .then((r) => r.json())
        .then((d: CouponState) => !cancelled && setState(d))
        .catch(() => {})
    }
    sync()
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) sync()
    }
    window.addEventListener('pageshow', onShow)
    return () => {
      cancelled = true
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'active') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.status])

  // Expired or absent: banner is gone, full price, no drama.
  if (state.status !== 'active') return null
  const left = remaining(state.expiresAt)
  if (left.done) return null

  return (
    <div
      className="border-2 px-4 py-3.5 sm:px-5 sm:py-4"
      style={{ borderColor: 'rgba(238,107,26,0.5)', background: 'rgba(238,107,26,0.09)' }}
      aria-live="off"
    >
      <p className="text-[15px] font-bold leading-[1.5]" style={{ color: '#F2F0EB' }}>
        {DISCOUNT_PERCENT}% off your setup fee if you book in the next{' '}
        <span className="tabular-nums whitespace-nowrap" style={{ color: '#EE6B1A' }}>
          {left.label}
        </span>
      </p>
      <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.75)' }}>
        Setup is ${SETUP_FEE_FULL}. Book a time before the clock runs out and it is $
        {SETUP_FEE_DISCOUNTED}. No code to enter, it comes off by itself.
      </p>
    </div>
  )
}

/** Compact line for the point of decision: booking CTA and wizard confirm. */
export function CouponApplied({ state }: { state: CouponState }) {
  if (state.status !== 'active') return null
  if (new Date(state.expiresAt).getTime() <= Date.now()) return null
  return (
    <p
      className="text-[13px] font-semibold leading-[1.6] mb-4 px-3.5 py-2.5 border-2"
      style={{ borderColor: 'rgba(238,107,26,0.4)', background: 'rgba(238,107,26,0.08)', color: '#EE6B1A' }}
    >
      {DISCOUNT_PERCENT}% off applied: setup fee ${SETUP_FEE_FULL} &rarr; ${SETUP_FEE_DISCOUNTED}
    </p>
  )
}
