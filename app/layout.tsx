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
  openGraph: {
    title: 'Align & Acquire',
    description: SITE_DESCRIPTION,
    url: 'https://www.alignandacquire.com',
    siteName: 'Align & Acquire',
    type: 'website',
    // TODO: replace with a dedicated 1200x630 og image (logo is 751x507)
    images: [{ url: '/aa-logo.png', width: 751, height: 507, alt: 'Align & Acquire' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Align & Acquire',
    description: SITE_DESCRIPTION,
    images: ['/aa-logo.png'],
  },
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
          <MetaPixel />
          <ConditionalNavBar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
