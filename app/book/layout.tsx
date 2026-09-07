import type { Metadata } from 'next'
import { Archivo, Inter } from 'next/font/google'

// Bare wrapper: no site header, no footer links, white ground. The root layout
// paints dark, so the funnel repaints white here rather than in every child.
// The site NavBar already opts out of /book (see ConditionalNavBar).
//
// The funnel palette and type live here as CSS variables so they are tunable in
// one place without touching a component.

export const metadata: Metadata = {
  title: 'Book a Free Demo',
  description:
    'Watch a 3-minute demo of the missed-call text-back system running on a live account, then grab a time with Jacob.',
  alternates: { canonical: './' },
}

// next/font downloads at build time and serves from our own origin, so there is
// no request to Google at runtime and no layout shift waiting on one.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['800'],
  variable: '--font-archivo',
  display: 'swap',
})
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * Brand palette, sampled from public/aa-logo.png.
 *
 * The wordmark is a vertical gradient: magenta at the top of the letters,
 * purple at the bottom. Both are taken from the letters, not the arrow — the
 * arrow is red, and red is exactly what this pass removes.
 */
const FUNNEL_VARS = {
  // Bottom of the "AA" glyphs.
  '--funnel-primary': '#8922E1',
  // Top of the "AA" glyphs.
  '--funnel-accent': '#DB39DA',
  '--funnel-ink': '#111111',
  '--funnel-border': '#E5E5E5',
} as React.CSSProperties

export default function BookIndexLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${archivo.variable} ${inter.variable} min-h-dvh bg-white`}
      style={{ ...FUNNEL_VARS, color: 'var(--funnel-ink)', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
    >
      {children}
    </div>
  )
}
