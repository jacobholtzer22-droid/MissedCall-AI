import type { Metadata } from 'next'

// page.tsx is a client component and can't export metadata, so it lives here.
export const metadata: Metadata = {
  title: 'Missed Call Text Back Service: Turn Missed Calls Into Booked Jobs',
  description:
    'Automatically text back every missed call in seconds, capture the lead over SMS, and book the job before they call your competitor. Built for home service businesses.',
  alternates: { canonical: './' },
}

export default function MissedCallAiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
