// The headline block, identical on both funnel pages. One component so the two
// pages cannot drift.

export default function FunnelHeadline() {
  return (
    <header className="mb-8">
      <h1
        className="text-center text-[clamp(1.35rem,5.4vw,1.9rem)] font-extrabold leading-[1.22] tracking-tight"
        style={{ color: 'var(--funnel-headline)' }}
      >
        We Help Contractors Get More Jobs With Smart Websites and a Missed Call System, Both Built With Speed to Lead, for Just
      </h1>
      {/* Its own line, and larger than the H1 it sits under: the price is the
          thing the ad promised, so it outranks the sentence introducing it. */}
      <p
        className="mt-2 text-center text-[clamp(1.75rem,7.5vw,2.6rem)] font-extrabold italic leading-[1.15]"
        style={{ color: 'var(--funnel-ink)' }}
      >
        $250/mo ↓
      </p>
    </header>
  )
}
