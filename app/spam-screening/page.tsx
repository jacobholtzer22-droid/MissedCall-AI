import Link from 'next/link'
import { Phone, PhoneOff, CheckCircle, ArrowRight, Shield, MessageSquare, Hash } from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'
import BrandFooter from '@/app/components/BrandFooter'

const steps = [
  { n: '01', icon: Phone, title: 'Customer calls your number', description: 'Phone rings as normal. No change for your real customers.' },
  { n: '02', icon: Hash, title: 'They hear: Press 1 to connect', description: "A simple automated prompt plays. One tap and they're in." },
  { n: '03', icon: CheckCircle, title: 'Real customers press 1 and get through', description: 'Connected to you in seconds. Zero friction for real callers.' },
  { n: '04', icon: PhoneOff, title: 'Spam callers and robots hang up', description: "They can't press buttons. They never reach you. Problem solved." },
]

const benefits = [
  'Zero spam calls reaching your phone',
  'No missed real customers. Legitimate callers press 1 without thinking twice.',
  'Works with your existing phone number. No need to change anything.',
  'Set up in under 24 hours',
  "Pairs perfectly with MissedCall AI. If a real customer doesn't get through, the AI texts them back.",
]

export default function SpamScreeningPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>Click 1 to Connect · Spam filter</span>
          </div>
          <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            Stop wasting time<br />
            on <span style={{ color: '#EE6B1A' }}>spam calls.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-3xl mx-auto mb-8" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Our Click 1 to Connect system makes every caller press 1 before they reach you. Robots can&apos;t do that. Only real customers get through.
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
          items={["Robocalls can't press 1", 'Real customers get through', 'Your number stays the same', 'Set up in 24 hours', 'No more warranty spam']}
          separator="⚡"
          speed="normal"
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
        />
      </div>

      {/* ── The Problem ──────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-20">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
              <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
              <span style={{ color: '#EE6B1A' }}>The problem</span>
            </div>
            <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-6">
              You know the drill.
            </h2>
            <div className="border-l-4 pl-6" style={{ borderColor: '#EE6B1A' }}>
              <p className="text-[16px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.75)' }}>
                Your phone rings. You stop what you&apos;re doing. You answer. It&apos;s a robocall about your car&apos;s extended warranty. That&apos;s 30 seconds of your life you&apos;ll never get back, and it happens 10+ times a day. Meanwhile a real customer calls and you miss them because you thought it was spam.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>How it works</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Four steps. <span style={{ color: '#EE6B1A' }}>One filter.</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'rgba(110,118,129,0.2)' }}>
            {steps.map((s) => (
              <ScrollReveal key={s.n}>
                <div className="h-full p-7" style={{ background: '#16181C' }}>
                  <div className="flex items-start justify-between mb-6">
                    <span className="grid h-12 w-12 place-items-center" style={{ background: '#1A4A70' }}>
                      <s.icon size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                    </span>
                    <span className="font-mono text-[36px] font-black tabular-nums leading-none" style={{ color: 'rgba(110,118,129,0.3)' }}>{s.n}</span>
                  </div>
                  <h3 className="text-[17px] font-extrabold tracking-tight mb-2" style={{ color: '#F2F0EB' }}>{s.title}</h3>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: '#6E7681' }}>{s.description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>What you get</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Less noise.<br /><span style={{ color: '#1A4A70' }}>More real work.</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="space-y-3">
              {benefits.map((b, i) => (
                <div key={i} className="scroll-reveal flex items-start gap-4 border-2 p-5" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
                  <CheckCircle size={22} strokeWidth={2.25} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                  <span className="text-[14.5px]" style={{ color: '#16181C' }}>{b}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pair with MissedCall AI ──────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="border-2 p-8 sm:p-10 text-center" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>The ultimate combo</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-5">
                Pair it with<br /><span style={{ color: '#EE6B1A' }}>MissedCall AI.</span>
              </h2>
              <p className="text-[15px] leading-relaxed max-w-2xl mx-auto mb-8" style={{ color: '#6E7681' }}>
                Spam gets blocked. Real customers get through. And if you miss one? The AI handles it. Texts back instantly, books the appointment, recovers the sale. 24/7.
              </p>
              <Link href="/missedcall-ai" className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                <MessageSquare size={18} strokeWidth={2.5} />
                See MissedCall AI <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-lg px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Pricing</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Simple pricing.
              </h2>
            </div>
            <div className="border-2 p-8" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
              <div className="flex items-center gap-3 mb-6">
                <span className="grid h-12 w-12 place-items-center" style={{ background: '#16181C' }}>
                  <Shield size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                </span>
                <div>
                  <div className="font-extrabold text-[18px] tracking-tight">Spam Call Screening</div>
                  <div className="text-[12px]" style={{ color: '#6E7681' }}>Installed on your existing number</div>
                </div>
              </div>
              <div className="text-[13px] mb-2" style={{ color: '#6E7681' }}>$150 one-time setup</div>
              <div className="flex items-end gap-1 mb-6">
                <span className="text-[22px] font-black">$</span>
                <span className="text-[52px] font-black tabular-nums leading-none">75</span>
                <span className="mb-2 text-[15px]" style={{ color: '#6E7681' }}>/mo</span>
              </div>
              <Link href="/book" className="aa-btn w-full inline-flex items-center justify-center gap-2 py-4 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                Book a free call <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
