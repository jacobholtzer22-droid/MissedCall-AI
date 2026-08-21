import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/lib/db'

// page.tsx is a client component, so the per-business metadata lives in this layout.

// Memoized per request so generateMetadata and the layout share one query.
const getBusiness = cache(async (slug: string) =>
  db.business.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
)

/**
 * The Align and Acquire business exists as a tenant row, so its own
 * /book/[slug] page renders the client-facing in-person quote form: wrong copy
 * for us, duplicate of the real funnel, and no place to fire a booking event.
 * Anyone who lands there gets sent to /book instead.
 */
function isMarketingTenant(business: { id: string } | null, slug: string): boolean {
  if (!business) return false
  if (process.env.MARKETING_BUSINESS_ID && business.id === process.env.MARKETING_BUSINESS_ID) return true
  if (process.env.MARKETING_BUSINESS_SLUG && slug === process.env.MARKETING_BUSINESS_SLUG) return true
  return false
}

export async function generateMetadata({
  params,
}: {
  params: { businessSlug: string }
}): Promise<Metadata> {
  const business = await getBusiness(params.businessSlug)

  // Belt and braces alongside the redirect below: if this URL is ever reached
  // without redirecting, it must not be indexed as a duplicate of /book.
  if (isMarketingTenant(business, params.businessSlug)) {
    return {
      title: { absolute: 'Book a Free Demo' },
      robots: { index: false, follow: false },
      alternates: { canonical: '/book' },
    }
  }

  return {
    // Absolute: client-tenant booking pages shouldn't carry the Align and Acquire title suffix
    title: business
      ? { absolute: `Book a Quote with ${business.name}` }
      : { absolute: 'Schedule a Free In-Person Quote' },
    // Own description so the /book demo-call copy doesn't cascade onto tenant pages
    description: business
      ? `Schedule a free in-person quote with ${business.name}.`
      : 'Schedule a free in-person quote.',
    alternates: { canonical: `/book/${params.businessSlug}` },
  }
}

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { businessSlug: string }
}) {
  const business = await getBusiness(params.businessSlug)
  if (isMarketingTenant(business, params.businessSlug)) {
    redirect('/book')
  }

  return (
    <div
      className="min-h-screen min-w-full"
      style={{ backgroundColor: '#f9fafb', color: '#111827', colorScheme: 'light' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
