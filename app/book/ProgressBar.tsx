'use client'

// Shared so the gate modal and the booking wizard cannot drift apart visually.
// Every bar on the funnel is this component.
//
// The percentage rides the end of the fill as a pill rather than sitting as
// plain text above it, so the number and the thing it describes are the same
// object. Stripe animation and width easing live in globals.css under
// .aa-progress-fill, behind a prefers-reduced-motion guard.

export default function ProgressBar({
  pct,
  label,
  min = 0,
}: {
  pct: number
  label: string
  /** Lower bound reported to assistive tech. The wizard starts at 50 because
   *  picking a time already counted as progress. */
  min?: number
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))

  return (
    <div className="px-5 pt-4 sm:px-7">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2.5"
        style={{ color: '#6E7681' }}
      >
        {label}
      </div>

      <div className="relative">
        <div
          className="h-[15px] w-full rounded-full overflow-hidden"
          style={{ background: 'rgba(110,118,129,0.22)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)' }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={min}
          aria-valuemax={100}
          aria-label={`Progress: ${label}`}
        >
          <div className="aa-progress-fill h-full rounded-full" style={{ width: `${clamped}%` }} />
        </div>

        {/* max() keeps the pill from hanging off the left edge at low
            percentages, where translate(-100%) would push it outside the
            track. It rides the fill everywhere above that floor. */}
        <span
          aria-hidden="true"
          className="aa-progress-pill absolute top-1/2 font-mono text-[10px] font-bold tabular-nums px-1.5 py-[3px] rounded-full pointer-events-none"
          style={{
            left: `max(2.6rem, ${clamped}%)`,
            transform: 'translate(-100%, -50%)',
            background: '#EE6B1A',
            color: '#16181C',
            boxShadow: '0 0 0 2px #16181C',
          }}
        >
          {clamped}%
        </span>
      </div>
    </div>
  )
}
