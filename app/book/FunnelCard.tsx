// Section heading + the card it labels.
//
// Was a full-width red bar sitting flush on the card. Now a left-aligned
// heading with a short rule under it: the bar competed with the headline and
// the thumbnail for the same attention, and a label does not need to shout to
// be found.

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2
        className="text-[17px] leading-[1.3] tracking-tight"
        style={{
          color: 'var(--funnel-primary)',
          fontFamily: 'var(--font-archivo), system-ui, sans-serif',
          fontWeight: 800,
        }}
      >
        {children}
      </h2>
      {/* Short rule, not a full-width divider: it belongs to the words above
          it, not to the width of the page. */}
      <div className="mt-2 h-[3px] w-12 rounded-full" style={{ background: 'var(--funnel-primary)' }} />
    </div>
  )
}

export function BannerCard({
  banner,
  children,
  className = '',
  framed = false,
}: {
  banner: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Thin brand border. Used on the video card so the still reads as the thing. */
  framed?: boolean
}) {
  return (
    <section className={className}>
      <SectionHeading>{banner}</SectionHeading>
      <div
        className="overflow-hidden rounded-lg border bg-white"
        style={{ borderColor: framed ? 'var(--funnel-primary)' : 'var(--funnel-border)' }}
      >
        {children}
      </div>
    </section>
  )
}

export function FunnelButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg py-4 text-[17px] font-bold text-white disabled:opacity-50"
      style={{ background: 'var(--funnel-accent)' }}
    >
      {children}
    </button>
  )
}
