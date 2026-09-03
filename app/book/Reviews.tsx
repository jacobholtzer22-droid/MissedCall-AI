// Three real Google reviews, text unchanged from app/components/GoogleReviews.tsx.
// No headings, no photos, no dates — quote, stars, first name.

const ACCENT = '#EE6B1A'

const REVIEWS: { text: string; firstName: string }[] = [
  {
    text:
      'Great experience working with Align and Acquire. Jacob is professional, responsive, and really understands how to help local businesses generate more leads. Highly recommend if you’re looking to grow your business and stop missing potential customers.',
    firstName: 'Cameron',
  },
  {
    text: 'Helped me stay focused on the job and not lose any leads. Works even better than expected. 100% recommend',
    firstName: 'Ryan',
  },
  {
    text:
      'Highly recommend Align & Acquire! They built an awesome website for my business and were great to work with. Very helpful, professional, and always quick to answer questions. I’m extremely happy with the final result!',
    firstName: 'Colin',
  },
]

function Stars() {
  return (
    <div className="flex gap-0.5" role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={ACCENT} aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export default function Reviews() {
  return (
    <section className="space-y-8">
      {REVIEWS.map((r) => (
        <div key={r.firstName}>
          <p className="text-[15px] leading-[1.6] text-neutral-800">&ldquo;{r.text}&rdquo;</p>
          <div className="mt-2">
            <Stars />
          </div>
          <p className="mt-1.5 text-[14px] font-semibold text-neutral-900">{r.firstName}</p>
        </div>
      ))}
    </section>
  )
}
