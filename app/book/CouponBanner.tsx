'use client'

import { useEffect, useState } from 'react'
import {
  SETUP_FEE_FULL,
  SETUP_FEE_DISCOUNTED,
  SETUP_SAVINGS,
  MONTHLY_FEE,
  type CouponState,
} from '@/lib/coupon'

// ─────────────────────────────────────────────────────────
// The 24 hour window starts automatically on first pageview. There is no claim
// button and nothing for the visitor to do: booking inside the window applies
// the discount by itself.
//
// The deadline is whatever the server stored at first visit. This component
// never invents one and never restarts one. It receives the server state as a
// prop so the countdown is right on first paint, then re-reads from the server
// on mount to survive a page restored from bfcache.
//
// $400 is the real setup fee and matches the live ads. Every other number here
// is derived from it, so the strike-through price, the discounted price and the
// savings figure cannot disagree with each other.
// ─────────────────────────────────────────────────────────

function remaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { done: true, h: '00', m: '00', s: '00' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    done: false,
    h: pad(Math.floor(ms / 3_600_000)),
    m: pad(Math.floor((ms % 3_600_000) / 60_000)),
    s: pad(Math.floor((ms % 60_000) / 1000)),
  }
}

export default function CouponBanner({ initial }: { initial: CouponState }) {
  const [state, setState] = useState<CouponState>(initial)
  const [, setTick] = useState(0)

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

  if (state.status !== 'active') return null
  const left = remaining(state.expiresAt)
  if (left.done) return null

  const digit =
    'tabular-nums font-black leading-none text-[34px] sm:text-[40px] px-2.5 py-1.5 border-2'
  const digitStyle = { color: '#EE6B1A', borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.1)' }

  return (
    <div
      className="border-2 px-4 py-5 sm:px-6 sm:py-6"
      style={{ borderColor: 'rgba(238,107,26,0.55)', background: 'rgba(238,107,26,0.09)' }}
    >
      {/* Price comparison, side by side, so the saving is visible rather than
          something the reader has to work out. */}
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: '#6E7681' }}>
        One time setup fee
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <span
          className="text-[26px] font-bold leading-none line-through decoration-2"
          style={{ color: '#6E7681' }}
        >
          ${SETUP_FEE_FULL}
        </span>
        <span className="text-[44px] sm:text-[52px] font-black leading-none" style={{ color: '#EE6B1A' }}>
          ${SETUP_FEE_DISCOUNTED}
        </span>
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] px-2.5 py-1.5"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          You save ${SETUP_SAVINGS}
        </span>
      </div>
      <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.8)' }}>
        Then ${MONTHLY_FEE} a month.
      </p>

      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: '#6E7681' }}>
        ${SETUP_SAVINGS} off ends in
      </p>
      <div className="flex items-center gap-1.5" aria-label="Time remaining">
        {/* suppressHydrationWarning on the digits only: the server renders them
            at server time and the client recomputes a moment later, so they
            legitimately differ. Rendering the timer only after mount would
            leave a visible gap where the deadline should be. */}
        <span className={digit} style={digitStyle} suppressHydrationWarning>{left.h}</span>
        <span className="text-[26px] font-black" style={{ color: 'rgba(238,107,26,0.6)' }}>:</span>
        <span className={digit} style={digitStyle} suppressHydrationWarning>{left.m}</span>
        <span className="text-[26px] font-black" style={{ color: 'rgba(238,107,26,0.6)' }}>:</span>
        <span className={digit} style={digitStyle} suppressHydrationWarning>{left.s}</span>
      </div>
      <p className="mt-3 text-[13px] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.75)' }}>
        Book a time before it hits zero and the ${SETUP_SAVINGS} comes off by itself. No code to enter.
      </p>
    </div>
  )
}

/** Compact line for the point of decision: the wizard confirm screen. */
export function CouponApplied({ state }: { state: CouponState }) {
  if (state.status !== 'active') return null
  if (new Date(state.expiresAt).getTime() <= Date.now()) return null
  return (
    <div
      className="mb-4 px-3.5 py-3 border-2"
      style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.09)' }}
    >
      <p className="text-[14px] font-bold leading-[1.5]" style={{ color: '#F2F0EB' }}>
        Setup{' '}
        <span className="line-through" style={{ color: '#6E7681' }}>${SETUP_FEE_FULL}</span>{' '}
        <span style={{ color: '#EE6B1A' }}>${SETUP_FEE_DISCOUNTED}</span>
        <span style={{ color: '#6E7681' }}> · you save ${SETUP_SAVINGS}</span>
      </p>
      <p className="text-[12px] leading-[1.5] mt-1" style={{ color: 'rgba(242,240,235,0.7)' }}>
        Then ${MONTHLY_FEE} a month.
      </p>
    </div>
  )
}
