'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Upload,
  Mail,
  Send,
  MessageSquare,
  Users,
  BarChart3,
  RefreshCw,
  History,
  Megaphone,
  Check,
} from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'

const steps = [
  {
    title: 'Import your clients',
    description:
      'Upload your existing client list or let new leads flow in automatically from MissedCall AI and your website.',
    icon: Upload,
  },
  {
    title: 'Build your campaign',
    description:
      'Write your message, pick email or SMS (or both), choose who gets it — all clients, new leads only, past customers, or a custom list.',
    icon: Mail,
  },
  {
    title: 'Hit send',
    description:
      'Blast it out to everyone at once. Track opens, clicks, and responses right from your dashboard.',
    icon: Send,
  },
]

const features = [
  {
    title: 'Mass SMS Blasts',
    description: 'Text your whole client list at once with promotions, updates, or reminders.',
    icon: MessageSquare,
  },
  {
    title: 'Mass Email Campaigns',
    description: 'Professional emails to stay top of mind with your customers.',
    icon: Mail,
  },
  {
    title: 'Client Segmentation',
    description: 'Send to all clients, just new leads, just past customers, or build custom lists.',
    icon: Users,
  },
  {
    title: 'Campaign Analytics',
    description: 'See who opened, who clicked, who replied — all from your dashboard.',
    icon: BarChart3,
  },
  {
    title: 'Automated Follow-ups',
    description: 'Set up drip sequences that go out automatically after someone becomes a lead.',
    icon: RefreshCw,
  },
  {
    title: 'Client History',
    description: 'See every message, every interaction, every job tied to each client.',
    icon: History,
  },
]

const useCases = [
  'Remind past customers about seasonal services',
  'Send a promo to everyone on your list',
  'Follow up with leads who never booked',
  'Announce new services to your whole base',
]

export default function CampaignsPage() {
  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
  }
  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white page-fade-in">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh"></div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-[10%] w-3 h-3 bg-amber-400/30 rounded-full animate-float"></div>
          <div className="absolute top-[50%] right-[5%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '3s' }}></div>
          <div className="absolute bottom-[25%] left-[20%] w-4 h-4 bg-purple-400/20 rounded-full animate-float" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="inline-block bg-amber-500/20 text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-amber-500/30">
            📣 Mass email & SMS — one click, everyone gets it
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            One Message. Every Customer.{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Instant Impact.
            </span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-3xl mx-auto">
            Send mass email and SMS campaigns to your entire client list — past customers, new leads, everyone. Built right into your Align and Acquire dashboard.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={scrollToDemo}
              className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition inline-flex items-center justify-center"
            >
              See it in action
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
            <button
              onClick={scrollToPricing}
              className="cta-hover bg-amber-500/20 text-amber-400 border border-amber-500/40 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-amber-500/30 transition inline-flex items-center justify-center"
            >
              Add campaigns to my plan
            </button>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'Mass SMS',
            'Mass Email',
            'Segment Your List',
            'Track Opens & Clicks',
            'Drip Campaigns',
            'All in One Dashboard',
          ]}
          separator="✦"
          speed="normal"
          className="text-amber-400/60 text-sm font-medium tracking-wide uppercase"
        />
      </div>

      {/* How it works */}
      <section className="py-20 border-b border-white/10 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works 🔧</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Three steps from list to blast.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {steps.map((step, i) => {
                const Icon = step.icon
                return (
                  <div
                    key={step.title}
                    className="scroll-reveal text-center card-hover p-6 rounded-xl bg-gray-900/50 border border-white/10"
                  >
                    <div className="bg-amber-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 card-icon">
                      <Icon className="h-8 w-8 text-amber-400" />
                    </div>
                    <span className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider">
                      Step {i + 1}
                    </span>
                    <h3 className="text-xl font-semibold mt-2 mb-3">{step.title}</h3>
                    <p className="text-gray-400 text-sm">{step.description}</p>
                  </div>
                )
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* What you can do — feature grid */}
      <section className="py-20 relative">
        <div className="absolute inset-0 pointer-events-none sparkle-container">
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">What You Can Do ✨</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Everything you need to reach your whole list — and know what works.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="scroll-reveal bg-gray-900 border border-white/10 p-6 rounded-xl card-hover"
                  >
                    <div className="bg-amber-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4 card-icon">
                      <Icon className="h-6 w-6 text-amber-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-gray-400 text-sm">{f.description}</p>
                  </div>
                )
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Screenshot / mockup section */}
      <section id="demo" className="py-20 border-y border-white/10 bg-gray-900/50 grid-pattern">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Device mockup */}
                <div className="relative flex justify-center">
                  <div className="relative w-full max-w-sm">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-[2.5rem] blur-2xl"></div>
                    <div className="relative bg-gray-800 border-4 border-gray-700 rounded-[2.5rem] p-3 shadow-2xl">
                      <div className="bg-gray-900 rounded-[1.5rem] overflow-hidden aspect-[4/3] flex items-center justify-center border border-white/10">
                        <div className="text-center p-6">
                          <Megaphone className="h-16 w-16 text-amber-400/50 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm">Campaign builder & analytics</p>
                          <p className="text-gray-600 text-xs mt-1">Dashboard screenshot placeholder</p>
                        </div>
                      </div>
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-700 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-6">All in One Place 📊</h2>
                  <ul className="space-y-4">
                    {[
                      'Create campaigns in minutes — no separate tools',
                      'Pick your audience: everyone, new leads, past customers, or custom',
                      'Send email, SMS, or both in one campaign',
                      'See opens, clicks, and replies without leaving the dashboard',
                    ].map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-gray-300">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Who is this for */}
      <section className="py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                You Already Have Customers. They Already Trust You.
              </h2>
              <p className="text-xl text-amber-400/90 font-medium">
                This is the easiest money you&apos;ll ever make.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {useCases.map((useCase) => (
                <div
                  key={useCase}
                  className="scroll-reveal flex items-center gap-3 bg-gray-900 border border-white/10 rounded-xl p-4 card-hover"
                >
                  <span className="text-amber-400 text-lg">→</span>
                  <span className="text-gray-300">{useCase}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-t border-white/10">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-4">Campaigns Pricing 💰</h2>
                <p className="text-gray-400">Simple add-on pricing. No surprises.</p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 to-orange-600/20 rounded-3xl blur-2xl"></div>
                <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <p className="text-sm text-gray-500">One-time setup</p>
                      <p className="text-3xl font-bold text-amber-400">$100</p>
                      <p className="text-gray-400 text-sm">Client list import, campaign template setup, configuration</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Monthly</p>
                      <p className="text-3xl font-bold">$75<span className="text-gray-400 text-lg font-normal">/mo</span></p>
                      <p className="text-gray-400 text-sm">Unlimited campaigns</p>
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-6 space-y-3 text-sm text-gray-400">
                    <p>
                      <span className="text-white font-medium">Requires the CRM dashboard.</span> Available as an add-on to any package or as a standalone service. If you&apos;re on <span className="text-amber-400/90">Growth</span> or a standalone service, you&apos;ll need both CRM ($75/mo) and Campaigns ($75/mo). If you&apos;re on <span className="text-amber-400/90">Pro</span> or <span className="text-amber-400/90">All In</span>, you already have the CRM — just add Campaigns ($75/mo).
                    </p>
                  </div>
                  <div className="mt-8">
                    <Link
                      href="/book"
                      className="cta-hover w-full sm:w-auto inline-flex justify-center items-center bg-amber-500 text-gray-900 px-8 py-4 rounded-xl font-semibold hover:bg-amber-400 transition"
                    >
                      Add Campaigns to My Plan
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl p-8 sm:p-12 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Reach Everyone?</h2>
                <p className="text-amber-100 text-lg mb-8 max-w-2xl mx-auto">
                  Add Campaigns to your plan and start blasting — past customers, new leads, everyone. One click.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/book"
                    className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition inline-flex items-center justify-center"
                  >
                    Add Campaigns to My Plan
                  </Link>
                  <Link
                    href="/pricing"
                    className="cta-hover bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition inline-flex items-center justify-center"
                  >
                    View All Pricing
                  </Link>
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
              <Link href="/campaigns" className="text-gray-500 hover:text-white transition">Campaigns</Link>
              <Link href="/pricing" className="text-gray-500 hover:text-white transition">Pricing</Link>
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
