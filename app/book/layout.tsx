import type { Metadata } from 'next'

// Bare wrapper: no site header, no footer links, white ground. The root layout
// paints dark, so the funnel repaints white here rather than in every child.
// The site NavBar already opts out of /book (see ConditionalNavBar).
//
// The funnel palette lives here as CSS variables so it is tunable in one place
// without touching a component.

export const metadata: Metadata = {
  title: 'Book a Free Demo',
  description:
    'Watch a 3-minute demo of the missed-call text-back system running on a live account, then grab a time with Jacob.',
  alternates: { canonical: './' },
}

const FUNNEL_VARS = {
  '--funnel-headline': '#F5A623',
  '--funnel-banner': '#FF0000',
  '--funnel-ink': '#111111',
  '--funnel-border': '#E5E5E5',
} as React.CSSProperties

export default function BookIndexLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white" style={{ ...FUNNEL_VARS, color: 'var(--funnel-ink)' }}>
      {children}
    </div>
  )
}
