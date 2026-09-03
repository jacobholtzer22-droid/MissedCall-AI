import { redirect } from 'next/navigation'
import { verifyWatchToken } from '@/lib/watch-token'

export const dynamic = 'force-dynamic'

/**
 * Compatibility only. Links texted before the arms were split still point here,
 * and those messages are already on people's phones — this cannot just 404.
 * The token carries the arm, so route on it.
 */
export default function LegacyWatchRedirect({ searchParams }: { searchParams: { t?: string } }) {
  const claim = verifyWatchToken(searchParams?.t)
  if (!claim.ok) redirect('/book')
  redirect(`/book/${claim.arm.toLowerCase()}/watch?t=${encodeURIComponent(searchParams?.t ?? '')}`)
}
