'use client'

// Shared so the gate modal and the booking wizard cannot drift apart visually.
// Both show the same label / percent / rule treatment.
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
        className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] mb-2"
        style={{ color: '#6E7681' }}
      >
        <span>{label}</span>
        <span style={{ color: '#EE6B1A' }}>{clamped}%</span>
      </div>
      <div
        className="h-1 w-full"
        style={{ background: 'rgba(110,118,129,0.25)' }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={min}
        aria-valuemax={100}
        aria-label={`Progress: ${label}`}
      >
        <div className="h-1 transition-all duration-300" style={{ width: `${clamped}%`, background: '#EE6B1A' }} />
      </div>
    </div>
  )
}
