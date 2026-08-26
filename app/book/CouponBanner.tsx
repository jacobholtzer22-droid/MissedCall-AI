'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tag, Loader2 } from 'lucide-react'
import { SETUP_FEE_FULL, SETUP_FEE_DISCOUNTED, type CouponState } from '@/lib/coupon'

// ─────────────────────────────────────────────────────────
// $200 off the setup fee, 24 hours to book.
//
// The deadline is whatever the server stored at claim time. This component
// never invents one. On mount it asks /api/coupon/status, and the countdown is
// derived from that timestamp, so refreshing, clearing storage or coming back
// tomorrow all show the true remaining time. Expired says expired.
//
// $400 is the real setup fee and matches the live ads. There is no inflated
// anchor.
// ─────────────────────────────────────────────────────────

function remaining(expiresAt: string): { done: boolean; label: string } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { done: true, label: '0h 00m 00s' }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return { done: false, label: `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` }
}

export default function CouponBanner({ onClaimed }: { onClaimed?: (code: string) => void }) {
  const [state, setState] = useState<CouponState>({ status: 'none' })
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/coupon/status')
      .then((r) => r.json())
      .then((d: CouponState) => !cancelled && setState(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Drives the countdown re-render. The value comes from the server timestamp,
  // this only decides when to repaint.
  useEffect(() => {
    if (state.status !== 'active') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.status])

  const claim = useCallback(async () => {
    setClaiming(true)
    setError('')
    try {
      const res = await fetch('/api/coupon/claim', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Could not issue that code.')
        return
      }
      setState(data as CouponState)
      if (data?.status === 'active' && data?.code) onClaimed?.(data.code)
    } catch {
      setError('Network hiccup. Try again.')
    } finally {
      setClaiming(false)
    }
  }, [onClaimed])

  if (loading) return null

  const wrap = 'border-2 px-4 py-3.5 sm:px-5 sm:py-4'
  const orange = { borderColor: 'rgba(238,107,26,0.5)', background: 'rgba(238,107,26,0.09)' }
  const grey = { borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }

  if (state.status === 'active') {
    const left = remaining(state.expiresAt)
    if (left.done) {
      // Crossed zero while the page was open. Say so, do not roll it over.
      return (
        <div className={wrap} style={grey}>
          <p className="text-[13px] leading-[1.6]" style={{ color: '#6E7681' }}>
            Your ${SETUP_FEE_DISCOUNTED} setup offer expired. Setup is ${SETUP_FEE_FULL}. Book below and I will
            still walk you through the whole thing.
          </p>
        </div>
      )
    }
    return (
      <div className={wrap} style={orange} aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-bold" style={{ color: '#F2F0EB' }}>
            Setup ${SETUP_FEE_DISCOUNTED} instead of ${SETUP_FEE_FULL}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: '#EE6B1A' }}>
            code {state.code}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.75)' }}>
          Book a time in the next <span className="font-bold tabular-nums" style={{ color: '#EE6B1A' }}>{left.label}</span> and the discount holds.
        </p>
      </div>
    )
  }

  if (state.status === 'expired') {
    return (
      <div className={wrap} style={grey}>
        <p className="text-[13px] leading-[1.6]" style={{ color: '#6E7681' }}>
          Your ${SETUP_FEE_DISCOUNTED} setup offer (code {state.code}) expired. Setup is ${SETUP_FEE_FULL}.
        </p>
      </div>
    )
  }

  return (
    <div className={wrap} style={orange}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-[1.5]" style={{ color: '#F2F0EB' }}>
            Claim $200 off your setup fee
          </p>
          <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: 'rgba(242,240,235,0.75)' }}>
            Setup is ${SETUP_FEE_FULL}. Claim this and book within 24 hours and it is ${SETUP_FEE_DISCOUNTED}.
          </p>
        </div>
        <button
          type="button"
          onClick={claim}
          disabled={claiming}
          className="aa-btn inline-flex items-center gap-2 px-5 py-3 text-[14px] font-bold uppercase tracking-wide min-h-[48px] disabled:opacity-50"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          {claiming ? <Loader2 size={16} className="motion-safe:animate-spin" /> : <Tag size={16} strokeWidth={2.5} />}
          Claim it
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] font-semibold" style={{ color: '#EE6B1A' }}>{error}</p>}
    </div>
  )
}
