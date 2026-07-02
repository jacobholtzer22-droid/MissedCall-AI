import type { Metadata } from 'next'

// Metadata for the /book marketing wizard (page.tsx is a client component).
// The tenant /book/[businessSlug] segment overrides title/description/canonical below it.
export const metadata: Metadata = {
  title: 'Book a Free Demo',
  description:
    "Book a free strategy call with Align and Acquire. A couple quick questions to see if we're a fit, then grab a time that works. No pitch, no pressure.",
  alternates: { canonical: './' },
}

export default function BookIndexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
