// ===========================================
// ROOT LAYOUT
// ===========================================
// This wraps EVERY page in your app
// ClerkProvider enables authentication everywhere

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

// Use Inter font (clean, professional)
const inter = Inter({ subsets: ['latin'] })

// SEO metadata
export const metadata: Metadata = {
  title: 'MissedCall AI - Missed Revenue Recovery',
  description: 'Recover revenue from missed calls. Our SMS turns unanswered calls into booked appointments so you never leave money on the table.',
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
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
