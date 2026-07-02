import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'

const DESCRIPTION =
  'Automatically text back every missed call in seconds, capture the lead over SMS, and book the job before they call your competitor. Built for home service businesses.'

// page.tsx is a client component and can't export metadata, so it lives here.
export const metadata: Metadata = {
  title: 'Missed Call Text Back Service: Turn Missed Calls Into Booked Jobs',
  description: DESCRIPTION,
  alternates: { canonical: './' },
}

const SERVICE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'MissedCall AI',
  serviceType: 'Missed call text back service',
  description: DESCRIPTION,
  provider: { '@id': 'https://www.alignandacquire.com/#business' },
}

// Mirrors the FAQ section rendered in page.tsx VERBATIM. If the FAQ copy on the
// page changes, this block must be updated in the same commit or they silently desync.
const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does it work with my existing phone number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "You keep your number. Set up call forwarding so unanswered calls go to your MissedCall AI number. Your customers never see the difference. They just get a helpful text when you can't answer.",
      },
    },
    {
      '@type': 'Question',
      name: "What if the AI can't help a customer?",
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It knows its limits. Complex or frustrated customers get flagged for human follow-up. You get notified, and they get a real person calling back.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does it cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Plans start at $300/month with a one-time setup fee. It typically pays for itself with one recovered appointment. Book a demo and we'll find the right plan for your business.",
      },
    },
    {
      '@type': 'Question',
      name: 'Can I customize what the AI says?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '100%. Greeting, services, special instructions, business hours. You control all of it. The AI adapts to your specific business.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does setup take?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Most businesses are live in under 15 minutes. We walk you through everything.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if I want to cancel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "No contracts. Cancel anytime. 30-day money-back guarantee. We're confident you won't want to, though.",
      },
    },
  ],
}

export default function MissedCallAiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={SERVICE_SCHEMA} />
      <JsonLd data={FAQ_SCHEMA} />
      {children}
    </>
  )
}
