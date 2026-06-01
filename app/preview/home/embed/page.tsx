'use client'

/**
 * STANDALONE MARKETING HOMEPAGE MOCKUP — Align and Acquire
 * Route: /preview/home/embed  (the /embed segment makes ConditionalNavBar render null,
 * so this page renders with NO global nav and is fully self-contained.)
 *
 * NOT wired into the live site. Purely additive. No backend / dashboard / config touched.
 *
 * Aesthetic direction: "Industrial Dispatch / Work Order" — equipment-panel asphalt black,
 * safety-orange accents, concrete off-white work-order panels, monospace dispatch labels,
 * hazard-stripe + blueprint-grid texture. Built to read as a tool for a tradesperson, not SaaS.
 *
 * Palette (the only six colors used):
 *   work blue #1A4A70 · asphalt black #16181C · safety orange #EE6B1A
 *   steel gray #6E7681 · concrete off-white #F2F0EB · white #FFFFFF
 */

import { useEffect, useRef, useState } from 'react'
import {
  PhoneMissed,
  MessageSquareText,
  CalendarCheck,
  ShieldBan,
  Globe,
  Send,
  BarChart3,
  Wind,
  Leaf,
  Car,
  Droplets,
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock,
  ShieldCheck,
  Zap,
  Bell,
  CircleCheckBig,
} from 'lucide-react'

// ============================================================
// Brand tokens (kept here so the mockup is self-documenting)
// ============================================================
const C = {
  blue: '#1A4A70',
  black: '#16181C',
  orange: '#EE6B1A',
  steel: '#6E7681',
  paper: '#F2F0EB',
  white: '#FFFFFF',
}

// ============================================================
// Scroll-reveal hook (respects prefers-reduced-motion)
// ============================================================
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.18 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, shown }
}

// ============================================================
// Primary logo lockup — geometric recreation of the A + up-arrow
// mark with the "Align and Acquire" wordmark (work-blue, on-palette)
// ============================================================
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* A — left leg as an upward arrow shaft + arrowhead, right leg as a bar */}
      <path d="M19.5 8 L11 8 L11 40 L18 40 L18 22 L19.5 22 Z" fill={C.blue} />
      <path d="M11 8 L15.25 1.5 L19.5 8 Z" fill={C.blue} />
      <path d="M24.5 4 L40 44 L31.5 44 L20 14 Z" fill={C.blue} opacity="0.85" />
      <rect x="16" y="26" width="14" height="6" fill={C.blue} opacity="0.85" />
    </svg>
  )
}

function PrimaryLogo({ light = true }: { light?: boolean }) {
  const wordColor = light ? C.white : C.black
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={34} />
      <div className="leading-none">
        <div
          className="text-[15px] font-extrabold tracking-tight sm:text-[17px]"
          style={{ color: wordColor }}
        >
          Align and Acquire
        </div>
        <div
          className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.18em] sm:block"
          style={{ color: C.steel }}
        >
          Missed-call lead capture for working pros
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Small reusable pieces
// ============================================================
function Eyebrow({ children, tone = 'orange' }: { children: React.ReactNode; tone?: 'orange' | 'steel' }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em]">
      <span
        className="inline-block h-2.5 w-2.5"
        style={{ background: tone === 'orange' ? C.orange : C.steel }}
      />
      <span style={{ color: tone === 'orange' ? C.orange : C.steel }}>{children}</span>
    </div>
  )
}

function TradeChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div
      className="group inline-flex items-center gap-2 border px-3.5 py-2 transition-colors duration-200"
      style={{ borderColor: 'rgba(110,118,129,0.45)', background: 'rgba(255,255,255,0.03)' }}
    >
      <Icon size={16} strokeWidth={2.25} style={{ color: C.orange }} />
      <span className="text-[13px] font-semibold tracking-wide" style={{ color: C.paper }}>
        {label}
      </span>
    </div>
  )
}

// ============================================================
// The SMS money-shot — animated dispatch thread
// ============================================================
type Bubble =
  | { kind: 'system'; text: string }
  | { kind: 'out'; text: string }
  | { kind: 'in'; text: string }
  | { kind: 'status'; chips: string[] }

const THREAD: Bubble[] = [
  { kind: 'system', text: 'Missed call · (480) 555-0192 · 2:14 PM' },
  { kind: 'out', text: "Hey, this is Rivera Plumbing — sorry we missed your call! What do you need a hand with?" },
  { kind: 'in', text: "Water heater's leaking all over my garage. Need someone out today." },
  { kind: 'out', text: 'On it. Can I grab your name and the service address?' },
  { kind: 'in', text: 'Marcus Bell — 4421 Cedar Ridge Dr.' },
  { kind: 'out', text: 'Thanks Marcus. We can be out today at 3:30 PM or tomorrow at 9:00 AM. Which works better?' },
  { kind: 'in', text: 'Today at 3:30 works.' },
  { kind: 'out', text: "You're booked for today at 3:30 PM. We'll text when the tech is 20 minutes out." },
  { kind: 'status', chips: ['Lead captured', 'Owner notified', 'Job booked'] },
]

function SmsThread() {
  const [count, setCount] = useState(0)
  const startedRef = useRef(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            if (reduce) {
              setCount(THREAD.length)
              return
            }
            let i = 0
            const tick = () => {
              i += 1
              setCount(i)
              if (i < THREAD.length) {
                const next = THREAD[i]
                const delay = next?.kind === 'in' ? 900 : next?.kind === 'status' ? 700 : 1150
                window.setTimeout(tick, delay)
              }
            }
            window.setTimeout(tick, 500)
          }
        })
      },
      { threshold: 0.3 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="aa-phone relative mx-auto w-full max-w-[380px]">
      {/* device shell */}
      <div
        className="relative overflow-hidden border-2"
        style={{ borderColor: C.black, background: C.black, boxShadow: '0 0 0 1px rgba(110,118,129,0.4)' }}
      >
        {/* dispatch header */}
        <div
          className="flex items-center justify-between border-b-2 px-4 py-3"
          style={{ borderColor: 'rgba(110,118,129,0.35)', background: C.blue }}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center" style={{ background: C.orange }}>
              <MessageSquareText size={15} strokeWidth={2.5} style={{ color: C.black }} />
            </span>
            <div className="leading-tight">
              <div className="text-[12px] font-bold tracking-wide" style={{ color: C.white }}>
                Rivera Plumbing
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: 'rgba(242,240,235,0.7)' }}>
                Auto text-back · live
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: C.white }}>
            <span className="aa-pulse inline-block h-2 w-2 rounded-full" style={{ background: C.orange }} />
            on
          </span>
        </div>

        {/* thread body */}
        <div className="flex min-h-[460px] flex-col gap-2.5 px-4 py-4" style={{ background: C.black }}>
          {THREAD.slice(0, count).map((b, i) => (
            <Message key={i} bubble={b} />
          ))}
          {count < THREAD.length && count > 0 && THREAD[count]?.kind === 'in' && <Typing side="in" />}
          {count < THREAD.length && count > 0 && THREAD[count]?.kind === 'out' && <Typing side="out" />}
        </div>
      </div>

      {/* floating "missed call -> booked" caption tab */}
      <div
        className="absolute -right-3 -top-3 z-10 hidden items-center gap-2 border-2 px-3 py-2 sm:flex"
        style={{ borderColor: C.black, background: C.orange }}
      >
        <PhoneMissed size={14} strokeWidth={2.5} style={{ color: C.black }} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: C.black }}>
          Lead saved
        </span>
      </div>
    </div>
  )
}

function Message({ bubble }: { bubble: Bubble }) {
  if (bubble.kind === 'system') {
    return (
      <div className="aa-rise my-1 text-center">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em]" style={{ color: C.steel }}>
          {bubble.text}
        </span>
      </div>
    )
  }
  if (bubble.kind === 'status') {
    return (
      <div className="aa-rise mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t-2 pt-3" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
        {bubble.chips.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(238,107,26,0.14)', color: C.orange }}
          >
            <Check size={11} strokeWidth={3} />
            {c}
          </span>
        ))}
      </div>
    )
  }
  const out = bubble.kind === 'out'
  return (
    <div className={`aa-rise flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] px-3.5 py-2.5 text-[13px] leading-snug"
        style={
          out
            ? { background: C.orange, color: C.black, borderRadius: '14px 14px 4px 14px', fontWeight: 500 }
            : { background: 'rgba(242,240,235,0.96)', color: C.black, borderRadius: '14px 14px 14px 4px' }
        }
      >
        {bubble.text}
      </div>
    </div>
  )
}

function Typing({ side }: { side: 'in' | 'out' }) {
  return (
    <div className={`flex ${side === 'out' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="flex items-center gap-1 px-3.5 py-3"
        style={{ background: side === 'out' ? 'rgba(238,107,26,0.85)' : 'rgba(242,240,235,0.9)', borderRadius: 12 }}
      >
        <span className="aa-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.black }} />
        <span className="aa-dot aa-dot2 inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.black }} />
        <span className="aa-dot aa-dot3 inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.black }} />
      </div>
    </div>
  )
}

// ============================================================
// Section wrapper with reveal
// ============================================================
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, shown } = useReveal()
  return (
    <div ref={ref} className={`aa-reveal ${shown ? 'aa-in' : ''} ${className}`}>
      {children}
    </div>
  )
}

// ============================================================
// Data
// ============================================================
const STATS = [
  { value: '<60s', label: 'Avg text-back', sub: 'Caller hears back before the next ring' },
  { value: '24/7', label: 'Always covering', sub: 'Nights, weekends, on the job' },
  { value: '0', label: 'Leads dropped', sub: 'Every missed call gets worked' },
  { value: '5 min', label: 'To go live', sub: 'Keep your number, no new hardware' },
]

const STEPS = [
  {
    n: '01',
    icon: PhoneMissed,
    title: 'You miss the call',
    body: "You're on a roof, under a truck, or elbow-deep in a job. The phone rings out — like it does a dozen times a week.",
  },
  {
    n: '02',
    icon: MessageSquareText,
    title: 'The AI texts back instantly',
    body: 'In your business voice, it answers in seconds, asks what they need, and grabs their name and address — qualifying the lead while it’s hot.',
  },
  {
    n: '03',
    icon: CalendarCheck,
    title: 'The job gets booked',
    body: 'It offers two open time slots, confirms the appointment, and pings you the second a lead is captured. You just show up.',
  },
]

const FEATURES = [
  { icon: MessageSquareText, title: 'AI missed-call text-back', body: 'Every missed caller gets an instant, on-brand text that qualifies and books — automatically.', tag: 'Core' },
  { icon: ShieldBan, title: 'Spam call screening', body: 'Robocalls and junk get filtered before they ever buzz your pocket.', tag: '+$75/mo add-on' },
  { icon: CalendarCheck, title: 'Online booking + calendar sync', body: 'Jobs land straight on your calendar. No double-bookings, no back-and-forth.', tag: 'Included' },
  { icon: Globe, title: 'Website lead capture', body: 'Forms on your site flow into the same pipeline as your calls and texts.', tag: 'Included' },
  { icon: Send, title: 'Email + SMS outreach', body: 'Win back old customers and fill slow weeks with a couple of taps.', tag: 'Included' },
  { icon: BarChart3, title: 'Google Ads dashboard', body: 'See exactly what your ad spend is turning into — calls, leads, booked jobs.', tag: 'Included' },
]

const BRAND_FEEL = ['Trustworthy', 'Sharp', 'Modern', 'Built for Working Pros', 'Never Miss a Lead']

const PLANS = [
  {
    name: 'Growth',
    price: '200',
    setup: '400',
    popular: false,
    blurb: 'Stop missing leads.',
    features: ['AI missed-call text-back', 'Online booking + calendar sync', 'Website lead capture', 'Keep your number'],
  },
  {
    name: 'Pro',
    price: '290',
    setup: '400',
    popular: true,
    blurb: 'Capture, book, and follow up.',
    features: ['Everything in Growth', 'Email + SMS outreach', 'Google Ads dashboard', 'Priority setup & support'],
  },
  {
    name: 'All In',
    price: '385',
    setup: '500',
    popular: false,
    blurb: 'The whole crew, fully covered.',
    features: ['Everything in Pro', 'Advanced lead routing', 'Multi-location ready', 'Dedicated success manager'],
  },
]

// ============================================================
// PAGE
// ============================================================
export default function HomePreview() {
  return (
    <div className="aa-root min-h-dvh w-full overflow-x-hidden" style={{ background: C.black, color: C.paper }}>
      <ScopedStyles />

      {/* ===================== NAV ===================== */}
      <header className="sticky top-0 z-50 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(22,24,28,0.88)', backdropFilter: 'blur(8px)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <PrimaryLogo />
          <nav className="hidden items-center gap-7 md:flex">
            {['How it works', 'Features', 'Pricing'].map((l) => (
              <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, '-')}`} className="aa-link text-[13px] font-semibold" style={{ color: C.paper }}>
                {l}
              </a>
            ))}
          </nav>
          <a
            href="#pricing"
            className="aa-btn inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold tracking-wide"
            style={{ background: C.orange, color: C.black }}
          >
            Start capturing leads
            <ArrowRight size={15} strokeWidth={2.5} />
          </a>
        </div>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="aa-grid relative">
        <div className="aa-hazard-top" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-24 lg:pt-20">
          {/* left: copy */}
          <div className="relative">
            <Eyebrow>Missed-call lead capture</Eyebrow>
            <h1 className="mt-5 text-[clamp(2.6rem,8vw,5.2rem)] font-black uppercase leading-[0.92] tracking-[-0.02em]">
              Every missed
              <br />
              call is{' '}
              <span className="relative inline-block">
                <span style={{ color: C.orange }}>lost work.</span>
                <span className="aa-underline" />
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed sm:text-[18px]" style={{ color: 'rgba(242,240,235,0.78)' }}>
              When you can’t pick up, our system texts every missed caller back in seconds,
              qualifies the lead, and books the job — so you never miss work.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#pricing"
                className="aa-btn inline-flex items-center justify-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ background: C.orange, color: C.black }}
              >
                Start capturing leads
                <ArrowUpRight size={18} strokeWidth={2.5} />
              </a>
              <a
                href="#how-it-works"
                className="aa-btn-ghost inline-flex items-center justify-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ borderColor: C.steel, color: C.paper }}
              >
                See how it works
              </a>
            </div>

            <div className="mt-9">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: C.steel }}>
                Built for the trades
              </div>
              <div className="flex flex-wrap gap-2.5">
                <TradeChip icon={Wind} label="HVAC" />
                <TradeChip icon={Leaf} label="Landscaping" />
                <TradeChip icon={Car} label="Car Detailing" />
                <TradeChip icon={Droplets} label="Plumbing" />
              </div>
            </div>
          </div>

          {/* right: the money shot */}
          <div className="relative">
            <div className="aa-blueprint pointer-events-none absolute -inset-6 -z-10" />
            <SmsThread />
          </div>
        </div>
        <div className="aa-hazard-bottom" />
      </section>

      {/* ===================== STATS ===================== */}
      <section className="border-y-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: C.blue }}>
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x-2 divide-y-2 sm:grid-cols-4 sm:divide-y-0" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
          {STATS.map((s, i) => (
            <Reveal key={i}>
              <div
                className="px-5 py-8 sm:px-7 sm:py-10"
                style={{ borderColor: 'rgba(255,255,255,0.14)' }}
              >
                <div className="text-[clamp(2.2rem,5vw,3.4rem)] font-black tabular-nums leading-none" style={{ color: C.white }}>
                  {s.value}
                </div>
                <div className="mt-3 text-[13px] font-bold uppercase tracking-wide" style={{ color: C.orange }}>
                  {s.label}
                </div>
                <div className="mt-1.5 text-[12.5px] leading-snug" style={{ color: 'rgba(242,240,235,0.72)' }}>
                  {s.sub}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how-it-works" className="relative" style={{ background: C.paper, color: C.black }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <Reveal>
            <Eyebrow tone="orange">How it works</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
              Three steps. <span style={{ color: C.blue }}>Zero missed jobs.</span>
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-px sm:grid-cols-3" style={{ background: 'rgba(110,118,129,0.4)' }}>
            {STEPS.map((s, i) => (
              <Reveal key={i}>
                <div className="group relative h-full p-7 sm:p-8" style={{ background: C.paper }}>
                  <div className="flex items-start justify-between">
                    <span className="grid h-12 w-12 place-items-center" style={{ background: C.black }}>
                      <s.icon size={22} strokeWidth={2.25} style={{ color: C.orange }} />
                    </span>
                    <span className="font-mono text-[40px] font-black leading-none tabular-nums" style={{ color: 'rgba(110,118,129,0.35)' }}>
                      {s.n}
                    </span>
                  </div>
                  <h3 className="mt-6 text-[20px] font-extrabold tracking-tight">{s.title}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.72)' }}>
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section id="features" className="relative aa-grid">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <Eyebrow>The toolkit</Eyebrow>
                <h2 className="mt-4 max-w-2xl text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                  Everything that
                  <br className="hidden sm:block" /> turns calls into <span style={{ color: C.orange }}>jobs.</span>
                </h2>
              </div>
              <p className="max-w-sm text-[14px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.7)' }}>
                One system running quietly in the background — capturing, qualifying, and booking
                while you keep your hands on the work.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'rgba(110,118,129,0.28)' }}>
            {FEATURES.map((f, i) => (
              <Reveal key={i}>
                <div className="aa-feature group relative h-full p-7" style={{ background: C.black }}>
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center border-2 transition-colors duration-200" style={{ borderColor: 'rgba(110,118,129,0.5)' }}>
                      <f.icon size={21} strokeWidth={2.25} style={{ color: C.orange }} />
                    </span>
                    <span
                      className="font-mono text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: f.tag === 'Core' ? C.orange : f.tag.includes('add-on') ? C.white : C.steel }}
                    >
                      {f.tag}
                    </span>
                  </div>
                  <h3 className="mt-6 text-[18px] font-extrabold tracking-tight" style={{ color: C.white }}>
                    {f.title}
                  </h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.68)' }}>
                    {f.body}
                  </p>
                  <span className="aa-feature-bar" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== BRAND-FEEL TICKER ===================== */}
      <section className="relative overflow-hidden border-y-2 py-5" style={{ borderColor: C.black, background: C.orange }}>
        <div className="aa-marquee flex w-max items-center gap-10 whitespace-nowrap">
          {[...Array(3)].map((_, rep) => (
            <div key={rep} className="flex items-center gap-10">
              {BRAND_FEEL.map((b, i) => (
                <div key={i} className="flex items-center gap-10">
                  <span className="text-[20px] font-black uppercase tracking-tight sm:text-[26px]" style={{ color: C.black }}>
                    {b}
                  </span>
                  <Zap size={18} strokeWidth={2.5} style={{ color: C.black }} className="shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ===================== PRICING ===================== */}
      <section id="pricing" className="relative" style={{ background: C.paper, color: C.black }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <Reveal>
            <div className="text-center">
              <Eyebrow tone="orange">Pricing</Eyebrow>
              <h2 className="mx-auto mt-4 max-w-2xl text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Pick a plan. <span style={{ color: C.blue }}>Keep your number.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px]" style={{ color: 'rgba(22,24,28,0.72)' }}>
                No contracts. Cancel anytime. Setup is one-time — then you’re live.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p, i) => (
              <Reveal key={i}>
                <div
                  className="relative flex h-full flex-col border-2 p-7 sm:p-8"
                  style={
                    p.popular
                      ? { borderColor: C.orange, background: C.black, color: C.paper }
                      : { borderColor: C.black, background: C.white, color: C.black }
                  }
                >
                  {p.popular && (
                    <span
                      className="absolute -top-3 left-7 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
                      style={{ background: C.orange, color: C.black }}
                    >
                      Most popular
                    </span>
                  )}
                  <div className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: p.popular ? C.orange : C.steel }}>
                    {p.name}
                  </div>
                  <div className="mt-1 text-[14px]" style={{ color: p.popular ? 'rgba(242,240,235,0.75)' : 'rgba(22,24,28,0.72)' }}>
                    {p.blurb}
                  </div>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-[28px] font-black leading-none">$</span>
                    <span className="text-[56px] font-black leading-none tabular-nums tracking-tight">{p.price}</span>
                    <span className="mb-2 text-[14px] font-semibold" style={{ color: p.popular ? C.steel : C.steel }}>
                      /mo
                    </span>
                  </div>
                  <div className="mt-1.5 font-mono text-[12px] uppercase tracking-wider" style={{ color: p.popular ? 'rgba(242,240,235,0.6)' : C.steel }}>
                    + ${p.setup} one-time setup
                  </div>

                  <ul className="mt-7 flex flex-1 flex-col gap-3">
                    {p.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-[14px]">
                        <Check size={17} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: C.orange }} />
                        <span style={{ color: p.popular ? 'rgba(242,240,235,0.9)' : 'rgba(22,24,28,0.85)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href="#get-started"
                    className="aa-btn mt-8 inline-flex items-center justify-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide"
                    style={
                      p.popular
                        ? { background: C.orange, color: C.black }
                        : { background: C.black, color: C.paper }
                    }
                  >
                    Get started
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </a>
                </div>
              </Reveal>
            ))}
          </div>

          {/* add-on bar */}
          <Reveal>
            <div
              className="mt-6 flex flex-col items-start justify-between gap-4 border-2 p-6 sm:flex-row sm:items-center"
              style={{ borderColor: C.black, background: C.white }}
            >
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center" style={{ background: C.black }}>
                  <ShieldBan size={22} strokeWidth={2.25} style={{ color: C.orange }} />
                </span>
                <div>
                  <div className="text-[16px] font-extrabold tracking-tight">Spam call screening add-on</div>
                  <div className="mt-1 text-[14px]" style={{ color: 'rgba(22,24,28,0.72)' }}>
                    Filter robocalls and junk on any plan. <span className="font-semibold">$75/mo · $150 one-time setup.</span>
                  </div>
                </div>
              </div>
              <span className="font-mono text-[12px] font-bold uppercase tracking-widest" style={{ color: C.blue }}>
                Add to any plan
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section id="get-started" className="relative aa-grid">
        <div className="aa-hazard-top" />
        <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 lg:py-28">
          <Reveal>
            <div className="mx-auto mb-7 inline-flex items-center gap-2.5 border-2 px-4 py-2" style={{ borderColor: 'rgba(110,118,129,0.5)' }}>
              <Bell size={15} strokeWidth={2.5} style={{ color: C.orange }} />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: C.paper }}>
                Never miss a lead again
              </span>
            </div>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.6rem)] font-black uppercase leading-[0.92] tracking-tight">
              The next missed call
              <br />
              <span style={{ color: C.orange }}>doesn’t have to be lost.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed sm:text-[18px]" style={{ color: 'rgba(242,240,235,0.78)' }}>
              Get set up in five minutes, keep your number, and let the system work the phones
              while you work the job.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#pricing"
                className="aa-btn inline-flex items-center justify-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ background: C.orange, color: C.black }}
              >
                Start capturing leads
                <ArrowUpRight size={18} strokeWidth={2.5} />
              </a>
              <a
                href="#how-it-works"
                className="aa-btn-ghost inline-flex items-center justify-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide"
                style={{ borderColor: C.steel, color: C.paper }}
              >
                See how it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: C.steel }}>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: C.orange }} /> No contracts</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: C.orange }} /> Keep your number</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheckBig size={13} strokeWidth={2.5} style={{ color: C.orange }} /> Live in 5 minutes</span>
            </div>
          </Reveal>
        </div>
        <div className="aa-hazard-bottom" />
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="border-t-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: C.black }}>
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <div className="max-w-sm">
              <PrimaryLogo />
              <p className="mt-5 text-[14px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.62)' }}>
                Missed-call lead capture for working pros. Built for HVAC techs, landscapers,
                plumbers, and detailers who can’t always get to the phone.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { icon: Wind, label: 'HVAC' },
                  { icon: Leaf, label: 'Landscaping' },
                  { icon: Car, label: 'Detailing' },
                  { icon: Droplets, label: 'Plumbing' },
                ].map((t) => (
                  <span key={t.label} className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'rgba(110,118,129,0.4)', color: C.steel }}>
                    <t.icon size={13} strokeWidth={2.25} style={{ color: C.steel }} />
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              {[
                { h: 'Product', items: ['Missed-call text-back', 'Spam screening', 'Online booking', 'Outreach'] },
                { h: 'Company', items: ['How it works', 'Pricing', 'Trades we serve', 'Contact'] },
                { h: 'Legal', items: ['Privacy', 'Terms', 'SMS policy'] },
              ].map((col) => (
                <div key={col.h}>
                  <div className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: C.orange }}>
                    {col.h}
                  </div>
                  <ul className="space-y-2.5">
                    {col.items.map((it) => (
                      <li key={it}>
                        <a href="#" className="aa-link text-[13.5px]" style={{ color: 'rgba(242,240,235,0.7)' }}>
                          {it}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t-2 pt-6 sm:flex-row sm:items-center" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: C.steel }}>
              © {new Date().getFullYear()} Align and Acquire · Never miss a lead
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(110,118,129,0.7)' }}>
              Preview mockup · not the live site
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ============================================================
// Scoped styles (textures, motion, button feedback)
// All scoped under .aa-root so nothing leaks to the live app.
// ============================================================
function ScopedStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.aa-root { -webkit-font-smoothing: antialiased; }

/* Buttons: flat, hard, immediate press feedback (no layout shift) */
.aa-root .aa-btn { transition: transform .12s ease, filter .18s ease; will-change: transform; }
.aa-root .aa-btn:hover { filter: brightness(1.06); }
.aa-root .aa-btn:active { transform: scale(.97); }
.aa-root .aa-btn-ghost { transition: transform .12s ease, background-color .18s ease, border-color .18s ease; }
.aa-root .aa-btn-ghost:hover { background: rgba(242,240,235,0.06); border-color: ${C.orange}; }
.aa-root .aa-btn-ghost:active { transform: scale(.97); }

/* Nav links */
.aa-root .aa-link { position: relative; transition: color .18s ease; }
.aa-root .aa-link:hover { color: ${C.orange}; }

/* Hero headline underline (hand-drawn safety stripe) */
.aa-root .aa-underline {
  position:absolute; left:0; right:0; bottom:-2px; height:8px;
  background: ${C.orange}; opacity:.28;
}

/* Blueprint grid texture behind the phone */
.aa-root .aa-blueprint {
  background-image:
    linear-gradient(rgba(110,118,129,0.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110,118,129,0.18) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image: radial-gradient(circle at 50% 45%, #000 35%, transparent 78%);
  -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 35%, transparent 78%);
}

/* Faint blueprint grid on dark sections */
.aa-root .aa-grid { position: relative; }
.aa-root .aa-grid::before {
  content:""; position:absolute; inset:0; pointer-events:none; z-index:0;
  background-image:
    linear-gradient(rgba(110,118,129,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110,118,129,0.06) 1px, transparent 1px);
  background-size: 48px 48px;
}
.aa-root .aa-grid > * { position: relative; z-index: 1; }

/* Hazard stripe accent bars */
.aa-root .aa-hazard-top, .aa-root .aa-hazard-bottom {
  height: 6px; width: 100%;
  background-image: repeating-linear-gradient(45deg, ${C.orange} 0, ${C.orange} 14px, ${C.black} 14px, ${C.black} 28px);
}
.aa-root .aa-hazard-bottom { opacity: .5; }

/* Feature hover bar */
.aa-root .aa-feature { transition: background-color .2s ease; }
.aa-root .aa-feature:hover { background: rgba(26,74,112,0.22) !important; }
.aa-root .aa-feature .aa-feature-bar {
  position:absolute; left:0; bottom:0; height:3px; width:0; background:${C.orange};
  transition: width .28s ease;
}
.aa-root .aa-feature:hover .aa-feature-bar { width:100%; }

/* Reveal on scroll */
.aa-root .aa-reveal { opacity:0; transform: translateY(18px); transition: opacity .55s ease, transform .55s cubic-bezier(.2,.7,.3,1); }
.aa-root .aa-reveal.aa-in { opacity:1; transform:none; }

/* SMS bubble entrance */
.aa-root .aa-rise { animation: aaRise .34s cubic-bezier(.2,.7,.3,1) both; }
@keyframes aaRise { from { opacity:0; transform: translateY(10px) scale(.98); } to { opacity:1; transform:none; } }

/* typing dots */
.aa-root .aa-dot { animation: aaBlink 1s infinite ease-in-out; opacity:.4; }
.aa-root .aa-dot2 { animation-delay:.16s; }
.aa-root .aa-dot3 { animation-delay:.32s; }
@keyframes aaBlink { 0%,100%{opacity:.3; transform:translateY(0);} 50%{opacity:1; transform:translateY(-2px);} }

/* live pulse */
.aa-root .aa-pulse { animation: aaPulse 1.4s infinite ease-in-out; }
@keyframes aaPulse { 0%,100%{opacity:1; transform:scale(1);} 50%{opacity:.4; transform:scale(.82);} }

/* Marquee */
.aa-root .aa-marquee { animation: aaMarquee 26s linear infinite; }
@keyframes aaMarquee { from { transform: translateX(0);} to { transform: translateX(-33.333%);} }

/* phone subtle float */
.aa-root .aa-phone { animation: aaFloat 6s ease-in-out infinite; }
@keyframes aaFloat { 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-8px);} }

@media (prefers-reduced-motion: reduce) {
  .aa-root .aa-reveal, .aa-root .aa-rise, .aa-root .aa-phone,
  .aa-root .aa-marquee, .aa-root .aa-dot, .aa-root .aa-pulse {
    animation: none !important; transition: none !important; transform: none !important; opacity: 1 !important;
  }
}
`,
      }}
    />
  )
}
