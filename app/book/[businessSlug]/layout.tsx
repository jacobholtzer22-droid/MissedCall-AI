import type { Metadata } from 'next'
import { db } from '@/lib/db'

// page.tsx is a client component, so the per-business metadata lives in this layout.
export async function generateMetadata({
  params,
}: {
  params: { businessSlug: string }
}): Promise<Metadata> {
  const business = await db.business.findUnique({
    where: { slug: params.businessSlug },
    select: { name: true },
  })
  return {
    // Absolute: client-tenant booking pages shouldn't carry the Align & Acquire title suffix
    title: business
      ? { absolute: `Book a Quote with ${business.name}` }
      : { absolute: 'Schedule a Free In-Person Quote' },
  }
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen min-w-full"
      style={{ backgroundColor: '#f9fafb', color: '#111827', colorScheme: 'light' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
