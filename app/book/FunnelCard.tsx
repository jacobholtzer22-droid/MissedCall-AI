// A red section banner sitting flush on the card it labels. Flush is the point:
// a gap would read as two unrelated blocks rather than one labelled thing.

export function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-t-lg px-4 py-3 text-center text-[15px] font-bold leading-[1.35] text-white"
      style={{ background: 'var(--funnel-banner)' }}
    >
      {children}
    </div>
  )
}

export function BannerCard({
  banner,
  children,
  className = '',
}: {
  banner: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <Banner>{banner}</Banner>
      <div
        className="overflow-hidden rounded-b-lg border border-t-0 bg-white"
        style={{ borderColor: 'var(--funnel-border)' }}
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
      style={{ background: 'var(--funnel-banner)' }}
    >
      {children}
    </button>
  )
}
