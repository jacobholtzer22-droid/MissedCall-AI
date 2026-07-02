import type { Metadata } from 'next'

// page.tsx is a client component and can't export metadata, so it lives here.
export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Three system tiers — Catch, Grow, and Automate — or build your own plan à la carte. Missed call text back, websites, Google Ads, and campaigns. No contracts.',
  alternates: { canonical: './' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
