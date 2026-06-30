'use client'

import Link from 'next/link'
import {
  Phone, MessageSquareText, CalendarCheck,
  Clock, Shield, DollarSign, ArrowRight, ArrowUpRight, Check,
  Bell, CircleCheckBig, Zap, ChevronDown,
} from 'lucide-react'
import DemoForm from '../components/DemoForm'
import ROICalculator from '../components/roi-calculator'
import ScrollReveal from '../components/ScrollReveal'
import CountUp from '../components/CountUp'
import Marquee from '../components/Marquee'
import BrandFooter from '../components/BrandFooter'
import SmsThread from '../components/SmsThread'

// ── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="aa-feature-card scroll-reveal border-2 p-6" style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.3)' }}>
      <div className="grid h-12 w-12 place-items-center mb-5" style={{ background: '#1A4A70' }}>
        <Icon size={21} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
      </div>
      <h3 className="text-[17px] font-extrabold tracking-tight mb-2" style={{ color: '#F2F0EB' }}>{title}</h3>
      <p className="text-[14px] leading-relaxed" style={{ color: '#6E7681' }}>{description}</p>
      <span className="aa-feature-bar" />
    </div>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group border-2" style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#FFFFFF' }}>
      <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
        <span className="font-semibold text-[15px]" style={{ color: '#16181C' }}>{question}</span>
        <ChevronDown className="h-5 w-5 shrink-0 group-open:rotate-180 transition-transform" style={{ color: '#6E7681' }} />
      </summary>
      <div className="px-5 pb-5 text-[14px] leading-relaxed" style={{ color: '#6E7681', borderTop: '1px solid rgba(110,118,129,0.2)' }}>
        <div className="pt-4">{answer}</div>
      </div>
    </details>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MissedCallAIPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative aa-grid-bg pt-28 pb-0 sm:pt-36">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 pb-16">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Missed-call lead capture · 24/7</span>
              </div>
              <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
                Every missed call<br />
                is <span style={{ color: '#EE6B1A' }}>money<br />walking away.</span>
              </h1>
              <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-xl mb-8" style={{ color: 'rgba(242,240,235,0.72)' }}>
                You&apos;re on the job. The phone rings out. Our AI texts back in seconds, qualifies the lead, and books the appointment while you keep your hands on the work.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#book-demo" className="aa-btn inline-flex items-center justify-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                  Request a demo <ArrowUpRight size={18} strokeWidth={2.5} />
                </a>
                <a href="#how-it-works" className="aa-btn-ghost inline-flex items-center justify-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: '#6E7681', color: '#F2F0EB' }}>
                  See how it works
                </a>
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
                Free demo · No credit card · No pitch deck
              </p>
            </div>
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-6 -z-10"
                style={{
                  backgroundImage: 'linear-gradient(rgba(110,118,129,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(110,118,129,0.14) 1px, transparent 1px)',
                  backgroundSize: '26px 26px',
                  maskImage: 'radial-gradient(circle at 50% 45%, #000 35%, transparent 78%)',
                  WebkitMaskImage: 'radial-gradient(circle at 50% 45%, #000 35%, transparent 78%)',
                }}
              />
              <SmsThread />
            </div>
          </div>
        </div>
        <div className="aa-hazard opacity-50" />
      </section>

      {/* ── Pain points ticker ───────────────────────────── */}
      <div className="border-y-2 py-4 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
        <Marquee
          items={["62% of callers won't leave a voicemail", "85% of missed calls never call back", "78% hire the first business that responds", "Your competitors answer on the first ring", "Every missed call is a missed paycheck"]}
          separator="✦"
          speed="normal"
          className="text-[13px] font-mono uppercase tracking-widest"
        />
      </div>

      {/* ── Stats ────────────────────────────────────────── */}
      <section className="border-b-2" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-12">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-center mb-8" style={{ color: '#6E7681' }}>
            The math doesn&apos;t lie
          </p>
          <div className="grid grid-cols-3 gap-6 text-center max-w-3xl mx-auto">
            {[
              { end: 62,   suffix: '%',  label: "of callers won't leave a voicemail" },
              { end: 85,   suffix: '%',  label: "of missed calls never call back" },
              { end: 78,   suffix: '%',  label: "hire the first business that responds" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ color: '#EE6B1A' }}>
                  <CountUp end={s.end} suffix={s.suffix} className="text-[clamp(1.8rem,5vw,3rem)] font-black tabular-nums" />
                </div>
                <p className="mt-2 text-[12.5px]" style={{ color: '#6E7681' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROI Calculator ──────────────────────────────── */}
      <section id="roi-calculator" className="aa-grid-bg">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>The math</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                See exactly what<br /><span style={{ color: '#EE6B1A' }}>you&apos;re losing.</span>
              </h2>
            </div>
            <ROICalculator />
          </ScrollReveal>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────── */}
      <section id="how-it-works" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>How it works</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Three steps. <span style={{ color: '#1A4A70' }}>Zero missed jobs.</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-px sm:grid-cols-3" style={{ background: 'rgba(110,118,129,0.4)' }}>
            {[
              { n: '01', icon: Phone, title: 'You miss a call', body: "You're on a ladder, in the chair, under the hood. Life happens. The phone rings out." },
              { n: '02', icon: MessageSquareText, title: 'AI texts instantly', body: 'In seconds, in your business voice: "Sorry we missed you! How can we help?" Feels human. Works like magic.' },
              { n: '03', icon: CalendarCheck, title: 'Job gets booked', body: 'Name, address, appointment. All done. Shows up on your calendar. You show up and get paid.' },
            ].map((s, i) => (
              <ScrollReveal key={i}>
                <div className="h-full p-7 sm:p-8" style={{ background: '#F2F0EB' }}>
                  <div className="flex items-start justify-between mb-6">
                    <span className="grid h-12 w-12 place-items-center" style={{ background: '#16181C' }}>
                      <s.icon size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                    </span>
                    <span className="font-mono text-[40px] font-black tabular-nums leading-none" style={{ color: 'rgba(110,118,129,0.3)' }}>{s.n}</span>
                  </div>
                  <h3 className="text-[20px] font-extrabold tracking-tight mb-3">{s.title}</h3>
                  <p className="text-[14.5px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.65)' }}>{s.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>The full toolkit</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Everything under<br /><span style={{ color: '#EE6B1A' }}>the hood.</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'rgba(110,118,129,0.2)' }}>
              <FeatureCard icon={Zap}            title="Instant response"    description="Texts go out within seconds. No delay, no lost leads. Faster than any human." />
              <FeatureCard icon={MessageSquareText} title="Natural conversations" description="Sounds human, not robotic. Customers have no idea they're talking to an AI." />
              <FeatureCard icon={CalendarCheck}  title="Auto booking"       description="Appointments created and added to your calendar. No back-and-forth." />
              <FeatureCard icon={Clock}          title="24/7 coverage"      description="Nights, weekends, holidays. Your AI never calls in sick." />
              <FeatureCard icon={Shield}         title="Smart escalation"   description="Complex situations get flagged for you. You stay in control of the hard calls." />
              <FeatureCard icon={DollarSign}     title="ROI dashboard"      description="See exactly how much revenue you've recovered. Real numbers, not guesses." />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section id="faq" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Questions</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                You&apos;ve got questions.
              </h2>
            </div>
          </ScrollReveal>
          <div className="space-y-3">
            <ScrollReveal><FAQItem question="How does it work with my existing phone number?" answer="You keep your number. Set up call forwarding so unanswered calls go to your MissedCall AI number. Your customers never see the difference. They just get a helpful text when you can't answer." /></ScrollReveal>
            <ScrollReveal><FAQItem question="What if the AI can't help a customer?" answer="It knows its limits. Complex or frustrated customers get flagged for human follow-up. You get notified, and they get a real person calling back." /></ScrollReveal>
            <ScrollReveal><FAQItem question="How much does it cost?" answer="Plans start at $300/month with a one-time setup fee. It typically pays for itself with one recovered appointment. Book a demo and we'll find the right plan for your business." /></ScrollReveal>
            <ScrollReveal><FAQItem question="Can I customize what the AI says?" answer="100%. Greeting, services, special instructions, business hours. You control all of it. The AI adapts to your specific business." /></ScrollReveal>
            <ScrollReveal><FAQItem question="How long does setup take?" answer="Most businesses are live in under 15 minutes. We walk you through everything." /></ScrollReveal>
            <ScrollReveal><FAQItem question="What if I want to cancel?" answer="No contracts. Cancel anytime. 30-day money-back guarantee. We're confident you won't want to, though." /></ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Book demo form ───────────────────────────────── */}
      <section id="book-demo" className="aa-grid-bg">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>See it in action</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-4">
                15 minutes.<br /><span style={{ color: '#EE6B1A' }}>No pressure.</span>
              </h2>
              <p className="text-[15px]" style={{ color: 'rgba(242,240,235,0.65)' }}>
                We&apos;ll show you exactly how many calls you&apos;re losing and how to get them back.
              </p>
            </div>
            <DemoForm />
          </ScrollReveal>
        </div>
        <div className="aa-hazard opacity-50" />
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 border-2 px-4 py-2 mb-7" style={{ borderColor: 'rgba(242,240,235,0.25)' }}>
              <Bell size={15} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#F2F0EB' }}>
                Never miss a lead again
              </span>
            </div>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              The next missed call<br />
              <span style={{ color: '#EE6B1A' }}>doesn&apos;t have to be lost.</span>
            </h2>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center mt-8">
              <a href="#book-demo" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Request demo <ArrowUpRight size={18} strokeWidth={2.5} />
              </a>
              <Link href="/pricing" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: 'rgba(242,240,235,0.3)', color: '#F2F0EB' }}>
                See pricing
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgba(242,240,235,0.6)' }}>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: '#EE6B1A' }} /> No contracts</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: '#EE6B1A' }} /> Keep your number</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: '#EE6B1A' }} /> Live in 5 minutes</span>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
