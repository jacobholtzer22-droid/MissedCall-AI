// ===========================================
// /book — VSL landing, identical for both arms
// ===========================================
// The coin flip and ?variant=A|B override are unchanged and still assigned in
// middleware; the ONLY thing the arm decides here is which video file the
// thumbnail and the watch page use.

import { cookies } from 'next/headers'
import VslLanding from './VslLanding'
import {
  FUNNEL_VARIANT_COOKIE,
  assignFunnelVariant,
  isFunnelVariant,
  funnelVariantFromQuery,
} from '@/lib/funnel-variant'
import { videoFor } from '@/lib/funnel-videos'

export const dynamic = 'force-dynamic'

export default async function BookPage({ searchParams }: { searchParams: { variant?: string } }) {
  const cookieStore = await cookies()

  // Middleware assigns and persists this. The fallback keeps the page rendering
  // if middleware ever did not run for the request.
  const fromCookie = cookieStore.get(FUNNEL_VARIANT_COOKIE)?.value
  const arm =
    funnelVariantFromQuery(searchParams?.variant) ??
    (isFunnelVariant(fromCookie) ? fromCookie : assignFunnelVariant())

  // Only the POSTER, which is shared. Handing the landing page the arm's video
  // URL would ship the one variable under test into a page that never plays it,
  // and leave the two arms' payloads differing for no reason.
  return <VslLanding arm={arm} poster={videoFor(arm).poster} />
}
