import type { Metadata } from 'next'

// Bare wrapper: no site header, no footer links, white ground. The root layout
// paints dark, so the funnel repaints white here rather than in every child.
//
// The site NavBar already opts out of /book (see ConditionalNavBar).

export const metadata: Metadata = {
  title: 'Book a Free Demo',
  description:
    'Watch a 3-minute demo of the missed-call text-back system running on a live account, then grab a time with Jacob.',
  alternates: { canonical: './' },
}

export default function BookIndexLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-white text-neutral-900">{children}</div>
}
