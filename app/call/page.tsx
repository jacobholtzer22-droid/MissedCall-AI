import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Alias. Short enough to say out loud on a call. */
export default function CallAlias({ searchParams }: { searchParams: { l?: string } }) {
  redirect(searchParams?.l ? `/calendar?l=${encodeURIComponent(searchParams.l)}` : '/calendar')
}
