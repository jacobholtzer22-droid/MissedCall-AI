'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Check, X, ArrowRight, ShieldBan, PhoneMissed, Globe,
  BarChart3, Megaphone, CalendarCheck, LayoutDashboard,
  ChevronDown, ChevronUp, Calculator,
} from 'lucide-react'
import ScrollReveal from '../components/ScrollReveal'
import BrandFooter from '../components/BrandFooter'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type Tier = {
  name: string
  tagline: string
  price: number
  setup: number
  popular: boolean
  description: string
  includes: string[]
  notIncluded: string[]
}

type AlaCarteService = {
  id: string
  label: string
  icon: React.ElementType
  monthlyPrice: number
  setupPrice: number
  description: string
}

// ─────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────
const TIERS: Tier[] = [
  {
    name: 'Capture',
    tagline: 'Stop losing leads you\'re already getting',
    price: 200,
    setup: 400,
    popular: false,
    description: 'Your phone rings and your website gets traffic every day. The question is how much of that you\'re actually converting. MissedCall AI catches every missed call. Your custom website turns visitors into quote requests.',
    includes: [
      'MissedCall AI — 24/7 AI text-back',
      'Custom website (built in 3 days)',
      'Unlimited website changes',
      'Lead capture + CRM dashboard',
      'Calendar integration',
    ],
    notIncluded: ['Google Ads management', 'Mass email & SMS campaigns'],
  },
  {
    name: 'Scale',
    tagline: 'Capture more and get found by more',
    price: 290,
    setup: 400,
    popular: true,
    description: 'You\'re not just recovering missed leads anymore — you\'re generating new ones. Google Ads puts you at the top when someone in your area searches for what you do. Everything in Capture, plus a managed ads pipeline that works while you\'re on the job.',
    includes: [
      'Everything in Capture',
      'Google Ads setup & management',
      'Monthly ad performance reports',
      'Keyword research & optimization',
      'A/B ad testing',
    ],
    notIncluded: ['Mass email & SMS campaigns'],
  },
  {
    name: 'Full System',
    tagline: 'The complete growth engine, running together',
    price: 385,
    setup: 500,
    popular: false,
    description: 'Every lead captured. Every past customer re-engaged. Every search result owned. This is what a fully scaled trade business looks like — all of it managed by one team, built to work together.',
    includes: [
      'Everything in Scale',
      'Mass email & SMS campaigns',
      'Campaign analytics & tracking',
      'Automated follow-up sequences',
      'Priority setup & support',
    ],
    notIncluded: [],
  },
  {
    name: 'AI Complete',
    tagline: 'The full system — fully automated by AI',
    price: 900,
    setup: 750,
    popular: false,
    description: 'Everything in Full System, plus AI that handles your website chat, email replies, Google reviews, and your entire CRM — automatically. Your business keeps running and responding even when you\'re completely off the clock.',
    includes: [
      'Everything in Full System',
      'AI website chatbot — answers visitor questions 24/7',
      'AI email response — replies to inquiries automatically',
      'AI Google review manager — monitors and responds to reviews',
      'Full CRM AI integration — contacts, follow-ups, and notes automated',
    ],
    notIncluded: [],
  },
]

const ALA_CARTE: AlaCarteService[] = [
  { id: 'missedcall', label: 'MissedCall AI',          icon: PhoneMissed,      monthlyPrice: 225, setupPrice: 250, description: '24/7 AI text-back, lead capture, calendar booking' },
  { id: 'website',    label: 'Custom Website',          icon: Globe,            monthlyPrice: 75,  setupPrice: 200, description: 'Built from scratch, SEO-ready, unlimited changes' },
  { id: 'ads',        label: 'Google Ads Management',   icon: BarChart3,        monthlyPrice: 125, setupPrice: 250, description: 'Setup, keyword management, monthly optimization' },
  { id: 'campaigns',  label: 'Mass Email & SMS',        icon: Megaphone,        monthlyPrice: 75,  setupPrice: 100, description: 'Unlimited campaigns, list segmentation, analytics' },
  { id: 'crm',        label: 'CRM Dashboard',           icon: LayoutDashboard,  monthlyPrice: 75,  setupPrice: 0,   description: 'Client records, activity timeline, contact management' },
  { id: 'calendar',   label: 'Calendar Integration',    icon: CalendarCheck,    monthlyPrice: 75,  setupPrice: 0,   description: 'Google Calendar sync, online booking, reminders' },
]

// ─────────────────────────────────────────────────────────
// "See your numbers" preview panel
// ─────────────────────────────────────────────────────────
function NumbersPreview({
  tier,
  onClose,
}: {
  tier: Tier
  onClose: () => void
}) {
  const [missedCalls, setMissedCalls] = useState(20)
  const [jobValue, setJobValue] = useState(300)

  const convRate = 0.3
  const recaptured = Math.round(missedCalls * convRate)
  const monthlyRecovery = recaptured * jobValue
  const netGain = monthlyRecovery - tier.price
  const roi = tier.price > 0 ? Math.round((netGain / tier.price) * 100) : 0

  return (
    <div className="mt-4 border-2 p-6 animate-[aa-slide-down_0.22s_ease-out]" style={{ borderColor: '#EE6B1A', background: 'rgba(238,107,26,0.06)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calculator size={16} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#EE6B1A' }}>
            Your numbers — {tier.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-widest transition-colors"
          style={{ color: '#6E7681' }}
        >
          Close ✕
        </button>
      </div>

      {/* Inputs */}
      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
              Missed calls / month
            </label>
            <span className="font-black text-[18px] tabular-nums" style={{ color: '#EE6B1A' }}>{missedCalls}</span>
          </div>
          <input
            type="range" min={1} max={100} value={missedCalls}
            onChange={e => setMissedCalls(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
              Avg job value
            </label>
            <span className="font-black text-[18px] tabular-nums" style={{ color: '#EE6B1A' }}>${jobValue}</span>
          </div>
          <input
            type="range" min={100} max={2000} step={50} value={jobValue}
            onChange={e => setJobValue(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border-2 p-3 text-center" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
          <div className="text-[22px] font-black tabular-nums" style={{ color: '#F2F0EB' }}>{recaptured}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider mt-1" style={{ color: '#6E7681' }}>Jobs recovered</div>
        </div>
        <div className="border-2 p-3 text-center" style={{ borderColor: '#EE6B1A', background: 'rgba(238,107,26,0.1)' }}>
          <div className="text-[22px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>${monthlyRecovery.toLocaleString()}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider mt-1" style={{ color: '#6E7681' }}>Revenue/mo</div>
        </div>
        <div className="border-2 p-3 text-center" style={{ borderColor: 'rgba(26,74,112,0.5)', background: 'rgba(26,74,112,0.1)' }}>
          <div className="text-[22px] font-black tabular-nums" style={{ color: '#F2F0EB' }}>{roi}%</div>
          <div className="font-mono text-[9px] uppercase tracking-wider mt-1" style={{ color: '#6E7681' }}>ROI</div>
        </div>
      </div>
      <p className="font-mono text-[10px]" style={{ color: '#6E7681' }}>
        *Estimates assume 30% conversion rate on recovered missed calls. Your actual results may vary.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Tier card
// ─────────────────────────────────────────────────────────
function TierCard({ tier }: { tier: Tier }) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div
      className="relative border-2 p-7 sm:p-8 flex flex-col h-full"
      style={tier.popular
        ? { borderColor: '#EE6B1A', background: '#16181C', color: '#F2F0EB' }
        : { borderColor: 'rgba(110,118,129,0.4)', background: '#16181C', color: '#F2F0EB' }
      }
    >
      {tier.popular && (
        <span className="absolute -top-3.5 left-7 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ background: '#EE6B1A', color: '#16181C' }}>
          Most popular
        </span>
      )}

      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: tier.popular ? '#EE6B1A' : '#6E7681' }}>
        {tier.name}
      </div>
      <div className="text-[14px] mb-5 leading-snug" style={{ color: 'rgba(242,240,235,0.6)' }}>
        {tier.tagline}
      </div>

      <div className="text-[12px] mb-1" style={{ color: '#6E7681' }}>${tier.setup} one-time setup</div>
      <div className="flex items-end gap-1 mb-5">
        <span className="text-[26px] font-black leading-none">$</span>
        <span className="text-[54px] font-black leading-none tabular-nums">{tier.price}</span>
        <span className="mb-1.5 text-[14px]" style={{ color: '#6E7681' }}>/mo</span>
      </div>

      <p className="text-[13.5px] leading-relaxed mb-6" style={{ color: 'rgba(242,240,235,0.65)' }}>
        {tier.description}
      </p>

      <ul className="space-y-2.5 mb-4 flex-1">
        {tier.includes.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            <Check size={15} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
            <span style={{ color: 'rgba(242,240,235,0.88)' }}>{f}</span>
          </li>
        ))}
        {tier.notIncluded.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            <X size={15} strokeWidth={2.5} className="shrink-0 mt-0.5" style={{ color: '#6E7681' }} />
            <span style={{ color: '#6E7681', textDecoration: 'line-through' }}>{f}</span>
          </li>
        ))}
      </ul>

      {/* See your numbers */}
      <button
        type="button"
        onClick={() => setShowPreview(v => !v)}
        className="flex items-center justify-between w-full px-4 py-2.5 mb-4 border-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-colors"
        style={{
          borderColor: showPreview ? '#EE6B1A' : 'rgba(110,118,129,0.35)',
          color: showPreview ? '#EE6B1A' : '#6E7681',
          background: 'transparent',
        }}
      >
        See your numbers
        {showPreview
          ? <ChevronUp size={14} strokeWidth={2.5} />
          : <ChevronDown size={14} strokeWidth={2.5} />
        }
      </button>

      {showPreview && (
        <NumbersPreview tier={tier} onClose={() => setShowPreview(false)} />
      )}

      <Link
        href="/book"
        className="aa-btn mt-4 inline-flex items-center justify-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide"
        style={tier.popular
          ? { background: '#EE6B1A', color: '#16181C' }
          : { background: 'rgba(242,240,235,0.1)', color: '#F2F0EB', border: '2px solid rgba(110,118,129,0.35)' }
        }
      >
        Get started <ArrowRight size={15} strokeWidth={2.5} />
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// À la carte plan builder
// ─────────────────────────────────────────────────────────
function PlanBuilder() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const monthly = ALA_CARTE
    .filter(s => selected.has(s.id))
    .reduce((sum, s) => sum + s.monthlyPrice, 0)
  const setup = ALA_CARTE
    .filter(s => selected.has(s.id))
    .reduce((sum, s) => sum + s.setupPrice, 0)

  return (
    <div className="border-2" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.02)' }}>
      {/* Header */}
      <div className="border-b-2 px-7 py-5" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] mb-1" style={{ color: '#EE6B1A' }}>
          Build your own plan
        </div>
        <p className="text-[14px]" style={{ color: '#6E7681' }}>
          Not sure which tier fits? Pick exactly what you need. The total updates as you go.
        </p>
      </div>

      {/* Service toggles */}
      <div className="divide-y-2" style={{ borderColor: 'rgba(110,118,129,0.15)' }}>
        {ALA_CARTE.map(service => {
          const isOn = selected.has(service.id)
          const Icon = service.icon
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => toggle(service.id)}
              className="w-full flex items-center gap-5 px-7 py-5 text-left transition-colors cursor-pointer"
              style={{ background: isOn ? 'rgba(238,107,26,0.06)' : 'transparent' }}
            >
              {/* Checkbox */}
              <span
                className="grid h-6 w-6 shrink-0 place-items-center border-2 transition-colors"
                style={{
                  borderColor: isOn ? '#EE6B1A' : 'rgba(110,118,129,0.4)',
                  background: isOn ? '#EE6B1A' : 'transparent',
                }}
              >
                {isOn && <Check size={14} strokeWidth={3} style={{ color: '#16181C' }} />}
              </span>

              {/* Icon */}
              <span className="grid h-10 w-10 shrink-0 place-items-center" style={{ background: isOn ? 'rgba(26,74,112,0.5)' : 'rgba(110,118,129,0.15)' }}>
                <Icon size={18} strokeWidth={2.25} style={{ color: isOn ? '#EE6B1A' : '#6E7681' }} />
              </span>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: isOn ? '#F2F0EB' : '#6E7681' }}>{service.label}</div>
                <div className="text-[12px] mt-0.5" style={{ color: '#6E7681' }}>{service.description}</div>
              </div>

              {/* Price */}
              <div className="text-right shrink-0">
                <div className="text-[15px] font-bold tabular-nums" style={{ color: isOn ? '#EE6B1A' : '#6E7681' }}>
                  ${service.monthlyPrice}/mo
                </div>
                {service.setupPrice > 0 && (
                  <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: '#6E7681' }}>
                    +${service.setupPrice} setup
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Running total */}
      <div className="border-t-2 px-7 py-5" style={{ borderColor: 'rgba(110,118,129,0.25)', background: selected.size > 0 ? 'rgba(238,107,26,0.06)' : 'transparent' }}>
        {selected.size === 0 ? (
          <p className="text-[13px] text-center" style={{ color: '#6E7681' }}>
            Select services above to see your plan total.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: '#6E7681' }}>Your plan total</div>
              <div className="flex items-end gap-3">
                <div>
                  <span className="text-[36px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>${monthly}</span>
                  <span className="text-[14px] ml-1" style={{ color: '#6E7681' }}>/mo</span>
                </div>
                {setup > 0 && (
                  <span className="font-mono text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#6E7681' }}>
                    + ${setup} one-time setup
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1" style={{ color: '#6E7681' }}>
                {selected.size} service{selected.size !== 1 ? 's' : ''} selected
              </div>
            </div>
            <Link
              href="/book"
              className="aa-btn inline-flex items-center justify-center gap-2 px-6 py-3.5 text-[14px] font-bold uppercase tracking-wide shrink-0"
              style={{ background: '#EE6B1A', color: '#16181C' }}
            >
              Start with this plan <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────
export default function PricingPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>No contracts. No surprises. Cancel anytime.</span>
          </div>
          <h1 className="text-[clamp(2.6rem,7vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            Pick your system.<br />
            <span style={{ color: '#EE6B1A' }}>Scale your business.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-2xl mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Every plan is built around the same goal: more leads captured, more jobs booked, less left on the table. Choose the tier that fits where you are now.
          </p>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── Tier cards ───────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>System tiers</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight" style={{ color: '#16181C' }}>
                Four levels of the system.
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
            {TIERS.map((tier, i) => (
              <ScrollReveal key={i} className="h-full">
                <TierCard tier={tier} />
              </ScrollReveal>
            ))}
          </div>

          {/* Spam add-on */}
          <ScrollReveal>
            <div
              className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-2 p-6"
              style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.02)' }}
            >
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center" style={{ background: '#16181C' }}>
                  <ShieldBan size={20} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                </span>
                <div>
                  <div className="text-[15px] font-extrabold tracking-tight" style={{ color: '#F2F0EB' }}>
                    Spam call screening — add to any plan
                  </div>
                  <div className="mt-1 text-[13.5px]" style={{ color: '#6E7681' }}>
                    Filter the noise. Only real customers reach you. <span className="font-semibold" style={{ color: '#F2F0EB' }}>$75/mo · $150 one-time setup.</span>
                  </div>
                </div>
              </div>
              <Link href="/book" className="aa-btn shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Add to plan <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── À la carte builder ───────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>À la carte</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Build your own plan.
              </h2>
            </div>
            <PlanBuilder />
          </ScrollReveal>
        </div>
      </section>

      {/* ── Fine print + trust ───────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <ScrollReveal>
            <div className="space-y-4 text-center text-[14px]" style={{ color: '#6E7681' }}>
              <p>
                <span className="font-semibold" style={{ color: '#16181C' }}>Setup fees</span> are one-time and vary slightly based on complexity — exact costs confirmed on your discovery call.
              </p>
              <p>
                All ad spend goes directly to Google and is{' '}
                <span className="font-semibold" style={{ color: '#16181C' }}>separate from these fees</span>. We never touch your ad budget.
              </p>
              <div className="pt-4 border-t-2" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
                <p className="text-[15px] font-semibold mb-2" style={{ color: '#16181C' }}>
                  No account managers. No outsourced support.
                </p>
                <p>
                  When you work with Align and Acquire, you have direct access to the team that runs your system. That&apos;s not a selling point — it&apos;s just how we operate.
                </p>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] pt-2">
                No contracts · Cancel anytime · 30-day money-back guarantee
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              Ready to stop leaving<br />
              <span style={{ color: '#EE6B1A' }}>money on the table?</span>
            </h2>
            <p className="text-[16px] mb-9 max-w-lg mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Pick a plan or build your own. Either way, we&apos;ll get you live in days — not months.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Book a free call <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
              <Link href="/services" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: 'rgba(242,240,235,0.3)', color: '#F2F0EB' }}>
                See all services
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
