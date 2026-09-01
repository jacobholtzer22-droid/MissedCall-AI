'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Check, ArrowRight, ShieldBan, PhoneMissed, Globe,
  BarChart3, Megaphone, CalendarCheck, LayoutDashboard,
  Calculator, Search,
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
  description?: string
  includes: string[]
  notIncluded: string[]
  addOns?: string[]
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
// Data — updated prices + clearer feature descriptions
// ─────────────────────────────────────────────────────────
const TIERS: Tier[] = [
  {
    name: 'Catch',
    tagline: 'Stop losing the leads you already get.',
    price: 250,
    setup: 400,
    popular: true,
    includes: [
      'Custom Website: built from scratch, ranks on Google, unlimited same-day updates',
      'MissedCall AI: every missed caller gets an instant text back that captures the lead',
    ],
    notIncluded: [],
    addOns: ['Spam Call Screening available as add-on (+$75/mo)'],
  },
  {
    name: 'Grow',
    tagline: 'Get found, then bring the new leads in.',
    price: 400,
    setup: 500,
    popular: false,
    includes: [
      'Everything in Catch',
      'SEO Optimization: on-page work, local keyword targeting, and Google Business Profile so you show up without paying per click',
      'Google Ads Management: paid search, keyword research, bid optimization, A/B testing and plain-English monthly reports',
      'Priority setup and support',
    ],
    notIncluded: [],
    addOns: ['Spam Call Screening available as add-on (+$75/mo)'],
  },
  {
    name: 'Automate',
    tagline: 'Let AI run it while you\'re off the clock.',
    price: 700,
    setup: 750,
    popular: false,
    includes: [
      'Everything in Grow',
      'Calendar Integration: customers book appointments online',
      'Mass Email Sending: reach your whole contact list at once with open and click tracking',
      'Mass SMS Sending: text your full contact list with response tracking',
      'AI Website Chatbot: answers visitor questions 24/7',
      'AI Email Responses: reads and replies to incoming email automatically',
      'AI Google Review Manager: monitors and posts review responses',
      'Full Leads Dashboard AI Integration: auto-updates contacts, follow-ups and notes',
      'Spam Call Screening: included',
    ],
    notIncluded: [],
  },
]

// À la carte — priced so bundles are clearly the better deal
// À la carte — standalone pricing. Two or more services together will cost
// significantly more than a bundle, which is intentional.
const ALA_CARTE: AlaCarteService[] = [
  { id: 'missedcall', label: 'MissedCall AI',         icon: PhoneMissed,     monthlyPrice: 299, setupPrice: 299, description: 'Automatic text-back for every missed caller, lead capture, calendar booking' },
  { id: 'website',    label: 'Custom Website',         icon: Globe,           monthlyPrice: 169, setupPrice: 250, description: 'Built from scratch, shows up on Google, unlimited same-day updates' },
  { id: 'seo',        label: 'SEO Optimization',       icon: Search,          monthlyPrice: 125, setupPrice: 150, description: 'On-page optimization, local keyword targeting and Google Business Profile so customers find you without paid clicks' },
  { id: 'ads',        label: 'Google Ads Management',  icon: BarChart3,       monthlyPrice: 199, setupPrice: 300, description: '' },
  { id: 'campaigns',  label: 'Email & SMS Campaigns',  icon: Megaphone,       monthlyPrice: 149, setupPrice: 150, description: 'Blast messages to your full contact list, unlimited campaigns' },
  { id: 'crm',        label: 'Leads Dashboard',        icon: LayoutDashboard, monthlyPrice: 109, setupPrice: 0,   description: 'All contacts from missed calls and website leads in one place' },
  { id: 'calendar',   label: 'Calendar Integration',   icon: CalendarCheck,   monthlyPrice: 89,  setupPrice: 0,   description: 'Online booking synced to your Google Calendar' },
  { id: 'spam',       label: 'Spam Call Screening',    icon: ShieldBan,       monthlyPrice: 75,  setupPrice: 150, description: 'Blocks robocalls before they reach you. Only real customers get through.' },
]

// ─────────────────────────────────────────────────────────
// Tier card — no "See Your Numbers" button
// ─────────────────────────────────────────────────────────
function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className="relative border-2 p-6 sm:p-7 flex flex-col h-full"
      style={tier.popular
        ? { borderColor: '#EE6B1A', background: '#16181C', color: '#F2F0EB' }
        : { borderColor: 'rgba(110,118,129,0.4)', background: '#16181C', color: '#F2F0EB' }
      }
    >
      {tier.popular && (
        <span className="absolute -top-3.5 left-6 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ background: '#EE6B1A', color: '#16181C' }}>
          Most popular
        </span>
      )}

      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: tier.popular ? '#EE6B1A' : '#6E7681' }}>
        {tier.name}
      </div>
      <div className="text-[13px] mb-4 leading-snug" style={{ color: 'rgba(242,240,235,0.55)' }}>
        {tier.tagline}
      </div>

      <div className="text-[11px] mb-1" style={{ color: '#6E7681' }}>${tier.setup} one-time setup</div>
      <div className="flex items-end gap-1 mb-4">
        <span className="text-[22px] font-black leading-none">$</span>
        <span className="text-[48px] font-black leading-none tabular-nums">{tier.price}</span>
        <span className="mb-1.5 text-[13px]" style={{ color: '#6E7681' }}>/mo</span>
      </div>

      <ul className="space-y-2 flex-1 mb-5">
        {tier.includes.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
            <Check size={14} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
            <span style={{ color: 'rgba(242,240,235,0.85)' }}>{f}</span>
          </li>
        ))}
        {tier.addOns?.map((f, i) => (
          <li key={`addon-${i}`} className="flex items-start gap-2.5 text-[12.5px] mt-1 pt-2 border-t" style={{ borderColor: 'rgba(110,118,129,0.2)' }}>
            <span className="shrink-0 mt-0.5 font-black text-[13px] leading-none" style={{ color: '#6E7681' }}>+</span>
            <span style={{ color: '#6E7681' }}>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/book"
        className="aa-btn inline-flex items-center justify-center gap-2 px-5 py-3.5 text-[13px] font-bold uppercase tracking-wide"
        style={tier.popular
          ? { background: '#EE6B1A', color: '#16181C' }
          : { background: 'rgba(242,240,235,0.08)', color: '#F2F0EB', border: '2px solid rgba(110,118,129,0.35)' }
        }
      >
        Get started <ArrowRight size={14} strokeWidth={2.5} />
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Standalone "See Your Numbers" section
// ─────────────────────────────────────────────────────────
function NumbersSection() {
  const [selectedTier, setSelectedTier] = useState(0)
  const [missedCalls, setMissedCalls] = useState(20)
  const [jobValue, setJobValue] = useState(300)

  const tier = TIERS[selectedTier]
  const recaptured = Math.round(missedCalls * 0.3)
  const monthlyRecovery = recaptured * jobValue
  const netGain = monthlyRecovery - tier.price
  const roi = tier.price > 0 ? Math.round((netGain / tier.price) * 100) : 0

  return (
    <div className="border-2" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.02)' }}>
      {/* Header */}
      <div className="border-b-2 px-7 py-5" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Calculator size={15} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#EE6B1A' }}>
            See your numbers
          </span>
        </div>
        <p className="text-[14px]" style={{ color: '#6E7681' }}>
          Pick a plan and adjust the sliders to your business. See how fast it pays for itself.
        </p>
      </div>

      {/* Tier selector tabs */}
      <div className="grid grid-cols-3 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
        {TIERS.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedTier(i)}
            className="px-4 py-3 text-[12px] font-bold uppercase tracking-wide transition-colors border-b-2 -mb-px"
            style={{
              borderColor: selectedTier === i ? '#EE6B1A' : 'transparent',
              color: selectedTier === i ? '#EE6B1A' : '#6E7681',
              background: 'transparent',
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid sm:grid-cols-2 gap-6 px-7 py-6 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
              Missed calls / month
            </label>
            <span className="font-black text-[20px] tabular-nums" style={{ color: '#EE6B1A' }}>{missedCalls}</span>
          </div>
          <input
            type="range" min={1} max={100} value={missedCalls}
            onChange={e => setMissedCalls(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
          <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: '#6E7681' }}>
            <span>1</span><span>50</span><span>100</span>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
              Average job value
            </label>
            <span className="font-black text-[20px] tabular-nums" style={{ color: '#EE6B1A' }}>${jobValue}</span>
          </div>
          <input
            type="range" min={100} max={2000} step={50} value={jobValue}
            onChange={e => setJobValue(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
          <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: '#6E7681' }}>
            <span>$100</span><span>$1,000</span><span>$2,000</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-px px-7 py-6" style={{ background: 'rgba(110,118,129,0.15)' }}>
        <div className="px-4 py-5 text-center" style={{ background: '#16181C' }}>
          <div className="text-[26px] font-black tabular-nums" style={{ color: '#F2F0EB' }}>{recaptured}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider mt-1" style={{ color: '#6E7681' }}>Jobs recovered / mo</div>
        </div>
        <div className="px-4 py-5 text-center" style={{ background: '#16181C' }}>
          <div className="text-[26px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>${monthlyRecovery.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider mt-1" style={{ color: '#6E7681' }}>Revenue recovered / mo</div>
        </div>
        <div className="px-4 py-5 text-center" style={{ background: '#1A4A70' }}>
          <div className="text-[26px] font-black tabular-nums" style={{ color: '#FFFFFF' }}>{roi}%</div>
          <div className="font-mono text-[10px] uppercase tracking-wider mt-1" style={{ color: 'rgba(242,240,235,0.65)' }}>Return on investment</div>
        </div>
      </div>

      <div className="px-7 pb-5 pt-2">
        <p className="font-mono text-[10px]" style={{ color: '#6E7681' }}>
          *Estimates based on 30% conversion rate on recovered missed calls. Your actual results may vary.
        </p>
      </div>
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

  const monthly = ALA_CARTE.filter(s => selected.has(s.id)).reduce((sum, s) => sum + s.monthlyPrice, 0)
  const setup   = ALA_CARTE.filter(s => selected.has(s.id)).reduce((sum, s) => sum + s.setupPrice, 0)

  return (
    <div className="border-2" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.02)' }}>
      <div className="border-b-2 px-7 py-5" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] mb-1" style={{ color: '#EE6B1A' }}>
          Build your own plan
        </div>
        <p className="text-[14px]" style={{ color: '#6E7681' }}>
          Not sure which tier fits? Pick exactly what you need and see the total update in real time.
        </p>
      </div>

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
              <span
                className="grid h-6 w-6 shrink-0 place-items-center border-2 transition-colors"
                style={{ borderColor: isOn ? '#EE6B1A' : 'rgba(110,118,129,0.4)', background: isOn ? '#EE6B1A' : 'transparent' }}
              >
                {isOn && <Check size={14} strokeWidth={3} style={{ color: '#16181C' }} />}
              </span>
              <span className="grid h-10 w-10 shrink-0 place-items-center" style={{ background: isOn ? 'rgba(26,74,112,0.5)' : 'rgba(110,118,129,0.15)' }}>
                <Icon size={18} strokeWidth={2.25} style={{ color: isOn ? '#EE6B1A' : '#6E7681' }} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: isOn ? '#F2F0EB' : '#6E7681' }}>{service.label}</div>
                {service.description && (
                  <div className="text-[12px] mt-0.5" style={{ color: '#6E7681' }}>{service.description}</div>
                )}
              </div>
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
                Three levels of the system.
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-3 gap-5 items-stretch">
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
              style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#16181C' }}
            >
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center" style={{ background: 'rgba(242,240,235,0.08)' }}>
                  <ShieldBan size={20} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                </span>
                <div>
                  <div className="text-[15px] font-extrabold tracking-tight" style={{ color: '#F2F0EB' }}>
                    Spam Call Screening — add to any plan
                  </div>
                  <div className="mt-1 text-[13.5px]" style={{ color: '#6E7681' }}>
                    Blocks robocalls before they reach you. Only real customers get through.{' '}
                    <span className="font-semibold" style={{ color: '#F2F0EB' }}>$75/mo · $150 one-time setup.</span>
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
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>À la carte</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight" style={{ color: '#16181C' }}>
                Build your own plan.
              </h2>
              <p className="mt-3 text-[14px]" style={{ color: '#6E7681' }}>
                These are standalone prices. If you need two or more services, the plans above will almost always cost less and include more. This is here for people who genuinely only need one thing.
              </p>
            </div>
            <PlanBuilder />
          </ScrollReveal>
        </div>
      </section>

      {/* ── Fine print + trust ───────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <ScrollReveal>
            <div className="space-y-4 text-center text-[14px]" style={{ color: '#6E7681' }}>
              <p>
                <span className="font-semibold" style={{ color: '#F2F0EB' }}>Setup fees</span> are one-time and vary slightly based on complexity — confirmed on your discovery call.
              </p>
              <p>
                All ad spend goes directly to Google and is{' '}
                <span className="font-semibold" style={{ color: '#F2F0EB' }}>separate from these fees</span>. We never touch your ad budget.
              </p>
              <div className="pt-4 border-t-2" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
                <p className="text-[15px] font-semibold mb-2" style={{ color: '#F2F0EB' }}>
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
