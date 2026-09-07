// The headline block, identical on both funnel pages. One component so the two
// pages cannot drift.

export default function FunnelHeadline() {
  return (
    <header className="mb-8">
      <h1
        className="text-center text-[clamp(1.3rem,5vw,1.8rem)] leading-[1.25] tracking-tight"
        style={{
          color: 'var(--funnel-primary)',
          fontFamily: 'var(--font-archivo), system-ui, sans-serif',
          fontWeight: 800,
        }}
      >
        We Help Contractors Catch More Jobs With Speed to Lead: Missed Call Text-Back and a Smart Website, for Just
      </h1>
      {/* Its own line and larger than the sentence above it: the price is the
          thing the ad promised, so it outranks the sentence introducing it.
          Near-black rather than brand colour, so it reads as a fact. */}
      <p
        className="mt-3 text-center text-[clamp(1.75rem,7.5vw,2.5rem)] leading-[1.15]"
        style={{
          color: 'var(--funnel-ink)',
          // Inter, not Archivo: Archivo is loaded at 800 only, and asking for
          // 700 from it would leave the browser to fake the weight. Archivo is
          // for the H1 and the section headings; everything else is Inter.
          fontFamily: 'var(--font-inter), system-ui, sans-serif',
          fontWeight: 700,
        }}
      >
        $250 a month ↓
      </p>
    </header>
  )
}
