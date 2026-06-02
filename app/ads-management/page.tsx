import Link from 'next/link'
import { ArrowRight, Check, BarChart3, Search as SearchIcon, Rocket, RefreshCw, Shield } from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'
import BrandFooter from '@/app/components/BrandFooter'

const features = [
  'Google Ads account setup and configuration',
  'Keyword research: finding what your customers actually search for',
  'Campaign creation: ad copy, targeting, bid strategy',
  'Negative keyword management so you don\'t waste money on junk clicks',
  'Monthly optimization: pausing what doesn\'t work, scaling what does',
  'A/B testing: different ads, real data, find what converts',
  'Monthly performance reports so you always know where your money is going',
  'Ad extensions: sitelinks, callouts, call buttons to make your ads stand out',
]

const steps = [
  { title: 'We research your market', description: 'Keyword research, competitor analysis, audience targeting.', icon: SearchIcon },
  { title: 'We build and launch your campaigns', description: 'Live within 3–5 days of signing up.', icon: Rocket },
  { title: 'We optimize every month', description: 'Cutting waste, scaling winners, reporting results.', icon: RefreshCw },
]

export default function AdsManagementPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>Google Ads — we run it, you get the leads</span>
          </div>
          <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            Show up when<br />
            it <span style={{ color: '#EE6B1A' }}>matters most.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-3xl mx-auto mb-8" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Your customers are searching for exactly what you offer. Google Ads puts you at the top of the results. We set it up, run it, and make it better every month.
          </p>
          <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
            Book a free call <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <div className="border-y-2 py-4 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
        <Marquee
          items={['Keyword Research', 'Campaign Setup', 'Monthly Optimization', 'Performance Reports', 'Negative Keywords', 'A/B Testing']}
          separator="⚡"
          speed="normal"
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
        />
      </div>

      {/* ── The Problem ──────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-20">
          <ScrollReveal>
            <div className="border-l-4 pl-6" style={{ borderColor: '#EE6B1A' }}>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-4">
                Right now, your competitors are paying to show up above you on Google.
              </h2>
              <p className="text-[16px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.65)' }}>
                Every search you&apos;re not showing up for is a customer walking into someone else&apos;s door.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── What's Included ──────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>What&apos;s included</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Everything you need.<br /><span style={{ color: '#EE6B1A' }}>Nothing you don&apos;t.</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="space-y-3">
              {features.map((f, i) => (
                <div key={i} className="scroll-reveal flex items-start gap-4 border-2 p-5" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
                  <Check size={19} strokeWidth={2.5} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                  <span className="text-[14.5px]" style={{ color: '#F2F0EB' }}>{f}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>How it works</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Three steps.<br /><span style={{ color: '#1A4A70' }}>Sign-up to scaling.</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-px sm:grid-cols-3" style={{ background: 'rgba(110,118,129,0.35)' }}>
            {steps.map((s, i) => (
              <ScrollReveal key={s.title}>
                <div className="h-full p-7 sm:p-8" style={{ background: '#F2F0EB' }}>
                  <div className="flex items-start justify-between mb-6">
                    <span className="grid h-12 w-12 place-items-center" style={{ background: '#16181C' }}>
                      <s.icon size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                    </span>
                    <span className="font-mono text-[40px] font-black tabular-nums leading-none" style={{ color: 'rgba(110,118,129,0.3)' }}>0{i + 1}</span>
                  </div>
                  <h3 className="text-[19px] font-extrabold tracking-tight mb-2">{s.title}</h3>
                  <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.65)' }}>{s.description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Important note ───────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <ScrollReveal>
            <div className="flex flex-col sm:flex-row items-start gap-5 border-2 p-7" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(238,107,26,0.05)' }}>
              <div className="grid h-12 w-12 shrink-0 place-items-center" style={{ background: '#EE6B1A' }}>
                <Shield size={22} strokeWidth={2.25} style={{ color: '#16181C' }} />
              </div>
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#EE6B1A' }}>Important note</div>
                <p className="text-[14.5px] leading-relaxed" style={{ color: '#F2F0EB' }}>
                  Your ad budget goes directly to Google. It never touches our hands. Our fee covers the strategy, setup, and ongoing management. You control how much you spend on ads.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Pricing</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Simple. You own<br /><span style={{ color: '#1A4A70' }}>your ad spend.</span>
              </h2>
            </div>
            <div className="border-2 p-8" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: '#6E7681' }}>One-time setup</div>
                  <div className="text-[32px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>$250</div>
                </div>
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: '#6E7681' }}>Monthly management</div>
                  <div className="flex items-end gap-1">
                    <span className="text-[32px] font-black tabular-nums">$125</span>
                    <span className="mb-1 text-[14px]" style={{ color: '#6E7681' }}>/mo</span>
                  </div>
                </div>
              </div>
              <p className="text-[12.5px] border-t-2 pt-5 mb-7" style={{ borderColor: 'rgba(110,118,129,0.2)', color: '#6E7681' }}>
                Ad spend goes directly to Google. You choose the budget.
              </p>
              <Link href="/book" className="aa-btn w-full inline-flex items-center justify-center gap-2 py-4 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                Book a free call <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              Ready to show up<br />
              <span style={{ color: '#EE6B1A' }}>on Google?</span>
            </h2>
            <p className="text-[16px] mb-9 max-w-md mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Book a free call. We&apos;ll talk about your market and whether Google Ads is the right move. No pressure.
            </p>
            <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
              Book a free call <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
