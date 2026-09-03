import type { Metadata } from 'next'
import { armWatchPage } from '../../armPages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Watch the Demo',
  robots: { index: false, follow: false },
}

export default async function WatchArmBPage({ searchParams }: { searchParams: { t?: string } }) {
  return armWatchPage('B', searchParams?.t)
}
