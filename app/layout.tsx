// ===========================================
// ROOT LAYOUT
// ===========================================
// This wraps EVERY page in your app
// ClerkProvider enables authentication everywhere

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ConditionalNavBar } from './components/ConditionalNavBar'
import MetaPixel from './components/MetaPixel'
import JsonLd from './components/JsonLd'
import './globals.css'

// Use Inter font (clean, professional)
const inter = Inter({ subsets: ['latin'] })

// SEO metadata
const SITE_DESCRIPTION =
  'Every missed call gets an instant text back. Lead capture, spam call screening, Google Ads, and websites for landscaping, HVAC, plumbing, and detailing businesses.'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.alignandacquire.com'),
  title: {
    default: 'Align & Acquire',
    template: '%s | Align & Acquire',
  },
  description: 'Helping service businesses capture more leads and grow with AI-powered communication tools.',
  // og:image comes from the file convention: app/opengraph-image.tsx (1200x630)
  openGraph: {
    title: 'Align & Acquire',
    description: SITE_DESCRIPTION,
    url: 'https://www.alignandacquire.com',
    siteName: 'Align & Acquire',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Align & Acquire',
    description: SITE_DESCRIPTION,
  },
}

// Sitewide structured data. NAP fields must match the Google Business Profile
// exactly: name "Align and Acquire", phone +15175809709. The GBP is a
// service-area business with no displayed address, so `address` is
// deliberately omitted — geography is carried by areaServed only.
const BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': 'https://www.alignandacquire.com/#business',
  name: 'Align and Acquire',
  url: 'https://www.alignandacquire.com',
  telephone: '+15175809709',
  areaServed: ['Michigan', 'Texas', 'United States'],
  description: SITE_DESCRIPTION,
  logo: 'https://www.alignandacquire.com/aa-logo.png',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.className} bg-gray-950 text-white antialiased`}>
          <JsonLd data={BUSINESS_SCHEMA} />
          <MetaPixel />
          <ConditionalNavBar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
