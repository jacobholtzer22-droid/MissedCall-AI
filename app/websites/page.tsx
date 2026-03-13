import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ExternalLink, Code, Smartphone, Palette } from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import WebsiteQuoteForm from '@/app/components/WebsiteQuoteForm'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'

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
    title: 'Jack of All Blades Landscaping',
    category: 'Landscaping',
    description:
      'A modern, professional website built for a full-service landscaping company in the Grand Rapids, MI area. Features include online quote request booking, mobile-responsive design, service showcase, and AI-powered missed call recovery to ensure no lead goes unanswered.',
    image1: '/images/portfolio/jack-of-all-blades-1.png',
    image2: '/images/portfolio/jack-of-all-blades-2.png',
    url: 'https://jackofallbladeslandscaping.com',
    features: ['Custom Website Design', 'MissedCall AI Integration', 'SEO Optimization', 'Online Quote Booking'],
  },
  {
    title: 'Aesthetic Gardener',
    category: 'Landscaping',
    description:
      'High-converting marketing site for a premium landscaping company in Holland, MI. Focused on showcasing real project photos, building trust with social proof, and driving quote requests from homeowners across West Michigan.',
    image1: '/images/portfolio/aesthetic-gardener-2.png',
    image2: '/images/portfolio/aesthetic-gardener-1.png',
    url: 'https://www.aestheticgardener.net/',
    features: ['Custom Website Design', 'Service Showcases & Gallery', 'SEO Optimization', 'Conversion-Focused Copy'],
  },
  {
    title: 'Learning Logs',
    category: 'SaaS Application',
    description:
      'Educational platform that helps users turn passive content into durable memory. Full authentication system with user accounts.',
    image1: '/images/portfolio/learning-logs-1.png',
    image2: '/images/portfolio/learning-logs-2.png',
    url: 'https://learning-log-app.vercel.app/',
    features: ['User Authentication', 'Dashboard', 'Progress Tracking', 'Responsive Design'],
    imagesSeparate: true,
    imageCompact: true,
  },
  {
    title: 'Apex Detail Studio',
    category: 'Business Website',
    description:
      'Premium auto detailing website for a car detailing company. Features service packages, gallery, testimonials, and booking integration.',
    image1: '/images/portfolio/detailing-1.png',
    image2: '/images/portfolio/detailing-2.png',
    url: 'https://detailing-site-seven.vercel.app/',
    features: ['Service Packages', 'Image Gallery', 'Testimonials', 'Contact Forms'],
  },
  {
    title: 'Breeze Tees',
    category: 'E-Commerce',
    description:
      'Modern t-shirt brand with a clean, stylish design. Built for showcasing products and driving conversions.',
    image1: '/images/portfolio/breeze-tees-1.png',
    image2: '/images/portfolio/breeze-tees-2.png',
    url: null,
    features: ['Product Showcase', 'Modern Design', 'Mobile Optimized', 'Brand Identity'],
  },
]

export default function WebsitesPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 gradient-mesh"></div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-[10%] w-3 h-3 bg-purple-400/30 rounded-full animate-float"></div>
          <div className="absolute top-[50%] right-[5%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '3s' }}></div>
          <div className="absolute bottom-[25%] left-[20%] w-4 h-4 bg-purple-400/20 rounded-full animate-float" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="inline-block bg-purple-500/20 text-purple-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-purple-500/30">
            🌐 No templates. No page builders. Just real code.
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Websites That Actually <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Convert</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
            Your website shouldn&apos;t just exist — it should work for you. Custom code, mobile-first, blazing fast. The kind of site that makes visitors think &ldquo;okay, these people are legit.&rdquo;
          </p>
          <Link href="/book" className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition inline-flex items-center">
            Start Your Project <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'Custom Code, Not Templates',
            'Mobile-First Design',
            'Blazing Fast Load Times',
            'SEO Built In',
            'Launched in Days, Not Months',
            'Looks Great on Every Device',
          ]}
          separator="✦"
          speed="normal"
          className="text-purple-400/60 text-sm font-medium tracking-wide uppercase"
        />
      </div>

      {/* Portfolio */}
      <section id="portfolio" className="py-20 relative">
        {/* Sparkle decorations */}
        <div className="absolute inset-0 pointer-events-none sparkle-container">
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
        </div>

        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                The Work Speaks for Itself
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Real projects. Real businesses. Real results.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-20 max-w-4xl mx-auto">
            {projects.map((project, index) => (
              <ScrollReveal key={project.title} delay={index * 100}>
                <div className="space-y-10">
                  <div className="text-center">
                    <span className="text-blue-400 font-medium">{project.category}</span>
                    <h3 className="text-3xl font-bold mt-2 mb-4">{project.title}</h3>
                    <p className="text-gray-400 mb-6">{project.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-6 justify-center">
                      {project.features.map((feature) => (
                        <span key={feature} className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm border border-white/10">
                          {feature}
                        </span>
                      ))}
                    </div>

                    {project.url ? (
                      <a 
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-400 font-semibold hover:text-blue-300 transition"
                      >
                        View Live Site <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center text-gray-500 font-semibold cursor-not-allowed">
                        View Live Site <ExternalLink className="ml-2 h-4 w-4" />
                      </span>
                    )}
                  </div>

                  <div className={project.imageCompact ? 'max-w-lg mx-auto' : 'max-w-5xl mx-auto'}>
                    {project.imagesSeparate ? (
                      <div className="relative">
                        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-xl border border-white/10">
                          <Image 
                            src={project.image2} 
                            alt={`${project.title} detail`}
                            width={project.imageCompact ? 480 : 1200}
                            height={project.imageCompact ? 300 : 750}
                            className="w-full h-auto"
                          />
                        </div>
                        <div className="absolute -top-6 -right-6 w-2/3 bg-gray-900 rounded-2xl overflow-hidden shadow-xl border-4 border-gray-800">
                          <Image 
                            src={project.image1} 
                            alt={project.title}
                            width={project.imageCompact ? 240 : 600}
                            height={project.imageCompact ? 150 : 360}
                            className="w-full h-auto"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-xl border border-white/10">
                          <Image 
                            src={project.image1} 
                            alt={project.title}
                            width={1200}
                            height={750}
                            className="w-full h-auto"
                          />
                        </div>
                        {project.image1 !== project.image2 && (
                          <div className="absolute -bottom-6 -right-6 w-2/3 bg-gray-900 rounded-2xl overflow-hidden shadow-xl border-4 border-gray-800">
                            <Image 
                              src={project.image2} 
                              alt={`${project.title} detail`}
                              width={600}
                              height={360}
                              className="w-full h-auto"
                            />
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

      {/* Why Work With Us */}
      <section className="py-20 border-y border-white/10 bg-gray-900/50 grid-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Why Work With Us</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Here&apos;s what makes working with Align and Acquire different.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="scroll-reveal text-center card-hover p-6 rounded-xl">
                <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 card-icon">
                  <Code className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Custom Code</h3>
                <p className="text-gray-400">No WordPress. No Wix. No Squarespace. Real code that loads fast and actually ranks on Google.</p>
              </div>
              <div className="scroll-reveal text-center card-hover p-6 rounded-xl">
                <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 card-icon">
                  <Smartphone className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Mobile First</h3>
                <p className="text-gray-400">70% of your visitors are on their phone. Your site better look damn good on it.</p>
              </div>
              <div className="scroll-reveal text-center card-hover p-6 rounded-xl">
                <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 card-icon">
                  <Palette className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Your Vision</h3>
                <p className="text-gray-400">We build what you need, not what a template allows. Your business, your site, your rules.</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact" className="py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-2xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 md:p-12">
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-bold text-white mb-4">Let&apos;s Build Something 🚀</h2>
                  <p className="text-blue-100 text-lg">Tell me about your business. I&apos;ll tell you exactly what I&apos;d build and what it costs. No surprises.</p>
                </div>
                <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                  <WebsiteQuoteForm />
                  <p className="text-center text-sm text-gray-400 mt-4">I&apos;ll get back to you within 24 hours. Usually way faster.</p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <Logo size="xs" />
              <span className="font-bold">Align and Acquire</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 md:mb-0">
              <Link href="/" className="text-gray-500 hover:text-white transition">Home</Link>
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-500 hover:text-white transition">Websites</Link>
              <Link href="/privacy" className="text-gray-500 hover:text-white transition">Privacy Policy</Link>
              <Link href="/terms" className="text-gray-500 hover:text-white transition">Terms & Conditions</Link>
            </div>
            <div className="text-center md:text-right">
              <p className="text-gray-500">&copy; {new Date().getFullYear()} Align and Acquire</p>
              <p className="text-gray-600 text-sm mt-1">Made with caffeine and code in Michigan ☕</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
