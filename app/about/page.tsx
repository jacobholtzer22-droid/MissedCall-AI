import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Quote, Wind, Leaf, Car, Droplets, Wrench } from 'lucide-react'
import ScrollReveal from '@/app/components/ScrollReveal'
import BrandFooter from '@/app/components/BrandFooter'

// ─────────────────────────────────────────────────────────
// Testimonial placeholder — swap in real ones tomorrow
// ─────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Testimonial coming soon.',
    name: 'Client Name',
    business: 'Business · Trade',
    placeholder: true,
  },
  {
    quote: 'Testimonial coming soon.',
    name: 'Client Name',
    business: 'Business · Trade',
    placeholder: true,
  },
  {
    quote: 'Testimonial coming soon.',
    name: 'Client Name',
    business: 'Business · Trade',
    placeholder: true,
  },
]

// ─────────────────────────────────────────────────────────
// Eyebrow
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
// PAGE
// ─────────────────────────────────────────────────────────
export default function AboutPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10">
          <div className="max-w-3xl">
            <Eyebrow label="About Align and Acquire" />
            <h1 className="text-[clamp(2.6rem,7vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
              Built for trades.<br />
              <span style={{ color: '#EE6B1A' }}>Focused on results.</span>
            </h1>
            <p className="text-[17px] leading-relaxed" style={{ color: 'rgba(242,240,235,0.7)' }}>
              We don't work with everyone. We work with trade businesses — HVAC, landscaping, plumbing, detailing — and we do it at a level that a generalist agency never could.
            </p>
          </div>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── About the company ────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-16 items-start">

            {/* Left — trade icons + a stat */}
            <ScrollReveal>
              <div className="border-2 p-8" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] mb-6" style={{ color: '#6E7681' }}>
                  Trades we serve
                </div>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Wind,     label: 'HVAC' },
                    { icon: Leaf,     label: 'Landscaping' },
                    { icon: Droplets, label: 'Plumbing' },
                    { icon: Car,      label: 'Car Detailing' },
                    { icon: Wrench,   label: 'General Contracting' },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-3 border-2 px-4 py-3" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
                      <t.icon size={16} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                      <span className="text-[13px] font-semibold">{t.label}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t-2 pt-6" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
                  <div className="text-[11px] font-mono uppercase tracking-[0.2em] mb-1" style={{ color: '#6E7681' }}>Our promise</div>
                  <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.72)' }}>
                    No account managers. No outsourced support. When you work with Align and Acquire, you have direct access to the team that runs your system.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* Right — company copy */}
            <ScrollReveal>
              <Eyebrow label="Who we are" />
              <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-black uppercase leading-[0.95] tracking-tight mb-6">
                One system. One team.<br />
                <span style={{ color: '#1A4A70' }}>Built for your industry.</span>
              </h2>

              <div className="space-y-5 text-[15px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.75)' }}>
                <p>
                  Align and Acquire is a growth operations company built specifically for trade businesses. We build and manage the systems that capture leads, convert website visitors, run Google Ads, and re-engage past customers — so you can stay focused on the work that actually pays.
                </p>
                <p>
                  We're not a large agency, and we don't want to be. The businesses we work with get direct access to the people building and managing their system, same-day responses when something needs attention, and a team that understands the trade industry because that's all we work in.
                </p>
                <p>
                  Everything we build is designed to work together. MissedCall AI, the website, the ads, the outreach campaigns — they're not separate tools from separate vendors. They're one system, built by one team, with one goal: helping your business grow consistently, not in bursts.
                </p>
                <p>
                  We keep our client roster focused. That's a deliberate choice. It means everyone we work with gets real attention — not a ticket number, not a monthly report generated by software, not a call with someone who just picked up your file that morning. When you have a question about your system, you're talking to the person who built it.
                </p>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/services" className="aa-btn inline-flex items-center gap-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                  How the system works <ArrowRight size={15} strokeWidth={2.5} />
                </Link>
                <Link href="/pricing" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-5 py-3.5 text-[14px] font-bold uppercase tracking-wide" style={{ borderColor: '#16181C', color: '#16181C' }}>
                  See pricing
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12">
              <Eyebrow label="What clients say" />
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                Results speak<br />
                <span style={{ color: '#EE6B1A' }}>louder than claims.</span>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <ScrollReveal key={i}>
                <div
                  className="border-2 p-7 flex flex-col h-full"
                  style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}
                >
                  <Quote size={24} strokeWidth={1.5} className="mb-5 shrink-0" style={{ color: '#EE6B1A' }} />
                  <p
                    className="text-[15px] leading-relaxed flex-1 mb-6"
                    style={{ color: t.placeholder ? '#6E7681' : 'rgba(242,240,235,0.88)', fontStyle: t.placeholder ? 'italic' : 'normal' }}
                  >
                    {t.placeholder ? '— Testimonial coming soon —' : `"${t.quote}"`}
                  </p>
                  <div className="border-t-2 pt-5" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
                    <div className="font-bold text-[14px]" style={{ color: t.placeholder ? '#6E7681' : '#F2F0EB' }}>{t.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest mt-1" style={{ color: '#6E7681' }}>{t.business}</div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founder ──────────────────────────────────────── */}
      <section style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-14 text-center">
              <Eyebrow label="The founder" />
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                When you call,<br />
                <span style={{ color: '#1A4A70' }}>you reach the person</span><br />
                who built your system.
              </h2>
            </div>
          </ScrollReveal>

          {/* Photos */}
          <ScrollReveal>
            <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto mb-14">
              {/* Photo 1 */}
              <div className="relative border-2 overflow-hidden aspect-[3/4]" style={{ borderColor: '#16181C' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/jacob-1.jpg"
                  alt="Jacob Holtzer — Founder, Align and Acquire"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                    const parent = el.parentElement
                    if (parent) {
                      const placeholder = document.createElement('div')
                      placeholder.className = 'w-full h-full flex items-center justify-center'
                      placeholder.style.background = 'rgba(110,118,129,0.15)'
                      placeholder.innerHTML = '<span style="color:#6E7681;font-size:12px;font-family:monospace;text-transform:uppercase;letter-spacing:0.2em">Photo coming soon</span>'
                      parent.appendChild(placeholder)
                    }
                  }}
                />
              </div>
              {/* Photo 2 */}
              <div className="relative border-2 overflow-hidden aspect-[3/4]" style={{ borderColor: '#16181C' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/jacob-2.jpg"
                  alt="Jacob Holtzer — Founder, Align and Acquire"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                    const parent = el.parentElement
                    if (parent) {
                      const placeholder = document.createElement('div')
                      placeholder.className = 'w-full h-full flex items-center justify-center'
                      placeholder.style.background = 'rgba(110,118,129,0.15)'
                      placeholder.innerHTML = '<span style="color:#6E7681;font-size:12px;font-family:monospace;text-transform:uppercase;letter-spacing:0.2em">Photo coming soon</span>'
                      parent.appendChild(placeholder)
                    }
                  }}
                />
              </div>
            </div>
          </ScrollReveal>

          {/* Founder bio + quotes */}
          <ScrollReveal>
            <div className="max-w-3xl mx-auto">
              {/* Pull quote */}
              <div className="border-l-4 pl-7 mb-10" style={{ borderColor: '#EE6B1A' }}>
                <p className="text-[20px] sm:text-[24px] font-black uppercase leading-[1.1] tracking-tight" style={{ color: '#16181C' }}>
                  "You're getting on the phone directly with the founder who knows the ins and outs of the entire system he created himself."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center font-black text-[16px]" style={{ background: '#1A4A70', color: '#FFFFFF' }}>J</div>
                  <div>
                    <div className="font-bold text-[14px]">Jacob Holtzer</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#6E7681' }}>Founder, Align and Acquire</div>
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-5 text-[15px] leading-relaxed" style={{ color: 'rgba(22,24,28,0.75)' }}>
                <p>
                  Jacob founded Align and Acquire with a straightforward conviction: trade businesses are underserved by the technology and marketing industry, and most of the tools being sold to them were built by people who have never run a service route in their life.
                </p>
                <p>
                  Every system at Align and Acquire — the AI text-back, the website infrastructure, the ad management workflows, the campaign tools — was designed, built, and is actively managed by Jacob. There is no layer of contractors, no offshore support team, no account manager standing between you and answers.
                </p>
                <p>
                  When you call, Jacob picks up. When something needs to change, it changes the same day. When you're scaling and want to add a service, you talk to the person who will actually build it. That's not a promise made on a website — it's just how the operation works.
                </p>
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#16181C', color: '#F2F0EB' }}>
                  Book a call with Jacob <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
                <Link href="/pricing" className="aa-btn-ghost inline-flex items-center gap-2 border-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ borderColor: '#16181C', color: '#16181C' }}>
                  See the system
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section style={{ background: '#1A4A70' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24 text-center">
          <ScrollReveal>
            <h2 className="text-[clamp(2.2rem,6vw,4rem)] font-black uppercase leading-[0.92] tracking-tight mb-5" style={{ color: '#FFFFFF' }}>
              Ready to work with<br />
              <span style={{ color: '#EE6B1A' }}>a team that answers?</span>
            </h2>
            <p className="text-[16px] mb-9 max-w-lg mx-auto" style={{ color: 'rgba(242,240,235,0.65)' }}>
              Book a free call. No pitch deck. No pressure. Just an honest conversation about what your business needs and whether we're the right fit.
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
