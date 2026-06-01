import Link from 'next/link'
import Image from 'next/image'
import {
  PhoneMissed, Globe, BarChart3, Megaphone, ShieldBan,
  ArrowRight, Check, TrendingUp, Users, Clock, DollarSign,
  MessageSquareText, CalendarCheck, Search, Mail,
} from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'
import BrandFooter from '@/app/components/BrandFooter'
import SmsThread from '@/app/components/SmsThread'

// ─────────────────────────────────────────────────────────
// Reusable section eyebrow
// ─────────────────────────────────────────────────────────
function Eyebrow({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
      <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
      <span style={{ color: '#EE6B1A' }}>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Impact stat block
// ─────────────────────────────────────────────────────────
function ImpactStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-2 p-5 text-center" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
      <div className="text-[clamp(2rem,5vw,3rem)] font-black tabular-nums leading-none" style={{ color: '#EE6B1A' }}>
        {value}
      </div>
      <div className="mt-2 text-[12.5px] font-medium" style={{ color: '#6E7681' }}>{label}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Section divider — hazard stripe
// ─────────────────────────────────────────────────────────
function Divider() {
  return <div className="aa-hazard opacity-30" />
}

// ─────────────────────────────────────────────────────────
// Google search mockup — animated demo for Google Ads
// ─────────────────────────────────────────────────────────
function GoogleAdsMockup() {
  return (
    <div className="w-full max-w-[420px] mx-auto border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#FFFFFF' }}>
      {/* Search bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: '#E0E0E0', background: '#F8F9FA' }}>
        <Search size={16} strokeWidth={2} style={{ color: '#6E7681' }} />
        <span className="text-[13px]" style={{ color: '#16181C' }}>hvac repair near me</span>
      </div>
      {/* Ad result — first position */}
      <div className="px-4 py-4 border-b" style={{ borderColor: '#E0E0E0' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="border px-1.5 py-0.5 text-[10px] font-bold" style={{ borderColor: '#1A4A70', color: '#1A4A70' }}>Sponsored</span>
          <span className="font-mono text-[10px]" style={{ color: '#6E7681' }}>alignandacquire.com/hvac</span>
        </div>
        <div className="text-[15px] font-semibold mb-1" style={{ color: '#1A0DAB' }}>Your Business · HVAC Repair &amp; Service</div>
        <div className="text-[12.5px]" style={{ color: '#4D5156' }}>Fast, reliable HVAC repair. Same-day service available. Call now — we answer every call.</div>
        <div className="flex gap-3 mt-2">
          {['Schedule Now', 'Call Us', 'Get a Quote'].map(t => (
            <span key={t} className="text-[11px] underline" style={{ color: '#1A0DAB' }}>{t}</span>
          ))}
        </div>
      </div>
      {/* Organic results — blurred competitors */}
      {['Competitor HVAC Co.', 'Another HVAC Service'].map((c, i) => (
        <div key={i} className="px-4 py-3 border-b opacity-40" style={{ borderColor: '#E0E0E0' }}>
          <div className="text-[13px] font-medium" style={{ color: '#1A0DAB' }}>{c}</div>
          <div className="text-[11px]" style={{ color: '#4D5156' }}>HVAC services in your area...</div>
        </div>
      ))}
      {/* Caption */}
      <div className="px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-widest" style={{ background: '#F2F0EB', color: '#6E7681' }}>
        Your business — position #1
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Campaign blast mockup
// ─────────────────────────────────────────────────────────
function CampaignMockup() {
  const contacts = Array.from({ length: 18 })
  return (
    <div className="w-full max-w-[420px] mx-auto border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#16181C' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: '#1A4A70' }}>
        <div>
          <div className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Spring Promo Campaign</div>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'rgba(242,240,235,0.65)' }}>247 recipients · Sending...</div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: '#FFFFFF' }}>
          <span className="aa-live-dot inline-block h-2 w-2 rounded-full" style={{ background: '#EE6B1A' }} />
          Live
        </div>
      </div>
      {/* Message preview */}
      <div className="px-5 py-4 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.2)', background: 'rgba(242,240,235,0.04)' }}>
        <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: '#6E7681' }}>Message</div>
        <div className="text-[12.5px] leading-relaxed" style={{ color: '#F2F0EB' }}>
          "Hey [Name] — it's Rivera Plumbing. Spring is here and we're booking fast. Reply YES for a free inspection this week."
        </div>
      </div>
      {/* Contact grid — delivering */}
      <div className="grid grid-cols-6 gap-1.5 p-5">
        {contacts.map((_, i) => (
          <div
            key={i}
            className="h-7 w-7 grid place-items-center text-[9px] font-black transition-all"
            style={{
              background: i < 12 ? 'rgba(238,107,26,0.85)' : 'rgba(110,118,129,0.2)',
              color: i < 12 ? '#16181C' : '#6E7681',
            }}
          >
            {i < 12 ? '✓' : '·'}
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 font-mono text-[10px] uppercase tracking-widest" style={{ color: '#EE6B1A' }}>
        12 delivered · 6 queued
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Spam screening mockup
// ─────────────────────────────────────────────────────────
function SpamMockup() {
  const calls = [
    { label: 'Extended warranty scam', blocked: true, time: '8:02 AM' },
    { label: 'Robocall — unknown', blocked: true, time: '9:17 AM' },
    { label: 'Marcus Bell — (480) 555-0192', blocked: false, time: '10:34 AM' },
    { label: 'Google My Business spam', blocked: true, time: '11:05 AM' },
    { label: 'Sarah K. — (616) 555-0341', blocked: false, time: '1:22 PM' },
    { label: 'Insurance robocall', blocked: true, time: '2:48 PM' },
  ]
  return (
    <div className="w-full max-w-[420px] mx-auto border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#16181C' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b-2" style={{ borderColor: 'rgba(110,118,129,0.3)', background: '#1A4A70' }}>
        <div className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Today&apos;s call log</div>
        <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(242,240,235,0.65)' }}>4 blocked · 2 connected</div>
      </div>
      {calls.map((c, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(110,118,129,0.15)' }}>
          <div className="flex items-center gap-3">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center text-[10px] font-black"
              style={{ background: c.blocked ? 'rgba(238,107,26,0.15)' : 'rgba(26,74,112,0.4)', color: c.blocked ? '#EE6B1A' : '#F2F0EB' }}
            >
              {c.blocked ? '✕' : '✓'}
            </span>
            <span className="text-[12.5px]" style={{ color: c.blocked ? '#6E7681' : '#F2F0EB', textDecoration: c.blocked ? 'line-through' : 'none' }}>
              {c.label}
            </span>
          </div>
          <span className="font-mono text-[10px] shrink-0" style={{ color: '#6E7681' }}>{c.time}</span>
        </div>
      ))}
      <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-center" style={{ color: '#EE6B1A' }}>
        4 spam calls blocked before they reached you
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────
export default function ServicesPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Page hero ─────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <Eyebrow label="Everything your business needs to scale" />
          <h1 className="text-[clamp(2.6rem,7vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            One system.<br />
            <span style={{ color: '#EE6B1A' }}>All the tools.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: 'rgba(242,240,235,0.65)' }}>
            From capturing every missed call to filling your Google results to re-engaging past customers — built as one system, not sold as five separate tools.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/pricing" className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
              Build your plan <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
            <Link href="/book" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: '#6E7681', color: '#F2F0EB' }}>
              Book a free call
            </Link>
          </div>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ══════════════════════════════════════════════════
          SERVICE 1 — MISSEDCALL AI
          ══════════════════════════════════════════════════ */}
      <section id="missedcall-ai" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Copy */}
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] mb-2" style={{ color: '#EE6B1A' }}>
                <PhoneMissed size={14} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
                Service 01
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
                Every unanswered call<br />is money walking<br />
                <span style={{ color: '#1A4A70' }}>out the door.</span>
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'rgba(22,24,28,0.72)' }}>
                You're on a job. The phone rings. You can't answer. In that 30 seconds, there's a 65% chance they've already called someone else. MissedCall AI texts them back before they even hang up — in your voice, with your business name, asking exactly the right questions to capture the lead and book the job.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(22,24,28,0.72)' }}>
                No voicemail. No missed revenue. No follow-up you have to remember to do. The AI handles the first conversation, qualifies the lead, and either books the appointment or hands it off to you — 24/7, including nights and weekends.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Texts back in under 60 seconds — before they call your competitor',
                  'Captures name, address, service needed, and preferred time',
                  'Books directly to your calendar when connected',
                  'Flags complex leads for your personal follow-up',
                  'Works nights, weekends, and holidays without extra cost',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px]">
                    <Check size={16} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                    <span style={{ color: 'rgba(22,24,28,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/missedcall-ai" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                See full details <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </ScrollReveal>

            {/* Demo */}
            <ScrollReveal>
              <SmsThread />
            </ScrollReveal>
          </div>

          {/* Impact stats */}
          <ScrollReveal>
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: 'rgba(110,118,129,0.3)' }}>
              {[
                { value: '<60s', label: 'Average text-back time' },
                { value: '85%', label: 'Of missed calls never call back' },
                { value: '30%', label: 'Of missed calls convert to booked jobs' },
                { value: '24/7', label: 'Coverage with zero extra cost' },
              ].map((s, i) => (
                <div key={i} className="px-6 py-7 text-center" style={{ background: '#F2F0EB' }}>
                  <div className="text-[clamp(1.8rem,4vw,2.8rem)] font-black tabular-nums" style={{ color: '#1A4A70' }}>{s.value}</div>
                  <div className="mt-2 text-[12px] font-medium" style={{ color: '#6E7681' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Divider />

      {/* ══════════════════════════════════════════════════
          SERVICE 2 — CUSTOM WEBSITES
          ══════════════════════════════════════════════════ */}
      <section id="websites" className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Portfolio visual */}
            <ScrollReveal>
              <div className="space-y-4">
                <div className="border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)' }}>
                  <Image src="/images/portfolio/fraaza-1.png" alt="Fraaza Enterprises website" width={800} height={500} className="w-full h-auto" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)' }}>
                    <Image src="/images/portfolio/jack-of-all-blades-1.png" alt="Jack of All Blades website" width={400} height={250} className="w-full h-auto" />
                  </div>
                  <div className="border-2 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.35)' }}>
                    <Image src="/images/portfolio/aesthetic-gardener-2.png" alt="Aesthetic Gardener website" width={400} height={250} className="w-full h-auto" />
                  </div>
                </div>
                <div className="text-center font-mono text-[10px] uppercase tracking-widest" style={{ color: '#6E7681' }}>
                  Real projects. Real businesses. No templates.
                </div>
              </div>
            </ScrollReveal>

            {/* Copy */}
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] mb-2" style={{ color: '#EE6B1A' }}>
                <Globe size={14} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
                Service 02
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#F2F0EB' }}>
                If they can't find you<br />on Google, they'll find<br />
                <span style={{ color: '#EE6B1A' }}>someone who is.</span>
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'rgba(242,240,235,0.7)' }}>
                Most trade business websites are brochures — they exist, but they don't work. We build custom websites from real code that load in under two seconds, rank on Google, and turn visitors into quote requests. No WordPress, no page builders, no templates. Just a site that performs.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(242,240,235,0.7)' }}>
                And because we manage everything — hosting, security, updates — you never deal with a login or a dashboard. If something needs to change, you tell us and it's done same day.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Built from scratch — no templates, no WordPress, no Wix',
                  'Mobile-first design built for your phone-browsing customers',
                  'SEO built into every page from day one',
                  'Hosting, security, and unlimited updates included',
                  'Launched in days, not months',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px]">
                    <Check size={16} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                    <span style={{ color: 'rgba(242,240,235,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/websites" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                See our portfolio <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <Divider />

      {/* ══════════════════════════════════════════════════
          SERVICE 3 — GOOGLE ADS
          ══════════════════════════════════════════════════ */}
      <section id="google-ads" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Copy */}
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] mb-2" style={{ color: '#EE6B1A' }}>
                <BarChart3 size={14} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
                Service 03
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
                Your competitors are paying<br />to show up above you.<br />
                <span style={{ color: '#1A4A70' }}>Right now.</span>
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'rgba(22,24,28,0.72)' }}>
                When someone searches "HVAC repair near me" or "landscaping company [your city]," the top results are ads. Those businesses are paying to be there — and their phones are ringing because of it. We set up, manage, and continuously optimize your Google Ads so you're in that position, not watching your competitors take the calls.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(22,24,28,0.72)' }}>
                Your ad budget goes directly to Google — it never passes through us. Our fee covers the strategy, the setup, the keyword management, the testing, and the monthly reporting so you always know exactly what your money is doing.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Keyword research built for your specific trade and market',
                  'Campaign live within 3–5 business days',
                  'Negative keywords managed monthly — no wasted spend on junk clicks',
                  'A/B ad testing to find what converts in your market',
                  'Monthly performance reports — plain English, no jargon',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px]">
                    <Check size={16} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                    <span style={{ color: 'rgba(22,24,28,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/ads-management" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                See full details <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </ScrollReveal>

            {/* Demo */}
            <ScrollReveal>
              <GoogleAdsMockup />
            </ScrollReveal>
          </div>
        </div>
      </section>

      <Divider />

      {/* ══════════════════════════════════════════════════
          SERVICE 4 — MASS CAMPAIGNS
          ══════════════════════════════════════════════════ */}
      <section id="campaigns" className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Demo */}
            <ScrollReveal>
              <CampaignMockup />
            </ScrollReveal>

            {/* Copy */}
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] mb-2" style={{ color: '#EE6B1A' }}>
                <Megaphone size={14} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
                Service 04
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#F2F0EB' }}>
                Your cheapest leads<br />are already<br />
                <span style={{ color: '#EE6B1A' }}>in your phone.</span>
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'rgba(242,240,235,0.7)' }}>
                Every customer you've ever worked with already trusts you. They don't need to be convinced — they just need to hear from you at the right moment. One text or email to your client list about a seasonal service or a limited-time offer fills slow weeks faster than any ad campaign.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(242,240,235,0.7)' }}>
                We build the campaigns, write the messages, and send them from your dashboard. You pick who gets it — everyone, past customers only, new leads only, or a custom list — and we track who opened, who replied, and who booked.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Mass SMS and email campaigns from one dashboard',
                  'Segment your list — all clients, past customers, new leads, or custom',
                  'Track opens, clicks, and replies in real time',
                  'Automated follow-up sequences for leads who didn\'t respond',
                  'Campaign history tied to every client contact record',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px]">
                    <Check size={16} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                    <span style={{ color: 'rgba(242,240,235,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/campaigns" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                See full details <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <Divider />

      {/* ══════════════════════════════════════════════════
          SERVICE 5 — SPAM SCREENING
          ══════════════════════════════════════════════════ */}
      <section id="spam-screening" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Copy */}
            <ScrollReveal>
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] mb-2" style={{ color: '#EE6B1A' }}>
                <ShieldBan size={14} strokeWidth={2.5} style={{ color: '#EE6B1A' }} />
                Service 05
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5">
                Stop answering calls<br />
                <span style={{ color: '#1A4A70' }}>you&apos;re not getting paid for.</span>
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'rgba(22,24,28,0.72)' }}>
                The average trade business gets 8–12 spam calls per day. That's 30–60 minutes of your time — every single day — answering calls that will never turn into work. Worse, every second you spend on a robocall is a real customer getting your voicemail.
              </p>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(22,24,28,0.72)' }}>
                Our spam screening system makes every caller press 1 before they reach you. Robots can't press buttons. Real customers do it without thinking twice. Installed on your existing number — nothing changes for your real callers.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Works with your existing phone number — nothing changes for customers',
                  'Robocalls and warranty scams blocked before they reach you',
                  'Real customers press 1 and connect in under 3 seconds',
                  'Pairs with MissedCall AI — real callers who don\'t get through still get a text back',
                  'Set up in under 24 hours',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px]">
                    <Check size={16} strokeWidth={3} className="shrink-0 mt-0.5" style={{ color: '#EE6B1A' }} />
                    <span style={{ color: 'rgba(22,24,28,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/spam-screening" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                See full details <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </ScrollReveal>

            {/* Demo */}
            <ScrollReveal>
              <SpamMockup />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <Eyebrow label="Ready to build your system" />
            <h2 className="text-[clamp(2.2rem,6vw,4.2rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              Pick what your<br />
              business needs.<br />
              <span style={{ color: '#EE6B1A' }}>We handle the rest.</span>
            </h2>
            <p className="text-[16px] leading-relaxed max-w-xl mx-auto mb-9" style={{ color: 'rgba(242,240,235,0.65)' }}>
              No account managers. No outsourced support. When you work with Align and Acquire, you have direct access to the team that runs your system. That's not a selling point — it's just how we operate.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/pricing" className="aa-btn inline-flex items-center gap-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
                Build your plan <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
              <Link href="/book" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-7 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: 'rgba(242,240,235,0.3)', color: '#F2F0EB' }}>
                Book a free call
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
