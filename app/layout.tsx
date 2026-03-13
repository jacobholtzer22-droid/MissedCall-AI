// ===========================================
// ROOT LAYOUT
// ===========================================
// This wraps EVERY page in your app
// ClerkProvider enables authentication everywhere

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ConditionalNavBar } from './components/ConditionalNavBar'
import './globals.css'

// Use Inter font (clean, professional)
const inter = Inter({ subsets: ['latin'] })

// SEO metadata
export const metadata: Metadata = {
  title: {
    default: 'Align & Acquire — Helping Small Business Growth',
    template: '%s | Align & Acquire',
  },
  description: 'Helping small service businesses capture more leads and grow with AI-powered communication tools.',
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
          <ConditionalNavBar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
