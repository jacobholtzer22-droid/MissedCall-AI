'use client'

import Link from 'next/link'
import { ArrowRight, Upload, Mail, Send, MessageSquare, Users, BarChart3, RefreshCw, History, Megaphone, Check } from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'
import BrandFooter from '@/app/components/BrandFooter'

const steps = [
  { title: 'Import your clients', description: 'Upload your existing client list or let new leads flow in automatically from MissedCall AI and your website.', icon: Upload },
  { title: 'Build your campaign', description: 'Write your message, pick email or SMS (or both), choose who gets it: all clients, new leads, past customers, or a custom group.', icon: Mail },
  { title: 'Hit send', description: 'Blast it out to everyone at once. Track opens, clicks, and responses right from your dashboard.', icon: Send },
]

const features = [
  { title: 'Mass SMS Blasts', description: 'Text your whole client list at once with promotions, updates, or reminders.', icon: MessageSquare },
  { title: 'Mass Email Campaigns', description: 'Professional emails to stay top of mind with your customers.', icon: Mail },
  { title: 'Client Segmentation', description: 'Send to all clients, just new leads, past customers, or build custom lists.', icon: Users },
  { title: 'Campaign Analytics', description: 'See who opened, who clicked, who replied. All from your dashboard.', icon: BarChart3 },
  { title: 'Automated Follow-ups', description: 'Set up drip sequences that go out automatically after someone becomes a lead.', icon: RefreshCw },
  { title: 'Client History', description: 'Every message, every interaction, every job tied to each client.', icon: History },
]

const useCases = [
  'Remind past customers about seasonal services',
  'Send a promo to everyone on your list',
  'Follow up with leads who never booked',
  'Announce new services to your whole base',
]

export default function CampaignsPage() {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>Mass email & SMS · One click, everyone gets it</span>
          </div>
          <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            One message.<br />
            Every customer.<br />
            <span style={{ color: '#EE6B1A' }}>Instant impact.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-3xl mx-auto mb-8" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Send mass email and SMS campaigns to your entire client list: past customers, new leads, everyone. Built right into your dashboard.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => scrollTo('demo')} className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
              See it in action <ArrowRight size={18} strokeWidth={2.5} />
            </button>
            <button onClick={() => scrollTo('pricing')} className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: '#6E7681', color: '#F2F0EB' }}>
              Add campaigns to my plan
            </button>
          </div>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <div className="border-y-2 py-4 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
        <Marquee
          items={['Mass SMS', 'Mass Email', 'Segment Your List', 'Track Opens & Clicks', 'Drip Campaigns', 'All in One Dashboard']}
          separator="⚡"
          speed="normal"
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
        />
      </div>

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
                Three steps. <span style={{ color: '#1A4A70' }}>From list to blast.</span>
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

      {/* ── Features ─────────────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>What you can do</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Everything you need<br /><span style={{ color: '#EE6B1A' }}>to reach everyone.</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'rgba(110,118,129,0.2)' }}>
              {features.map((f) => (
                <div key={f.title} className="aa-feature-card scroll-reveal p-7" style={{ background: '#16181C' }}>
                  <div className="grid h-11 w-11 place-items-center mb-5" style={{ background: '#1A4A70' }}>
                    <f.icon size={20} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  </div>
                  <h3 className="text-[17px] font-extrabold tracking-tight mb-2" style={{ color: '#F2F0EB' }}>{f.title}</h3>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: '#6E7681' }}>{f.description}</p>
                  <span className="aa-feature-bar" />
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Demo / Use Cases ─────────────────────────────── */}
      <section id="demo" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                  <span style={{ color: '#EE6B1A' }}>All in one place</span>
                </div>
                <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-6">
                  You already have<br />customers.<br />
                  <span style={{ color: '#1A4A70' }}>They already trust you.</span>
                </h2>
                <p className="text-[16px] font-bold mb-6" style={{ color: '#EE6B1A' }}>
                  This is the easiest money you&apos;ll ever make.
                </p>
                <ul className="space-y-3">
                  {useCases.map((u, i) => (
                    <li key={i} className="flex items-start gap-3 text-[14.5px]">
                      <Check size={17} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                      <span style={{ color: 'rgba(22,24,28,0.8)' }}>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-2 p-10 text-center" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
                <Megaphone size={60} strokeWidth={1.5} className="mx-auto mb-4" style={{ color: '#EE6B1A' }} />
                <p className="text-[16px] font-extrabold uppercase tracking-tight mb-2">Campaign builder included</p>
                <p className="text-[13.5px]" style={{ color: '#6E7681' }}>Create campaigns in minutes from your Align and Acquire dashboard. No extra tools needed.</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section id="pricing" className="aa-grid-bg">
        <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Pricing</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                Simple. No surprises.
              </h2>
            </div>
            <div className="border-2 p-8" style={{ borderColor: 'rgba(110,118,129,0.35)', background: 'rgba(242,240,235,0.03)' }}>
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: '#6E7681' }}>One-time setup</div>
                  <div className="text-[32px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>$100</div>
                  <div className="text-[12.5px]" style={{ color: '#6E7681' }}>Client list import, template setup</div>
                </div>
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: '#6E7681' }}>Monthly</div>
                  <div className="flex items-end gap-1">
                    <span className="text-[32px] font-black tabular-nums">$75</span>
                    <span className="mb-1 text-[14px]" style={{ color: '#6E7681' }}>/mo</span>
                  </div>
                  <div className="text-[12.5px]" style={{ color: '#6E7681' }}>Unlimited campaigns</div>
                </div>
              </div>
              <div className="border-t-2 pt-5 text-[13px] mb-7" style={{ borderColor: 'rgba(110,118,129,0.25)', color: '#6E7681' }}>
                <span style={{ color: '#F2F0EB', fontWeight: 600 }}>Requires CRM dashboard.</span> Available as add-on to any package. On Pro or All In you already have the CRM. Just add Campaigns ($75/mo).
              </div>
              <Link href="/book" className="aa-btn w-full inline-flex items-center justify-center gap-2 py-4 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Add campaigns to my plan <ArrowRight size={15} strokeWidth={2.5} />
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
              Ready to reach<br /><span style={{ color: '#EE6B1A' }}>everyone?</span>
            </h2>
            <p className="text-[16px] mb-9 max-w-md mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Add Campaigns to your plan and start blasting. One click.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Add campaigns to my plan
              </Link>
              <Link href="/pricing" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: 'rgba(242,240,235,0.3)', color: '#F2F0EB' }}>
                View all pricing
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
