'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Check, Loader2 } from 'lucide-react'
import BookingWizard, { type ChosenSlot, type WizardPrefill } from './BookingWizard'
import type { Attribution } from '@/lib/attribution'
import type { CouponState } from '@/lib/coupon'

// ─────────────────────────────────────────────────────────
// Self-contained slot picker + booking wizard.
//
// Deliberately NOT a refactor of arm A's step 2. That section is welded to
// BookFunnelClient's own state (gate card, coupon strip, slot-taken notice,
// booked panel) and arm A is live traffic that must keep working untouched.
// Extracting it would have meant editing the arm under test to ship the arm
// that is not. The markup and tokens here match it so the two read the same.
// ─────────────────────────────────────────────────────────

const BORDER = 'rgba(110,118,129,0.35)'
const CARD = 'rgba(242,240,235,0.03)'

type ApiSlot = { iso: string; display: string }
type ApiDay = { date: string; label: string; isToday: boolean; slots: ApiSlot[] }

export default function BookingSection({
  prefill,
  attribution,
  coupon,
  heading,
  bare = false,
}: {
  prefill: WizardPrefill
  attribution: Record<string, string>
  coupon: CouponState
  heading: string
  /** Drop the bordered box. /book/thanks has no card-in-card. */
  bare?: boolean
}) {
  const [days, setDays] = useState<ApiDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<ChosenSlot | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [takenNote, setTakenNote] = useState('')
  const [booked, setBooked] = useState<{ dateLabel: string; timeLabel: string; meetLink: string | null } | null>(null)

  const timezoneLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    } catch {
      return ''
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/marketing-bookings')
        if (!res.ok) throw new Error('slots')
        const data = (await res.json()) as { days?: ApiDay[]; calendarUnavailable?: boolean }
        if (cancelled) return
        if (data.calendarUnavailable) setError('I cannot read my calendar right now. Try again in a minute.')
        const list = data.days ?? []
        setDays(list)
        const firstOpen = list.find((d) => d.slots.length > 0)
        setSelectedDate(firstOpen?.date ?? list[0]?.date ?? null)
      } catch {
        if (!cancelled) setError('Could not load times. Try again in a minute.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const daySlots = days.find((d) => d.date === selectedDate)?.slots ?? []

  if (booked) {
    return (
      <div className="border-2 p-6 sm:p-8 text-center" style={{ borderColor: 'rgba(238,107,26,0.45)', background: 'rgba(238,107,26,0.07)' }}>
        <div className="inline-flex items-center justify-center h-16 w-16 border-2 mb-6 mx-auto" style={{ borderColor: '#EE6B1A' }}>
          <Check size={32} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
        </div>
        <h3 className="text-[clamp(1.8rem,5vw,2.6rem)] font-black uppercase leading-[1.1] tracking-tight mb-4">Locked in.</h3>
        <p className="text-[16px] font-bold leading-[1.5] mb-2">
          {booked.dateLabel} at {booked.timeLabel}
          <span className="ml-2 text-[13px] font-normal" style={{ color: '#6E7681' }}>({timezoneLabel})</span>
        </p>
        {booked.meetLink && (
          <p className="text-[14px] leading-[1.6] mb-4">
            <a href={booked.meetLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={{ color: '#EE6B1A' }}>
              Join on Google Meet
            </a>
          </p>
        )}
        <p className="text-[14px] leading-[1.65]" style={{ color: 'rgba(242,240,235,0.6)' }}>
          You&apos;re talking to me, Jacob, the owner. Not a sales rep. You&apos;ll get a text from me confirming. Talk soon.
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        className={bare ? 'py-1' : 'border-2 p-5 sm:p-7'}
        style={bare ? undefined : { borderColor: BORDER, background: CARD }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
            <Calendar size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
            {heading}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#6E7681' }}>{timezoneLabel}</span>
        </div>

        {takenNote && (
          <p className="mb-4 text-[13px] font-semibold leading-[1.6]" style={{ color: '#EE6B1A' }}>{takenNote}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6" style={{ color: '#6E7681' }}>
            <Loader2 size={18} className="motion-safe:animate-spin" style={{ color: '#EE6B1A' }} />
            <span className="font-mono text-[11px] uppercase tracking-widest">Loading times</span>
          </div>
        ) : error ? (
          <p className="text-[14px] leading-[1.6]" style={{ color: '#EE6B1A' }}>{error}</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-3 mb-4 [scrollbar-width:none]">
              {days.map((d) => {
                const active = d.date === selectedDate
                const open = d.slots.length > 0
                return (
                  <button key={d.date} type="button" disabled={!open}
                    onClick={() => setSelectedDate(d.date)}
                    className="min-w-[108px] px-3 py-3 border-2 text-left text-[12px] shrink-0"
                    style={{
                      borderColor: active ? '#EE6B1A' : BORDER,
                      background: active ? 'rgba(238,107,26,0.1)' : 'transparent',
                      color: open ? (active ? '#F2F0EB' : '#6E7681') : 'rgba(110,118,129,0.4)',
                      cursor: open ? 'pointer' : 'not-allowed',
                    }}>
                    <div className="font-bold uppercase tracking-wide text-[11px] leading-[1.4]">
                      {d.isToday ? 'Today' : d.label.split(' ')[0]}
                    </div>
                    <div className="text-[11px] leading-[1.5] mt-0.5" style={{ color: '#6E7681' }}>
                      {d.isToday ? d.label : d.label.split(' ').slice(1).join(' ')}
                    </div>
                    <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: open ? '#EE6B1A' : 'rgba(110,118,129,0.4)' }}>
                      {open ? `${d.slots.length} open` : 'Full'}
                    </div>
                  </button>
                )
              })}
            </div>

            {daySlots.length === 0 ? (
              <p className="text-[14px] leading-[1.6]" style={{ color: '#6E7681' }}>Nothing left that day. Try another.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => (
                  <button key={s.iso} type="button"
                    onClick={() => {
                      setTakenNote('')
                      setSlot({ iso: s.iso, display: s.display, dateLabel: days.find((d) => d.date === selectedDate)?.label ?? '' })
                      setWizardOpen(true)
                    }}
                    className="px-4 py-3 border-2 text-[14px] font-semibold min-h-[52px]"
                    style={{ borderColor: BORDER, color: '#F2F0EB' }}>
                    <Clock size={13} strokeWidth={2.25} className="inline mr-1.5 -mt-0.5" style={{ color: '#EE6B1A' }} />
                    {s.display}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BookingWizard
        open={wizardOpen}
        slot={slot}
        prefill={prefill}
        attribution={attribution}
        // The lead already exists and is verified: this booking must enrich it,
        // not write a second unverified row.
        needsLeadWrite={false}
        coupon={coupon}
        onClose={() => setWizardOpen(false)}
        onLeadCaptured={() => {}}
        onSlotTaken={() => {
          setWizardOpen(false)
          setTakenNote('That time just got taken. Pick another and I kept everything else you entered.')
        }}
        onBooked={(r) => {
          setWizardOpen(false)
          setBooked({ dateLabel: r.dateLabel, timeLabel: r.timeLabel, meetLink: r.meetLink })
        }}
      />
    </>
  )
}
