import type { Metadata } from 'next'

// page.tsx is a client component and can't export metadata, so it lives here.
export const metadata: Metadata = {
  title: 'About Us: Lead Capture & Marketing Built for the Trades',
  description:
    'Align and Acquire builds lead capture, websites, and Google Ads for trade businesses — HVAC, landscaping, plumbing, detailing — as one founder-run system.',
  alternates: { canonical: './' },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
