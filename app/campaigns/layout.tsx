import type { Metadata } from 'next'

// page.tsx is a client component and can't export metadata, so it lives here.
export const metadata: Metadata = {
  title: 'Email & SMS Campaigns for Home Service Businesses',
  description:
    'Send mass email and SMS campaigns to your whole client list from one dashboard. Fill slow weeks with jobs from past customers. $149/mo, unlimited campaigns.',
  alternates: { canonical: './' },
}

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
