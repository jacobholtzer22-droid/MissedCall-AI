'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Check, Loader2 } from 'lucide-react'
import BookingWizard, { type ChosenSlot, type WizardPrefill } from './BookingWizard'
import type { Attribution } from '@/lib/attribution'

// ─────────────────────────────────────────────────────────
// Self-contained slot picker + booking wizard.
//
// Deliberately NOT a refactor of arm A's step 2. That section is welded to
// BookFunnelClient's own state (gate card, coupon strip, slot-taken notice,
// booked panel) and arm A is live traffic that must keep working untouched.
// Extracting it would have meant editing the arm under test to ship the arm
// that is not. The markup and tokens here match it so the two read the same.
// ─────────────────────────────────────────────────────────

const BORDER_DARK = 'rgba(110,118,129,0.35)'
const CARD_DARK = 'rgba(242,240,235,0.03)'
const BORDER_LIGHT = '#E5E5E5'
const CARD_LIGHT = '#FFFFFF'

type ApiSlot = { iso: string; display: string }
type ApiDay = { date: string; label: string; isToday: boolean; slots: ApiSlot[] }

export default function BookingSection({
  prefill,
  attribution,
  heading,
  bare = false,
  light = false,
  onSlotChosen,
  preselectIso,
  onBooked,
}: {
  prefill: WizardPrefill
  attribution: Record<string, string>
  heading: string
  /** Drop the bordered box. */
  bare?: boolean
  /** White ground and dark text, for the VSL pages. */
  light?: boolean
  /**
   * When supplied, picking a slot calls this INSTEAD of opening BookingWizard.
   * /calendar asks four fields, not the funnel's eight, so it supplies its own
   * form rather than forking the slot picker.
   */
  onSlotChosen?: (slot: ChosenSlot) => void
  /**
   * Pick this slot automatically once the day list loads. Validated against the
   * live slots first: a deep link texted an hour ago may point at a time that
   * has since gone, and silently selecting it would book a taken slot.
   */
  preselectIso?: string
  /**
   * Observer fired alongside this component's own confirmation state. The VSL
   * watch page uses it to fire Schedule with the id the server deduped on.
   */
  onBooked?: (r: {
    dateLabel: string
    timeLabel: string
    meetLink: string | null
    scheduleEventId?: string
  }) => void
}) {
  const [days, setDays] = useState<ApiDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<ChosenSlot | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [takenNote, setTakenNote] = useState('')
  const [booked, setBooked] = useState<{ dateLabel: string; timeLabel: string; meetLink: string | null } | null>(null)

  const BORDER = light ? BORDER_LIGHT : BORDER_DARK
  const CARD = light ? CARD_LIGHT : CARD_DARK
  const TEXT = light ? '#171717' : '#F2F0EB'
  const MUTED = light ? '#737373' : '#6E7681'

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

  useEffect(() => {
    if (!preselectIso || !days.length || slot) return
    for (const day of days) {
      const match = day.slots.find((s) => s.iso === preselectIso)
      if (match) {
        const chosen = { iso: match.iso, display: match.display, dateLabel: day.label }
        setSelectedDate(day.date)
        setSlot(chosen)
        if (onSlotChosen) onSlotChosen(chosen)
        else setWizardOpen(true)
        return
      }
    }
    // Not found: the slot is gone. Leave them on the picker rather than
    // pretending, and say so.
    setTakenNote('That time has been taken. Here is what is still open.')
  }, [preselectIso, days, slot, onSlotChosen])

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
          <span className="ml-2 text-[13px] font-normal" style={{ color: MUTED }}>({timezoneLabel})</span>
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
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: MUTED }}>
            <Calendar size={14} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
            {heading}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{timezoneLabel}</span>
        </div>

        {takenNote && (
          <p className="mb-4 text-[13px] font-semibold leading-[1.6]" style={{ color: '#EE6B1A' }}>{takenNote}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6" style={{ color: MUTED }}>
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
                    <div className="text-[11px] leading-[1.5] mt-0.5" style={{ color: MUTED }}>
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
              <p className="text-[14px] leading-[1.6]" style={{ color: MUTED }}>Nothing left that day. Try another.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => (
                  <button key={s.iso} type="button"
                    onClick={() => {
                      setTakenNote('')
                      const chosen = {
                        iso: s.iso,
                        display: s.display,
                        dateLabel: days.find((d) => d.date === selectedDate)?.label ?? '',
                      }
                      setSlot(chosen)
                      if (onSlotChosen) onSlotChosen(chosen)
                      else setWizardOpen(true)
                    }}
                    className="px-4 py-3 border-2 text-[14px] font-semibold min-h-[52px]"
                    style={{ borderColor: BORDER, color: TEXT }}>
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
        light={light}
        open={wizardOpen}
        slot={slot}
        prefill={prefill}
        attribution={attribution}
        // The lead already exists and is verified: this booking must enrich it,
        // not write a second unverified row.
        needsLeadWrite={false}
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
