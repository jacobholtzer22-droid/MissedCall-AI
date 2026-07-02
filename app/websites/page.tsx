import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ExternalLink, Code, Smartphone, Palette } from 'lucide-react'
import WebsiteQuoteForm from '@/app/components/WebsiteQuoteForm'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'
import BrandFooter from '@/app/components/BrandFooter'
import JsonLd from '@/app/components/JsonLd'

const DESCRIPTION =
  'Custom-coded, mobile-first websites for landscapers and home service businesses. No templates or page builders. Sites that turn visitors into quote requests.'

export const metadata: Metadata = {
  title: 'Website Design for Landscapers & Home Service Businesses',
  description: DESCRIPTION,
  alternates: { canonical: './' },
}

const SERVICE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Custom Website Design',
  serviceType: 'Website design',
  description: DESCRIPTION,
  provider: { '@id': 'https://www.alignandacquire.com/#business' },
}

type Project = {
  title: string
  category: string
  description: string
  image1: string
  image2: string
  url: string | null
  features: string[]
  imagesSeparate?: boolean
  imageCompact?: boolean
}

const projects: Project[] = [
  {
    title: 'Rodas Premier Landscaping',
    category: 'Landscaping & Snow Removal',
    description: 'A polished, photo-forward website for a premier lawn care, landscaping, and snow removal crew serving Grand Rapids and West Michigan year-round. Built to showcase real property work and turn visitors into free-quote requests.',
    image1: '/images/portfolio/rodas-premier-1.png',
    image2: '/images/portfolio/rodas-premier-2.png',
    url: 'https://www.rodaspremierlandscaping.com/',
    features: ['Custom Website Design', 'MissedCall AI Integration', 'SEO Optimization', 'Free Quote Requests'],
  },
  {
    title: 'Bernal Landscape',
    category: 'Landscape Design & Hardscaping',
    description: 'A bold, image-driven website for a family-owned landscape design, hardscaping, and property care company serving Grand Rapids and West Michigan for over a decade. Highlights paver patios and real project photos with strong calls to action.',
    image1: '/images/portfolio/bernal-landscape-1.png',
    image2: '/images/portfolio/bernal-landscape-2.png',
    url: 'https://www.bernallandscape.com/',
    features: ['Custom Website Design', 'Service Showcases & Gallery', 'SEO Optimization', 'Online Quote Requests'],
  },
  {
    title: 'Fresh Cut Lawns',
    category: 'Lawn Care',
    description: 'A clean, high-converting website for a locally owned lawn care company keeping Elkhart, Granger, and South Bend yards sharp all season long. Focused on real results photos and easy free-estimate requests.',
    image1: '/images/portfolio/fresh-cut-lawns-1.png',
    image2: '/images/portfolio/fresh-cut-lawns-2.png',
    url: 'https://www.freshcutlawnsllc.com/',
    features: ['Custom Website Design', 'MissedCall AI Integration', 'SEO Optimization', 'Free Estimate Requests'],
  },
  {
    title: 'Fraaza Enterprises',
    category: 'Hydroseeding & Landscaping',
    description: "A bold, photo-driven website for West Michigan's hydroseeding experts, owner-operated since 2004. Showcases hydroseeding, landscaping, soil prep, and retaining wall work with a filterable project gallery and clear calls to action.",
    image1: '/images/portfolio/fraaza-1.png',
    image2: '/images/portfolio/fraaza-2.png',
    url: 'https://www.fraazaenterprises.com/',
    features: ['Custom Website Design', 'Filterable Project Gallery', 'SEO Optimization', 'Free Quote Requests'],
  },
  {
    title: 'Jack of All Blades Landscaping',
    category: 'Landscaping',
    description: 'A modern, professional website built for a full-service landscaping company in the Grand Rapids, MI area. Features online quote request booking, mobile-responsive design, and AI-powered missed call recovery.',
    image1: '/images/portfolio/jack-of-all-blades-1.png',
    image2: '/images/portfolio/jack-of-all-blades-2.png',
    url: 'https://jackofallbladeslandscaping.com',
    features: ['Custom Website Design', 'MissedCall AI Integration', 'SEO Optimization', 'Online Quote Booking'],
  },
  {
    title: 'Apex Detail Studio',
    category: 'Business Website',
    description: 'Premium auto detailing website. Features service packages, gallery, testimonials, and booking integration.',
    image1: '/images/portfolio/detailing-1.png',
    image2: '/images/portfolio/detailing-2.png',
    url: 'https://detailing-site-seven.vercel.app/',
    features: ['Service Packages', 'Image Gallery', 'Testimonials', 'Contact Forms'],
  },
  {
    title: 'Aesthetic Gardener',
    category: 'Landscaping',
    description: 'High-converting marketing site for a premium landscaping company in Holland, MI. Focused on showcasing real project photos and driving quote requests from homeowners across West Michigan.',
    image1: '/images/portfolio/aesthetic-gardener-2.png',
    image2: '/images/portfolio/aesthetic-gardener-1.png',
    url: 'https://www.aestheticgardener.net/',
    features: ['Custom Website Design', 'Service Showcases & Gallery', 'SEO Optimization', 'Conversion-Focused Copy'],
  },
  {
    title: 'Learning Logs',
    category: 'SaaS Application',
    description: 'Educational platform that helps users turn passive content into durable memory. Full authentication system with user accounts and progress tracking.',
    image1: '/images/portfolio/learning-logs-1.png',
    image2: '/images/portfolio/learning-logs-2.png',
    url: 'https://learning-log-app.vercel.app/',
    features: ['User Authentication', 'Dashboard', 'Progress Tracking', 'Responsive Design'],
    imagesSeparate: true,
    imageCompact: true,
  },
]

const whyUs = [
  { icon: Code, title: 'Custom Code', body: 'No WordPress. No Wix. No Squarespace. Real code that loads fast and actually ranks on Google.' },
  { icon: Smartphone, title: 'Mobile First', body: '70% of your visitors are on their phone. Your site better look damn good on it.' },
  { icon: Palette, title: 'Your Vision', body: "We build what you need, not what a template allows. Your business, your site, your rules." },
]

export default function WebsitesPage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden" style={{ background: '#16181C', color: '#F2F0EB' }}>
      <JsonLd data={SERVICE_SCHEMA} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="aa-grid-bg pt-28 sm:pt-36 pb-16">
        <div className="aa-hazard" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 pt-10 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
            <span style={{ color: '#EE6B1A' }}>No templates. No page builders. Real code.</span>
          </div>
          <h1 className="text-[clamp(2.6rem,8vw,5rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] mb-6">
            Websites that<br />
            actually <span style={{ color: '#EE6B1A' }}>convert.</span>
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-relaxed max-w-3xl mx-auto mb-8" style={{ color: 'rgba(242,240,235,0.65)' }}>
            Your website should work for you, not just exist. Custom code, mobile-first, blazing fast. The kind of site that makes visitors think &ldquo;okay, these people are legit.&rdquo;
          </p>
          <Link href="/book" className="aa-btn inline-flex items-center gap-2 px-6 py-4 text-[15px] font-bold uppercase tracking-wide" style={{ background: '#EE6B1A', color: '#16181C' }}>
            Start your project <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
        </div>
        <div className="aa-hazard mt-16 opacity-50" />
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <div className="border-y-2 py-4 overflow-hidden" style={{ borderColor: 'rgba(110,118,129,0.3)', background: 'rgba(242,240,235,0.03)' }}>
        <Marquee
          items={['Custom Code Not Templates', 'Mobile-First Design', 'Blazing Fast Load Times', 'SEO Built In', 'Launched in Days Not Months', 'Looks Great on Every Device']}
          separator="⚡"
          speed="normal"
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
        />
      </div>

      {/* ── Portfolio ────────────────────────────────────── */}
      <section id="portfolio" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-14">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Portfolio</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                The work speaks<br /><span style={{ color: '#1A4A70' }}>for itself.</span>
              </h2>
            </div>
          </ScrollReveal>

          <div className="space-y-20">
            {projects.map((project, index) => (
              <ScrollReveal key={project.title}>
                <div>
                  <div className="border-l-4 pl-6 mb-8" style={{ borderColor: '#EE6B1A' }}>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: '#EE6B1A' }}>{project.category}</span>
                    <h3 className="text-[26px] font-extrabold tracking-tight mt-1 mb-3">{project.title}</h3>
                    <p className="text-[14.5px] leading-relaxed mb-4" style={{ color: 'rgba(22,24,28,0.68)' }}>{project.description}</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {project.features.map((f) => (
                        <span key={f} className="border-2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: '#16181C', color: '#16181C' }}>{f}</span>
                      ))}
                    </div>
                    {project.url ? (
                      <a href={project.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 border-2 px-6 py-3.5 text-[15px] font-bold uppercase tracking-wide transition-colors hover:opacity-90" style={{ background: '#1A4A70', borderColor: '#1A4A70', color: '#F2F0EB' }}>
                        View live site <ExternalLink size={18} strokeWidth={2.5} />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2.5 border-2 px-6 py-3.5 text-[15px] font-bold uppercase tracking-wide cursor-not-allowed" style={{ borderColor: '#6E7681', color: '#6E7681' }}>
                        View live site <ExternalLink size={18} strokeWidth={2.5} />
                      </span>
                    )}
                  </div>

                  <div className={project.imageCompact ? 'max-w-lg mx-auto' : 'max-w-4xl'}>
                    {project.imagesSeparate ? (
                      <div className="relative">
                        <div className="border-2 overflow-hidden" style={{ borderColor: '#16181C' }}>
                          <Image src={project.image2} alt={`${project.title} detail`} width={project.imageCompact ? 480 : 1200} height={project.imageCompact ? 300 : 750} className="w-full h-auto" />
                        </div>
                        <div className="absolute -top-6 -right-6 w-2/3 border-4 overflow-hidden" style={{ borderColor: '#16181C' }}>
                          <Image src={project.image1} alt={project.title} width={project.imageCompact ? 240 : 600} height={project.imageCompact ? 150 : 360} className="w-full h-auto" />
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="border-2 overflow-hidden" style={{ borderColor: '#16181C' }}>
                          <Image src={project.image1} alt={project.title} width={1200} height={750} className="w-full h-auto" />
                        </div>
                        {project.image1 !== project.image2 && (
                          <div className="absolute -bottom-6 -right-6 w-2/3 border-4 overflow-hidden" style={{ borderColor: '#F2F0EB', outline: '2px solid #16181C' }}>
                            <Image src={project.image2} alt={`${project.title} detail`} width={600} height={360} className="w-full h-auto" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Us ───────────────────────────────────────── */}
      <section className="aa-grid-bg">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Why us</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-black uppercase leading-[0.95] tracking-tight">
                What makes us<br /><span style={{ color: '#EE6B1A' }}>different.</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-px sm:grid-cols-3" style={{ background: 'rgba(110,118,129,0.2)' }}>
            {whyUs.map((item, i) => (
              <ScrollReveal key={i}>
                <div className="aa-feature-card h-full p-7" style={{ background: '#16181C' }}>
                  <div className="grid h-12 w-12 place-items-center mb-5" style={{ background: '#1A4A70' }}>
                    <item.icon size={22} strokeWidth={2.25} style={{ color: '#EE6B1A' }} />
                  </div>
                  <h3 className="text-[19px] font-extrabold tracking-tight mb-2" style={{ color: '#F2F0EB' }}>{item.title}</h3>
                  <p className="text-[14px] leading-relaxed" style={{ color: '#6E7681' }}>{item.body}</p>
                  <span className="aa-feature-bar" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact / Quote Form ─────────────────────────── */}
      <section id="contact" style={{ background: '#F2F0EB', color: '#16181C' }}>
        <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
          <ScrollReveal>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-4">
                <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
                <span style={{ color: '#EE6B1A' }}>Start a project</span>
              </div>
              <h2 className="text-[clamp(2rem,5vw,3rem)] font-black uppercase leading-[0.95] tracking-tight mb-3">
                Let&apos;s build something.
              </h2>
              <p className="text-[15px]" style={{ color: 'rgba(22,24,28,0.65)' }}>
                Tell me about your business. I&apos;ll tell you exactly what I&apos;d build and what it costs. I&apos;ll get back to you within 24 hours. Usually way faster.
              </p>
            </div>
            <div className="border-2 p-7 sm:p-9" style={{ borderColor: '#16181C', background: '#FFFFFF' }}>
              <WebsiteQuoteForm />
            </div>
          </ScrollReveal>
        </div>
      </section>

      <BrandFooter />
    </div>
  )
}
