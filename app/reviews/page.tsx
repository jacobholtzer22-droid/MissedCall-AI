import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Quote } from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import BrandFooter from '@/app/components/BrandFooter'
import GoogleReviews from '@/app/components/GoogleReviews'
import TestimonialPhoto from '@/app/components/TestimonialPhoto'

const DESCRIPTION =
  'Real reviews from the trade businesses we work with — lawn care, landscaping, detailing and more. Rated 5.0 on Google across every review left to date.'

export const metadata: Metadata = {
  title: 'Client Reviews & Testimonials',
  description: DESCRIPTION,
  alternates: { canonical: './' },
}

// NOTE: deliberately no Review / AggregateRating JSON-LD here.
// Self-serving review markup on your own site violates Google's
// structured data guidelines (see CLAUDE.md §16).

function Eyebrow({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
      <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
      <span style={{ color: '#EE6B1A' }}>{label}</span>
    </div>
  )
}

export default function ReviewsPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section style={{ background: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 pt-28 pb-16 sm:px-8 sm:pt-32 lg:pt-36 lg:pb-20">
          <ScrollReveal>
            <Eyebrow label="Reviews" />
            <h1 className="text-[clamp(2.25rem,6vw,4rem)] font-black uppercase leading-[0.95] tracking-tight">
              Results speak<br />
              <span style={{ color: '#EE6B1A' }}>louder than claims.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed sm:text-[19px]" style={{ color: 'rgba(242,240,235,0.72)' }}>
              We work with trade businesses — lawn care, landscaping, detailing, HVAC. Here is what they
              say about working with us, in their own words.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Featured testimonial ─────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <Eyebrow label="Featured client" />
              <h2 className="text-[clamp(1.75rem,4.5vw,2.75rem)] font-black uppercase leading-[0.95] tracking-tight">
                In their<br />
                <span style={{ color: '#1A4A70' }}>own words.</span>
              </h2>
            </div>
          </ScrollReveal>

          {/* Featured testimonial — Master Gardener LLC */}
          <ScrollReveal>
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-0 border-2" style={{ borderColor: '#16181C' }}>

              {/* Photo */}
              <TestimonialPhoto />

              {/* Quote */}
              <div className="p-8 sm:p-10 flex flex-col justify-between" style={{ background: '#16181C' }}>
                <div>
                  <Quote size={36} strokeWidth={1.25} className="mb-6" style={{ color: '#EE6B1A' }} />
                  <p className="text-[17px] sm:text-[20px] leading-relaxed mb-8" style={{ color: 'rgba(242,240,235,0.9)' }}>
                    "My days are a lot simpler. Before this, probably 60 or 70 percent of my calls were spam. Now those get blocked and when I do pick up I know it&apos;s a real customer. The ones I miss, the AI texts them back right away so I&apos;m not losing work while I&apos;m out on a job. The website they built is way better than what I had before too. More modern, and it actually comes up on Google now."
                  </p>
                </div>

                {/* Services used */}
                <div>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {['MissedCall AI', 'Spam Call Screening', 'Custom Website'].map(s => (
                      <span key={s} className="font-mono text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5" style={{ background: 'rgba(238,107,26,0.15)', color: '#EE6B1A' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="border-t-2 pt-6" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
                    <div className="font-bold text-[16px]" style={{ color: '#F2F0EB' }}>Master Gardener LLC</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest mt-1" style={{ color: '#6E7681' }}>Lawn Care &amp; Landscaping · West Michigan</div>
                  </div>
                </div>
              </div>

            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Google reviews ───────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24">
          <ScrollReveal>
            <div className="mb-10">
              <Eyebrow label="From Google" />
              <h2 className="text-[clamp(1.75rem,4.5vw,2.75rem)] font-black uppercase leading-[0.95] tracking-tight">
                What clients<br />
                <span style={{ color: '#1A4A70' }}>left on Google.</span>
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <GoogleReviews />
          </ScrollReveal>

          <ScrollReveal>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-center" style={{ color: '#6E7681' }}>
              More client stories coming soon
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
          <ScrollReveal>
            <div className="border-2 p-8 sm:p-12 text-center" style={{ borderColor: '#16181C' }}>
              <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-black uppercase leading-[1.05] tracking-tight">
                Want results like these?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.72)' }}>
                Book a free call and we will walk through exactly what your setup would look like.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/book"
                  className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  Book a Free Call <ArrowRight size={15} strokeWidth={2.5} />
                </Link>
                <Link
                  href="/services"
                  className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide"
                  style={{ borderColor: '#16181C', color: '#16181C' }}
                >
                  See services <ArrowRight size={15} strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
