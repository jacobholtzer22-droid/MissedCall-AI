'use client'

// Recovered from the pre-rebuild gate (df2b591:app/book/ProgressBar.tsx) and
// re-themed for the white funnel. Structure is unchanged: the percentage rides
// the end of the fill as a pill rather than sitting as plain text above it, so
// the number and the thing it describes are the same object.

export default function FunnelProgressBar({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))

  return (
    <div className="mb-6">
      <div className="relative">
        <div
          className="h-[14px] w-full overflow-hidden rounded-full"
          style={{ background: '#EFEFEF', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)' }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={50}
          aria-valuemax={100}
          aria-label={label}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${clamped}%`, background: 'var(--funnel-banner)' }}
          />
        </div>

        {/* max() keeps the pill from hanging off the left edge at low
            percentages, where translate(-100%) would push it outside the track. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 rounded-full px-1.5 py-[3px] text-[10px] font-bold tabular-nums"
          style={{
            left: `max(2.6rem, ${clamped}%)`,
            transform: 'translate(-100%, -50%)',
            background: 'var(--funnel-banner)',
            color: '#FFFFFF',
            boxShadow: '0 0 0 2px #FFFFFF',
          }}
        >
          {clamped}%
        </span>
      </div>
      <p className="mt-2 text-[13px] font-medium text-neutral-500">{label}</p>
    </div>
  )
}
