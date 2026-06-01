import Link from 'next/link'
import { Check, X, ArrowRight, ShieldBan, MessageSquare, Globe, TrendingUp, Calendar, Search, Megaphone } from 'lucide-react'
import ROICalculator from '../components/roi-calculator'
import ScrollReveal from '../components/ScrollReveal'
import Marquee from '../components/Marquee'
import BrandFooter from '../components/BrandFooter'

const packages = [
  {
    name: 'Growth',
    subtitle: 'Website + Ads Management',
    setupFee: 400,
    price: 200,
    popular: false,
    cta: 'Start growing',
    features: [
      { name: 'Custom website (built in 3 days)', included: true },
      { name: 'Unlimited website changes', included: true },
      { name: 'Google Ads setup & management', included: true },
      { name: 'Monthly ad performance reports', included: true },
      { name: 'MissedCall AI (24/7 lead recovery)', included: false },
      { name: 'CRM dashboard + analytics', included: false },
      { name: 'Calendar integration', included: false },
      { name: 'Spam call screening (+$75/mo add-on)', included: false },
    ],
  },
  {
    name: 'Pro',
    subtitle: 'Website + MissedCall AI + CRM',
    setupFee: 400,
    price: 290,
    popular: false,
    cta: "Let's go Pro",
    features: [
      { name: 'Custom website (built in 3 days)', included: true },
      { name: 'Unlimited website changes', included: true },
      { name: 'MissedCall AI (24/7 lead recovery)', included: true },
      { name: 'CRM dashboard + analytics', included: true },
      { name: 'Mass email & SMS campaigns', included: true },
      { name: 'Google Ads management', included: false },
      { name: 'Calendar integration', included: false },
      { name: 'Spam call screening (+$75/mo add-on)', included: false },
    ],
  },
  {
    name: 'All In',
    subtitle: 'Website + MissedCall AI + Ads + CRM',
    setupFee: 500,
    price: 385,
    popular: true,
    cta: 'I want it all',
    features: [
      { name: 'Custom website (built in 3 days)', included: true },
      { name: 'Unlimited website changes', included: true },
      { name: 'Google Ads setup & management', included: true },
      { name: 'Monthly ad performance reports', included: true },
      { name: 'MissedCall AI (24/7 lead recovery)', included: true },
      { name: 'CRM dashboard + analytics', included: true },
      { name: 'Mass email & SMS campaigns', included: true },
      { name: 'Calendar integration', included: true },
      { name: 'Spam call screening (+$75/mo add-on)', included: false },
    ],
  },
]

const standaloneServices = [
  { name: 'Custom Website', price: 75, setupFee: 200, icon: Globe, description: 'Professional website built from scratch. Hosting, security, unlimited changes.' },
  { name: 'MissedCall AI', price: 225, setupFee: 250, icon: MessageSquare, description: 'AI texts back instantly, captures leads, books appointments. 24/7.' },
  { name: 'Ads Management', price: 125, setupFee: 250, icon: TrendingUp, description: 'Google Ads setup, optimization, keyword management, monthly reporting.' },
  { name: 'Spam Call Screening', price: 75, setupFee: 150, icon: ShieldBan, description: 'Press 1 to connect IVR. Blocks robocalls. Only real customers get through.' },
  { name: 'Mass Email & SMS Campaigns', price: 75, setupFee: 100, icon: Megaphone, description: 'Send bulk email and text campaigns to your entire client list. Requires CRM Dashboard.' },
  { name: 'Calendar + CRM Integration', price: 75, setupFee: null, icon: Calendar, description: 'Sync bookings, manage client data, full relationship history.' },
  { name: 'Google Business Profile Setup', price: null, setupFee: null, priceLabel: 'One-time fee (ask us)', icon: Globe, description: 'Setup and optimization of your Google Business listing.' },
  { name: 'SEO Optimization', price: null, setupFee: null, priceLabel: 'Custom pricing (ask us)', icon: Search, description: 'On-page SEO, keyword targeting, Google Business optimization.' },
]

export default function PricingPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>No contracts. No BS. Cancel anytime.</span>
          </div>
          <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            Simple pricing.<br />
            <span style={{ color: '#EE6B1A' }}>No surprises.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-2xl mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Every missed call is lost revenue. Every day without a website is a day your competitors win. Stop leaving money on the table.
          </p>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <div className="border-y-2 py-4 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
        <Marquee
          items={['No Contracts', 'Cancel Anytime', '30-Day Money-Back Guarantee', 'Setup in Days Not Months', 'Real Humans Real Support', 'Pays for Itself']}
          separator="⚡"
          speed="normal"
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
        />
      </div>

      {/* ── Package Cards ────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Bundle packages</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Pick your path.
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid lg:grid-cols-3 gap-5 items-start">
            {packages.map((pkg) => (
              <ScrollReveal key={pkg.name}>
                <div
                  className="relative border-2 p-7 sm:p-8 flex flex-col h-full"
                  style={pkg.popular
                    ? { borderColor: '#EE6B1A', background: '#16181C', color: '#F2F0EB' }
                    : { borderColor: '#16181C', background: '#FFFFFF', color: '#16181C' }
                  }
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 left-7 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ background: '#EE6B1A', color: '#16181C' }}>
                      Most popular
                    </span>
                  )}
                  <div className="text-[12px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: pkg.popular ? '#EE6B1A' : '#6E7681' }}>{pkg.name}</div>
                  <div className="text-[13px] mb-5" style={{ color: pkg.popular ? 'rgba(242,240,235,0.65)' : '#6E7681' }}>{pkg.subtitle}</div>

                  <div className="text-[12px] mb-1" style={{ color: pkg.popular ? '#6E7681' : '#6E7681' }}>
                    ${pkg.setupFee} one-time setup
                  </div>
                  <div className="flex items-end gap-1 mb-6">
                    <span className="text-[28px] font-black leading-none">$</span>
                    <span className="text-[56px] font-black leading-none tabular-nums tracking-tight">{pkg.price}</span>
                    <span className="mb-2 text-[14px] font-semibold" style={{ color: '#6E7681' }}>/mo</span>
                  </div>

                  <ul className="space-y-3 mb-6 flex-1">
                    {pkg.features.map((f) => (
                      <li key={f.name} className="flex items-start gap-2.5 text-[13.5px]">
                        {f.included
                          ? <Check size={17} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                          : <X size={17} strokeWidth={2.5} className="shrink-0 mt-0.5" style={{ color: '#6E7681' }} />}
                        <span style={{ color: f.included ? (pkg.popular ? '#F2F0EB' : '#16181C') : '#6E7681', textDecoration: f.included ? 'none' : 'line-through' }}>{f.name}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/book"
                    className="aa-btn mt-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide"
                    style={pkg.popular
                      ? { background: '#EE6B1A', color: '#16181C' }
                      : { background: '#16181C', color: '#F2F0EB' }}
                  >
                    {pkg.cta}
                    <ArrowRight size={15} strokeWidth={2.5} />
                  </Link>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Spam add-on bar */}
          <ScrollReveal>
            <div className="mt-6 flex flex-col items-start justify-between gap-4 border-2 p-6 sm:flex-row sm:items-center" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center" style={{ background: '#16181C' }}>
                  <ShieldBan size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                </span>
                <div>
                  <div className="text-[16px] font-extrabold tracking-tight">Spam call screening add-on</div>
                  <div className="mt-1 text-[14px]" style={{ color: '#6E7681' }}>
                    Filter robocalls on any plan. <span className="font-semibold" style={{ color: '#16181C' }}>$75/mo · $150 one-time setup.</span>
                  </div>
                </div>
              </div>
              <span className="font-mono text-[12px] font-bold uppercase tracking-widest" style={{ color: '#1A4A70' }}>Add to any plan</span>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Standalone Services ──────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>À la carte</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Need just one thing?<br /><span style={{ color: '#EE6B1A' }}>No problem.</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px" style={{ background: 'rgba(110,118,129,0.2)' }}>
              {standaloneServices.map((service) => {
                const Icon = service.icon
                const hasCustomPrice = 'priceLabel' in service && service.priceLabel
                return (
                  <div key={service.name} className="aa-feature-card scroll-reveal p-6 flex flex-col" style={{ background: '#16181C' }}>
                    <div className="grid h-11 w-11 place-items-center mb-4" style={{ background: '#1A4A70' }}>
                      <Icon size={20} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                    </div>
                    <h3 className="font-extrabold text-[16px] tracking-tight mb-2" style={{ color: '#F2F0EB' }}>{service.name}</h3>
                    {hasCustomPrice ? (
                      <div className="text-[16px] font-bold mb-2" style={{ color: '#EE6B1A' }}>{service.priceLabel}</div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-[22px] font-black tabular-nums">${service.price}</span>
                          <span className="text-[13px]" style={{ color: '#6E7681' }}>/mo</span>
                        </div>
                        {service.setupFee != null && (
                          <span className="text-[11px] mb-1" style={{ color: '#6E7681' }}>${service.setupFee} setup fee</span>
                        )}
                      </>
                    )}
                    <p className="text-[13px] leading-relaxed flex-1 mt-2 mb-4" style={{ color: '#6E7681' }}>{service.description}</p>
                    <Link href="/book" className="aa-btn inline-flex items-center justify-center py-2.5 text-[13px] font-bold uppercase tracking-wide border-2" style={{ borderColor: 'rgba(110,118,129,0.4)', color: '#F2F0EB' }}>
                      Let&apos;s talk
                    </Link>
                    <span className="aa-feature-bar" />
                  </div>
                )
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── ROI Calculator ──────────────────────────────── */}
      <section id="calculator" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>The math</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight">
                The math speaks<br /><span style={{ color: '#1A4A70' }}>for itself.</span>
              </h2>
            </div>
            <ROICalculator hideHeading />
          </ScrollReveal>
        </div>
      </section>

      {/* ── Fine print ────────────────────────────────────── */}
      <section className="border-t-2" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 text-center space-y-3 text-[13.5px]" style={{ color: '#6E7681' }}>
          <p><span style={{ color: '#F2F0EB', fontWeight: 600 }}>Setup fees</span> vary slightly based on complexity — exact costs covered on your discovery call.</p>
          <p>All ad spend goes directly to Google and is <span style={{ color: '#F2F0EB', fontWeight: 600 }}>separate from these fees</span>.</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em]">No contracts · Cancel anytime · 30-day money-back guarantee</p>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <h2 className="text-[clamp(2.2rem,6.5vw,4.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              Ready to stop leaving<br />
              <span style={{ color: '#EE6B1A' }}>money on the table?</span>
            </h2>
            <p className="text-[16px] mb-9 max-w-lg mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Pick a package or build your own. No contracts, cancel anytime.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                <MessageSquare size={18} strokeWidth={2.5} />Let&apos;s talk
              </Link>
              <Link href="/missedcall-ai" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: 'rgba(242,240,235,0.3)', color: '#F2F0EB' }}>
                Show me the demo
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
