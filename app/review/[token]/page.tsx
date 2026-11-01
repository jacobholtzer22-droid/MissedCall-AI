// /review/<token> (PREVIEW_FEEDBACK): the client reviews their preview.
// Public under the existing middleware. Flag off: 404. Any bad token: one plain message.

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { REVIEW_LIMITS, previewFeedbackEnabled, publicReview } from '@/lib/ops/preview-feedback'
import { resolvePreviewLink } from '@/lib/ops/preview-feedback-server'
import { ReviewForm } from './ReviewForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Your preview | Align and Acquire',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
}

export default async function ReviewPage({ params }: { params: { token: string } }) {
  if (!previewFeedbackEnabled()) notFound()
  const ip = getClientIp(new Request('http://local', { headers: headers() }))
  if (!rateLimit(`preview-feedback:page:${ip}`, REVIEW_LIMITS.read, 60_000).allowed) {
    return <Message title="One moment" body="Too many tries in a row. Wait a minute and reload this page." />
  }
  const client = await resolvePreviewLink(params.token)
  if (!client) return <Message title="This link isn't working" body="It may have expired or been replaced. Text Jacob and he'll send you a new one." />
  return <ReviewForm token={params.token} initial={publicReview(client)} />
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-16 text-gray-100">
      <div className="mx-auto max-w-xl space-y-3">
        <p className="text-sm text-gray-400">Jacob, Align and Acquire</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-gray-300">{body}</p>
      </div>
    </main>
  )
}
