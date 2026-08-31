'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { OTP_MAX_RESENDS } from './constants'

// ─────────────────────────────────────────────────────────
// Shared 6-digit verification screen. Used by BOTH arms so the wording, the
// resend rules and the error copy cannot drift between them.
//
// autoComplete="one-time-code" is the whole reason iOS offers the code above
// the keyboard. Paired with inputMode="numeric" and a single input rather than
// six boxes: six boxes look nicer and break iOS autofill, which matters more.
// ─────────────────────────────────────────────────────────

const border = 'rgba(110,118,129,0.35)'

export default function OtpScreen({
  phone,
  onVerified,
  onBack,
  headline = 'Check your texts',
}: {
  phone: string
  /** Fired with the single-use ticket the lead write must redeem. */
  onVerified: (verificationId: string) => void | Promise<void>
  onBack?: () => void
  headline?: string
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resends, setResends] = useState(0)
  const [resent, setResent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  async function submit(value: string) {
    if (submittedRef.current) return
    const clean = value.replace(/\D/g, '')
    if (clean.length !== 6) {
      setError('Enter the 6-digit code.')
      return
    }
    submittedRef.current = true
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: clean }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.verificationId) {
        setError(json?.error || 'That code is not right.')
        setCode('')
        submittedRef.current = false
        setBusy(false)
        return
      }
      await onVerified(json.verificationId as string)
    } catch {
      setError('Could not check that code. Try again.')
      submittedRef.current = false
      setBusy(false)
    }
  }

  async function resend() {
    if (resends >= OTP_MAX_RESENDS || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Could not send another code.')
      } else {
        setResends((n) => n + 1)
        setResent(true)
        setCode('')
        submittedRef.current = false
        inputRef.current?.focus()
      }
    } catch {
      setError('Could not send another code.')
    } finally {
      setBusy(false)
    }
  }

  const resendsLeft = OTP_MAX_RESENDS - resends

  return (
    <div>
      <h2 className="text-[clamp(1.4rem,4.6vw,1.9rem)] font-black uppercase leading-[1.15] tracking-tight mb-2">
        {headline}
      </h2>
      <p className="text-[14px] leading-[1.6] mb-5" style={{ color: 'rgba(242,240,235,0.6)' }}>
        I sent a 6-digit code to {phone}. Enter it to continue.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(code)
        }}
      >
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(next)
            setError('')
            // iOS autofill drops all six digits at once. Submitting on a
            // complete code is what makes that feel instant instead of making
            // someone hunt for the button after their phone already filled it.
            if (next.length === 6) void submit(next)
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={6}
          placeholder="123456"
          aria-label="6-digit verification code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'otp-error' : undefined}
          className="w-full px-4 py-4 border-2 text-[24px] font-bold tracking-[0.4em] text-center outline-none bg-transparent focus:border-[#EE6B1A]"
          style={{ borderColor: error ? '#EE6B1A' : border, color: '#F2F0EB' }}
        />
        {error && (
          <p id="otp-error" className="mt-2 text-[13px] font-semibold leading-[1.5]" style={{ color: '#EE6B1A' }}>
            {error}
          </p>
        )}
        {!error && resent && (
          <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: 'rgba(242,240,235,0.6)' }}>
            New code sent.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="aa-btn mt-5 w-full py-4 text-[16px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          {busy ? (<><Loader2 size={18} className="motion-safe:animate-spin" /> One sec</>) : 'Verify'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.2em] min-h-[44px]"
            style={{ color: '#6E7681' }}
          >
            Wrong number?
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy || resendsLeft <= 0}
          className="font-mono text-[11px] uppercase tracking-[0.2em] min-h-[44px] disabled:opacity-40"
          style={{ color: '#EE6B1A' }}
        >
          {resendsLeft > 0 ? `Resend code (${resendsLeft} left)` : 'No resends left'}
        </button>
      </div>
    </div>
  )
}
