'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FunnelButton } from './FunnelCard'

// Date-first booking. Only the UI changed: availability, booking creation, the
// Google event with its Meet link, the confirmation SMS, the Schedule event and
// the funnelVariant stamp all still go through /api/marketing-bookings and
// /api/demo-book exactly as before.

type ApiSlot = { iso: string; display: string }
type ApiDay = { date: string; label: string; isToday: boolean; slots: ApiSlot[] }

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Slots shown before "More times". Keeps a busy day off a scroll marathon. */
const SLOT_PAGE = 8

/** A short, real list. Everything else is reachable by the visitor's own zone. */
const ZONES = [
  'America/New_York', 'America/Detroit', 'America/Chicago', 'America/Denver',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
]

function timeIn(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: tz,
    })
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

function monthMatrix(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  // Monday-first: JS getDay() is Sunday-first, so Sunday (0) becomes index 6.
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * "Thursday, September 4" from a YYYY-MM-DD key.
 *
 * Formatted here rather than in /api/marketing-bookings: that endpoint's short
 * label ("Thu, Sep 3") is what the other booking surfaces render, and widening
 * it there would change them all to satisfy this page.
 *
 * Parts are passed to the Date constructor rather than parsing the string,
 * because `new Date('2026-09-03')` is treated as UTC midnight and renders as
 * the previous day for anyone west of Greenwich.
 */
function longDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Booked = { dateLabel: string; timeLabel: string; meetLink: string | null }

export default function DateCalendar({
  durationMinutes,
  prefill,
  onBooked,
  booked,
}: {
  durationMinutes: number
  prefill: { firstName: string; phone: string; email: string; trade: string }
  onBooked: (r: Booked & { scheduleEventId: string }) => void
  /**
   * Lifted to the page. Two calendars render on the watch page, and a booking
   * made in one has to close the other — otherwise the second instance still
   * offers times for a call that is already on the books.
   */
  booked: Booked | null
}) {
  const [days, setDays] = useState<ApiDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [cursor, setCursor] = useState(() => new Date())
  const [tz, setTz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    } catch {
      return 'America/New_York'
    }
  })
  const [zoneOpen, setZoneOpen] = useState(false)
  // Long days would otherwise push the page into a scroll marathon on a phone.
  const [showAllSlots, setShowAllSlots] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const [slot, setSlot] = useState<ApiSlot | null>(null)
  const [company, setCompany] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const slotsRef = useRef<HTMLDivElement>(null)
  const scheduleEventId = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sched-${Date.now()}`
  )

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
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
        if (firstOpen) {
          setSelected(firstOpen.date)
          const [y, m] = firstOpen.date.split('-').map(Number)
          setCursor(new Date(y, m - 1, 1))
        }
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

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const selectedDay = selected ? byDate.get(selected) : undefined
  const cells = useMemo(() => monthMatrix(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const localTime = timeIn(now.toISOString(), tz)

  async function confirm() {
    if (!slot) return
    if (company.trim().length < 2) return setFormError('Please enter your company name.')
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch('/api/demo-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStart: slot.iso,
          name: prefill.firstName,
          phone: prefill.phone,
          email: prefill.email,
          trade: prefill.trade,
          companyName: company.trim(),
          eventId: scheduleEventId.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setFormError('That time was just taken. Pick another.')
        setSlot(null)
        return
      }
      if (!res.ok) {
        setFormError(data?.error || 'Could not book that. Try again.')
        return
      }
      onBooked({
        dateLabel: data?.appointment?.dateLabel ?? selectedDay?.label ?? '',
        timeLabel: data?.appointment?.timeLabel ?? timeIn(slot.iso, tz),
        meetLink: data?.appointment?.meetLink ?? null,
        scheduleEventId: scheduleEventId.current,
      })
    } catch {
      setFormError('Network hiccup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (booked) {
    return (
      <div className="p-5 text-center">
        <h3 className="mb-3 text-[22px] font-extrabold" style={{ color: 'var(--funnel-ink)' }}>Locked in.</h3>
        <p className="mb-3 text-[16px] font-bold">
          {booked.dateLabel} at {booked.timeLabel}
        </p>
        {booked.meetLink && (
          <p className="mb-3 text-[14px]">
            <a href={booked.meetLink} target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-4" style={{ color: 'var(--funnel-banner)' }}>
              Join on Google Meet
            </a>
          </p>
        )}
        <p className="text-[14px] leading-[1.6] text-neutral-600">
          You&apos;ll get a text confirming, and a calendar invite by email. Talk soon.
        </p>
      </div>
    )
  }

  // ── Confirm step ─────────────────────────────────────────────────────────
  if (slot) {
    return (
      <div className="p-5">
        <p className="mb-4 text-[18px] font-bold leading-[1.35]" style={{ color: 'var(--funnel-ink)' }}>
          {selected ? longDayLabel(selected) : ''} at {timeIn(slot.iso, tz)} ({tz})
        </p>
        <dl className="mb-5 space-y-2 text-[16px] text-neutral-700">
          {([['Name', prefill.firstName], ['Phone', prefill.phone], ['Email', prefill.email]] as const)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-16 shrink-0 text-neutral-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
        </dl>
        <label htmlFor="cal-company" className="mb-1.5 block text-[14px] font-semibold text-neutral-700">
          Company name
        </label>
        <input
          id="cal-company"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value)
            setFormError('')
          }}
          autoComplete="organization"
          className="mb-4 h-[48px] w-full rounded-lg border px-4 text-[16px] outline-none focus:border-neutral-900"
          style={{ borderColor: formError ? 'var(--funnel-banner)' : 'var(--funnel-border)' }}
        />
        {formError && (
          <p className="mb-3 text-[13px] font-medium" style={{ color: 'var(--funnel-banner)' }}>{formError}</p>
        )}
        <FunnelButton onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Booking…' : 'Confirm Booking'}
        </FunnelButton>
        <button
          type="button"
          onClick={() => {
            setSlot(null)
            setFormError('')
          }}
          className="mt-3 min-h-[44px] text-[16px] font-semibold text-neutral-500"
        >
          ← Back
        </button>
      </div>
    )
  }

  // ── Calendar ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-5">
      <p className="mb-3 text-[16px] font-bold" style={{ color: 'var(--funnel-ink)' }}>
        Demo Call - Align and Acquire ({durationMinutes} Min)
      </p>

      <div className="relative mb-4">
        <button
          type="button"
          onClick={() => setZoneOpen((o) => !o)}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-full border px-4 text-[16px]"
          style={{ borderColor: 'var(--funnel-border)' }}
          aria-expanded={zoneOpen}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20" />
          </svg>
          <span className="font-medium">{tz}</span>
          <span className="text-neutral-500">{localTime}</span>
          <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {zoneOpen && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white py-1 shadow-lg"
            style={{ borderColor: 'var(--funnel-border)' }}>
            {Array.from(new Set([tz, ...ZONES])).map((z) => (
              <li key={z}>
                <button
                  type="button"
                  onClick={() => {
                    setTz(z)
                    setZoneOpen(false)
                  }}
                  className="min-h-[44px] w-full px-4 text-left text-[16px] hover:bg-neutral-50"
                  style={z === tz ? { fontWeight: 700 } : undefined}
                >
                  {z}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-[14px] text-neutral-500">Loading times…</p>
      ) : error ? (
        <p className="py-6 text-[14px]" style={{ color: 'var(--funnel-banner)' }}>{error}</p>
      ) : (
        <div className="md:flex md:gap-6">
          {/* Calendar */}
          <div className="md:w-1/2 md:border-r md:pr-6" style={{ borderColor: 'var(--funnel-border)' }}>
            <div className="mb-3 flex items-center justify-between">
              <button type="button" aria-label="Previous month"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                className="grid h-11 w-11 place-items-center text-[22px] text-neutral-600">‹</button>
              <span className="text-[17px] font-bold">
                {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" aria-label="Next month"
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                className="grid h-11 w-11 place-items-center text-[22px] text-neutral-600">›</button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {DOW.map((d) => (
                <div key={d} className="py-1 text-[12px] font-semibold text-neutral-400">{d}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />
                const key = ymd(d)
                const day = byDate.get(key)
                const open = Boolean(day && day.slots.length > 0)
                const isSel = key === selected
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!open}
                    onClick={() => {
                      setSelected(key)
                      setShowAllSlots(false)
                      // Mobile: the slot list is below the grid, so bring the
                      // day label up rather than leaving them on the grid
                      // wondering whether the tap registered.
                      if (window.matchMedia('(max-width: 767px)').matches) {
                        setTimeout(() => slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
                      }
                    }}
                    className="mx-auto grid h-11 w-11 place-items-center rounded-full text-[16px]"
                    style={
                      isSel
                        ? { background: 'var(--funnel-banner)', color: '#FFFFFF', fontWeight: 700 }
                        : open
                        ? { background: 'rgba(255,0,0,0.10)', color: 'var(--funnel-banner)', fontWeight: 600 }
                        : { color: '#BDBDBD', cursor: 'not-allowed' }
                    }
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Slots */}
          <div ref={slotsRef} className="mt-6 md:mt-0 md:w-1/2 md:max-h-[360px] md:overflow-y-auto scroll-mt-4">
            <p className="mb-3 text-[18px] font-bold" style={{ color: 'var(--funnel-ink)' }}>
              {selected ? longDayLabel(selected) : 'Pick a day'}
            </p>
            {!selectedDay || selectedDay.slots.length === 0 ? (
              <p className="text-[14px] text-neutral-500">Nothing open that day. Try another.</p>
            ) : (
              <div className="space-y-2.5">
                {(showAllSlots ? selectedDay.slots : selectedDay.slots.slice(0, SLOT_PAGE)).map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    onClick={() => setSlot(s)}
                    className="h-[52px] w-full rounded-lg border-2 bg-white text-[17px] font-semibold"
                    style={{ borderColor: 'var(--funnel-banner)', color: 'var(--funnel-banner)' }}
                  >
                    {timeIn(s.iso, tz)}
                  </button>
                ))}
                {!showAllSlots && selectedDay.slots.length > SLOT_PAGE && (
                  <button
                    type="button"
                    onClick={() => setShowAllSlots(true)}
                    className="h-[52px] w-full rounded-lg border-2 border-dashed bg-white text-[16px] font-semibold text-neutral-600"
                    style={{ borderColor: 'var(--funnel-border)' }}
                  >
                    More times ({selectedDay.slots.length - SLOT_PAGE})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
