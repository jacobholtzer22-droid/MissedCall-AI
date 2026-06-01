import Link from 'next/link'
import { MessageSquare, Globe, Megaphone, ArrowRight, ArrowUpRight, Check, Wind, Leaf, Car, Droplets } from 'lucide-react'
import ContactForm from './components/ContactForm'
import Marquee from './components/Marquee'
import ScrollReveal from './components/ScrollReveal'
import BrandFooter from './components/BrandFooter'
import SmsThread from './components/SmsThread'

const SERVICES = [
  {
    icon: MessageSquare,
    title: 'MissedCall AI',
    body: 'Stop losing money to voicemail. Our AI texts back instantly, qualifies the lead, books the appointment, and saves the sale — 24/7, even at 3am.',
    cta: 'See how it works',
    href: '/missedcall-ai',
    tag: 'Most popular',
  },
  {
    icon: Globe,
    title: 'Custom Websites',
    body: 'No templates. No WordPress. Real code that loads fast, looks incredible, and turns visitors into customers in days — not months.',
    cta: 'See the portfolio',
    href: '/websites',
    tag: null,
  },
  {
    icon: Megaphone,
    title: 'Mass Campaigns',
    body: 'Blast emails and texts to your entire client list in one click. Past customers, new leads, everyone — stay top of mind and bring old revenue back.',
    cta: 'Learn more',
    href: '/campaigns',
    tag: null,
  },
]

const BRAND_FEEL = ['Trustworthy', 'Sharp', 'Modern', 'Built for Working Pros', 'Never Miss a Lead']

const WHAT_YOU_GET = [
  "Direct access to the person who built it",
  "Custom solutions, not cookie-cutter templates",
  "Turnaround measured in days, not months",
  "Ongoing support that doesn't cost extra",
  "AI that works around the clock so you don't have to",
]

export default function HomePage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ════════════════════════════════════════
          HERO — SMS animation is the money shot
          ════════════════════════════════════════ */}
      <section className="relative aa-grid-bg pt-28 sm:pt-36">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 pb-20">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">

            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Missed-call lead capture for working pros</span>
              </div>

              <h1 className="text-[clamp(2.6rem,7vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
                Every missed call<br />
                is <span style={{ color: '#EE6B1A' }}>lost work.</span>
              </h1>

              <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-xl mb-8" style={{ color: 'rgba(242,240,235,0.72)' }}>
                When you can't answer, our AI texts every missed caller back in seconds, qualifies the lead, and books the job — so you never miss a paycheck.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
                <Link
                  href="/missedcall-ai"
                  className="aa-btn inline-flex items-center justify-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  Start capturing leads
                  <ArrowUpRight size={18} strokeWidth={2.5} />
                </Link>
                <Link
                  href="/book"
                  className="aa-btn-ghost inline-flex items-center justify-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide"
                  style={{ borderColor: '#6E7681', color: '#F2F0EB' }}
                >
                  Book a free call
                </Link>
              </div>

              {/* Trade chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: Wind,     label: 'HVAC' },
                  { icon: Leaf,     label: 'Landscaping' },
                  { icon: Car,      label: 'Car Detailing' },
                  { icon: Droplets, label: 'Plumbing' },
                ].map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold"
                    style={{ borderColor: 'rgba(110,118,129,0.4)', color: '#F2F0EB' }}
                  >
                    <t.icon size={13} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: animated SMS demo — the product's money shot */}
            <div className="relative flex justify-center lg:justify-end">
              {/* Subtle blueprint grid masked behind the phone */}
              <div
                className="pointer-events-none absolute -inset-8 -z-10"
                style={{
                  backgroundImage: 'linear-gradient(rgba(110,118,129,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(110,118,129,0.14) 1px, transparent 1px)',
                  backgroundSize: '26px 26px',
                  maskImage: 'radial-gradient(ellipse at 55% 50%, #000 40%, transparent 75%)',
                  WebkitMaskImage: 'radial-gradient(ellipse at 55% 50%, #000 40%, transparent 75%)',
                }}
              />
              <SmsThread />
            </div>

          </div>
        </div>
        <div className="aa-hazard opacity-50" />
      </section>

      {/* ════════════════════
          Brand-feel ticker
          ════════════════════ */}
      <section className="overflow-hidden border-y-2 py-4" style={{ borderColor: '#16181C', background: '#EE6B1A' }}>
        <Marquee
          items={BRAND_FEEL}
          separator="⚡"
          speed="normal"
          className="text-[18px] sm:text-[22px] font-black uppercase tracking-tight"
        />
      </section>

      {/* ════════════
          Stats band
          ════════════ */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x-2 divide-y-2 sm:grid-cols-4 sm:divide-y-0" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
          {[
            { value: '<60s',  label: 'Text-back time',  sub: 'Before they call the next guy' },
            { value: '24/7',  label: 'Always on',        sub: 'Nights, weekends, on the job' },
            { value: '0',     label: 'Leads dropped',    sub: 'Every missed call gets worked' },
            { value: '5 min', label: 'To go live',       sub: 'Keep your number, no new gear' },
          ].map((s, i) => (
            <ScrollReveal key={i}>
              <div className="px-5 py-8 sm:px-7 sm:py-10" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
                <div className="text-[clamp(2rem,5vw,3.2rem)] font-black tabular-nums leading-none" style={{ color: '#FFFFFF' }}>
                  {s.value}
                </div>
                <div className="mt-3 text-[13px] font-bold uppercase tracking-wide" style={{ color: '#EE6B1A' }}>{s.label}</div>
                <div className="mt-1 text-[12.5px] leading-snug" style={{ color: 'rgba(242,240,235,0.65)' }}>{s.sub}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ════════════════
          Services grid
          ════════════════ */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>What we do</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Three tools.<br />
                <span style={{ color: '#1A4A70' }}>One goal — more work</span><br />
                in your hands.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid gap-px sm:grid-cols-3" style={{ background: 'rgba(110,118,129,0.35)' }}>
            {SERVICES.map((s, i) => (
              <ScrollReveal key={i}>
                <Link
                  href={s.href}
                  className="aa-feature-card group block h-full p-7 sm:p-8"
                  style={{ background: '#F2F0EB' }}
                >
                  {s.tag && (
                    <span className="mb-4 inline-block font-mono text-[10px] font-bold uppercase tracking-widest px-2.5 py-1" style={{ background: '#EE6B1A', color: '#16181C' }}>
                      {s.tag}
                    </span>
                  )}
                  <div className="grid h-12 w-12 place-items-center mb-5" style={{ background: '#16181C' }}>
                    <s.icon size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  </div>
                  <h3 className="text-[20px] font-extrabold tracking-tight mb-3">{s.title}</h3>
                  <p className="text-[14.5px] leading-relaxed mb-5" style={{ color: 'rgba(22,24,28,0.7)' }}>{s.body}</p>
                  <div className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide" style={{ color: '#EE6B1A' }}>
                    {s.cta}
                    <ArrowRight size={15} strokeWidth={2.5} className="transition-transform group-hover:translate-x-1" />
                  </div>
                  <span className="aa-feature-bar" />
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════
          About
          ════════════ */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Built by a founder</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-6">
                Not an agency.<br />
                <span style={{ color: '#EE6B1A' }}>One person</span><br />
                who picks up.
              </h2>
              <p className="text-[15px] leading-relaxed mb-4" style={{ color: 'rgba(242,240,235,0.72)' }}>
                I&apos;m Jacob. I don&apos;t have a team of 50. I don&apos;t have a fancy office. What I do have is a system that works and a phone that I actually answer.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(242,240,235,0.72)' }}>
                Every line of code is mine. When you call, I pick up. When something breaks, I fix it — no account managers, no ticket systems.
              </p>
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center font-black text-[20px] shrink-0" style={{ background: '#1A4A70', color: '#FFFFFF' }}>J</div>
                <div>
                  <p className="font-bold text-[15px]">Jacob Holtzer</p>
                  <p className="text-[12.5px]" style={{ color: '#6E7681' }}>Founder &amp; the only person you&apos;ll ever talk to</p>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <div className="border-2 p-7 sm:p-8" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] mb-6" style={{ color: '#EE6B1A' }}>
                  What you get
                </div>
                <ul className="space-y-4">
                  {WHAT_YOU_GET.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-[14.5px]" style={{ color: 'rgba(242,240,235,0.85)' }}>
                      <Check size={17} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className="aa-btn mt-8 inline-flex items-center gap-2 px-5 py-3 text-[13px] font-bold uppercase tracking-wide"
                  style={{ background: '#EE6B1A', color: '#16181C' }}
                >
                  See pricing <ArrowRight size={15} strokeWidth={2.5} />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ════════════
          Contact
          ════════════ */}
      <section id="contact" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Send a message</span>
              </div>
              <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-black uppercase leading-[0.95] tracking-tight mb-3">
                Prefer to just send a message?
              </h2>
              <p className="text-[15px] mb-8" style={{ color: 'rgba(22,24,28,0.65)' }}>
                No pitch deck. No 47-step funnel. Just tell me what you need.
              </p>
              <ContactForm />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ════════════
          Final CTA
          ════════════ */}
      <section className="aa-grid-bg">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 lg:py-28 text-center">
          <ScrollReveal>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
              Stop losing leads.<br />
              <span style={{ color: '#EE6B1A' }}>Seriously.</span>
            </h2>
            <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-xl mx-auto mb-9" style={{ color: 'rgba(242,240,235,0.72)' }}>
              Whether you need an AI that never misses a call or a website that actually converts — let&apos;s make it happen.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/missedcall-ai"
                className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ background: '#EE6B1A', color: '#16181C' }}
              >
                <MessageSquare size={18} strokeWidth={2.5} />
                Show me the demo
              </Link>
              <Link
                href="/book"
                className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ borderColor: '#6E7681', color: '#F2F0EB' }}
              >
                Book a free call
              </Link>
            </div>
          </ScrollReveal>
        </div>
        <div className="aa-hazard opacity-50" />
      </section>

      <BrandFooter />
    </div>
  )
}
