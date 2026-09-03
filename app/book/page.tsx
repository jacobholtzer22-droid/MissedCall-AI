import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { FUNNEL_VARIANT_COOKIE, assignFunnelVariant, isFunnelVariant } from '@/lib/funnel-variant'

export const dynamic = 'force-dynamic'

/**
 * Backstop only. Middleware normally 302s /book before this renders, and it is
 * the one that can persist the arm cookie. This exists so that if middleware
 * ever does not run for a request, /book still lands somewhere instead of
 * 404ing the URL every ad points at.
 */
export default async function BookSplitFallback({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const cookieStore = await cookies()
  const existing = cookieStore.get(FUNNEL_VARIANT_COOKIE)?.value
  const arm = isFunnelVariant(existing) ? existing : assignFunnelVariant()

  // Carry the whole query string, click ids included.
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x))
  }
  const suffix = qs.toString()
  redirect(`/book/${arm.toLowerCase()}${suffix ? `?${suffix}` : ''}`)
}
