import type { Metadata } from 'next'
import { armWatchPage } from '../../armPages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Watch the Demo',
  robots: { index: false, follow: false },
}

export default async function WatchArmAPage({ searchParams }: { searchParams: { t?: string } }) {
  return armWatchPage('A', searchParams?.t)
}
