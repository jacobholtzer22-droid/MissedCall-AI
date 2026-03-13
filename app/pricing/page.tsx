import Link from 'next/link'
import { Logo } from '../components/Logo'
import ScrollReveal from '../components/ScrollReveal'
import Marquee from '../components/Marquee'
import ROICalculator from '../components/roi-calculator'
import {
  Check,
  X,
  ArrowRight,
  Globe,
  MessageSquare,
  Megaphone,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Search,
  Star,
} from 'lucide-react'

const packages = [
  {
    name: 'Growth',
    subtitle: 'Website + Ads Management',
    setupFee: 400,
    price: 175,
    featured: false,
    saveBadge: null as string | null,
    cta: 'Start growing',
    features: [
      { name: 'Custom website (built in 3 days)', included: true },
      { name: 'Unlimited website changes', included: true },
      { name: 'Google Ads setup & management', included: true },
      { name: 'Monthly ad performance reports', included: true },
      { name: 'MissedCall AI (24/7 lead recovery)', included: false },
      { name: 'CRM dashboard + analytics', included: false },
      { name: 'Calendar integration', included: false },
    ],
  },
  {
    name: 'All In',
    subtitle: 'Website + MissedCall AI + Ads + CRM',
    setupFee: 500,
    price: 360,
    featured: true,
    saveBadge: 'Save $65/mo',
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
    ],
  },
  {
    name: 'Pro',
    subtitle: 'Website + MissedCall AI + CRM',
    setupFee: 400,
    price: 265,
    featured: false,
    saveBadge: null as string | null,
    cta: "Let's go Pro",
    features: [
      { name: 'Custom website (built in 3 days)', included: true },
      { name: 'Unlimited website changes', included: true },
      { name: 'MissedCall AI (24/7 lead recovery)', included: true },
      { name: 'CRM dashboard + analytics', included: true },
      { name: 'Mass email & SMS campaigns', included: true },
      { name: 'Google Ads management', included: false },
      { name: 'Calendar integration', included: false },
    ],
  },
]

const standaloneServices = [
  {
    name: 'Custom Website',
    price: 75,
    setupFee: 200,
    icon: Globe,
    description: 'Professional website built from scratch. Hosting, security, unlimited changes.',
    color: 'purple',
  },
  {
    name: 'MissedCall AI',
    price: 225,
    setupFee: 250,
    icon: MessageSquare,
    description: 'AI texts back instantly, captures leads, books appointments. 24/7.',
    color: 'blue',
  },
  {
    name: 'Ads Management',
    price: 125,
    setupFee: 250,
    icon: TrendingUp,
    description: 'Google Ads setup, optimization, keyword management, monthly reporting.',
    color: 'orange',
  },
  {
    name: 'Spam Call Screening',
    price: 100,
    setupFee: 150,
    icon: ShieldCheck,
    description: 'Press 1 to connect IVR. Blocks robocalls. Only real customers get through.',
    color: 'green',
  },
]

const addOns = [
  {
    name: 'Calendar + CRM Integration',
    price: '$75/mo',
    description: 'Sync bookings, manage client data, mass email & SMS, full relationship history',
    icon: Calendar,
    link: '/book',
  },
  {
    name: 'Mass Email & SMS Campaigns',
    price: '$100 setup · $75/mo',
    description: 'Send bulk email and text campaigns to your entire client list. Track opens, clicks, and replies from your dashboard. Requires CRM Dashboard.',
    icon: Megaphone,
    link: '/campaigns',
  },
  {
    name: 'Spam Call Screening',
    price: '$100/mo',
    description: 'Block robocalls, only real customers get through',
    icon: ShieldCheck,
    link: '/book',
  },
  {
    name: 'Google Business Profile Setup',
    price: 'One-time fee — ask us',
    description: 'Setup and optimization of your Google Business listing',
    icon: Globe,
    link: '/book',
  },
  {
    name: 'SEO Optimization',
    price: 'Custom pricing — ask us',
    description: 'On-page SEO, keyword targeting, Google Business optimization',
    icon: Search,
    link: '/book',
  },
]

const iconColorMap: Record<string, string> = {
  blue: 'text-blue-400 bg-blue-500/20',
  green: 'text-green-400 bg-green-500/20',
  orange: 'text-orange-400 bg-orange-500/20',
  purple: 'text-purple-400 bg-purple-500/20',
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white page-fade-in">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh"></div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute top-20 right-[20%] w-3 h-3 bg-blue-400/30 rounded-full animate-float"></div>
          <div className="absolute bottom-[30%] left-[10%] w-2 h-2 bg-purple-400/40 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="relative z-10 container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-blue-500/30">
              No contracts. No BS. Cancel anytime.
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Simple pricing. No surprises.
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                No contracts.
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto">
              Every missed call is lost revenue. Every day without a website is a day your competitors win. Stop leaving money on the table.
            </p>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'No Contracts',
            'Cancel Anytime',
            '30-Day Money-Back Guarantee',
            'Setup in Days, Not Months',
            'Real Humans, Real Support',
            'Pays for Itself',
          ]}
          separator="★"
          speed="normal"
          className="text-blue-400/60 text-sm font-semibold tracking-wider uppercase"
        />
      </div>

      {/* Package Cards */}
      <section className="relative z-10 py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">Pick Your Path 🚀</h2>
            <p className="text-gray-400 text-lg">Bundle and save. Pick the one that fits.</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6 lg:gap-5 max-w-6xl mx-auto items-center">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`relative rounded-2xl p-px card-hover ${
                    pkg.featured
                      ? 'bg-gradient-to-b from-blue-500 via-purple-500 to-blue-500 animate-pulse-glow lg:scale-[1.03] z-10'
                      : 'bg-white/10'
                  }`}
                >
                  {pkg.featured && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                      <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-bold px-6 py-2 rounded-full shadow-lg shadow-purple-500/30 whitespace-nowrap inline-flex items-center gap-1.5">
                        <Star className="h-4 w-4 fill-current" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div
                    className={`relative bg-gray-900 rounded-2xl h-full flex flex-col ${
                      pkg.featured ? 'p-8 ring-1 ring-purple-500/50' : 'p-6'
                    }`}
                  >
                    <div className="mb-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {pkg.subtitle}
                      </span>
                      <h3 className={`font-bold mt-1 ${pkg.featured ? 'text-3xl' : 'text-2xl'}`}>
                        {pkg.name}
                      </h3>
                    </div>

                    <div className="mb-1">
                      <span className="text-sm text-gray-500">
                        ${pkg.setupFee} setup fee
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className={`font-bold ${pkg.featured ? 'text-5xl' : 'text-4xl'}`}>
                        ${pkg.price}
                      </span>
                      <span className="text-gray-400">/mo</span>
                    </div>

                    {pkg.saveBadge ? (
                      <div className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-sm font-semibold px-3 py-1.5 rounded-full w-fit mb-6 border border-emerald-500/30">
                        {pkg.saveBadge}
                      </div>
                    ) : (
                      <div className="mb-6" />
                    )}

                    <div className="space-y-3 mb-6 flex-1">
                      {pkg.features.map((feature) => (
                        <div key={feature.name} className="flex items-center gap-3">
                          {feature.included ? (
                            <Check className="h-5 w-5 text-green-400 shrink-0" />
                          ) : (
                            <X className="h-5 w-5 text-gray-700 shrink-0" />
                          )}
                          <span
                            className={
                              feature.included
                                ? 'text-gray-300'
                                : 'text-gray-600 line-through decoration-gray-700'
                            }
                          >
                            {feature.name}
                          </span>
                        </div>
                      ))}
                    </div>
                    {pkg.name === 'All In' && (
                      <p className="text-gray-500 text-sm mb-6 italic">
                        Add mass campaigns for just $75/mo
                      </p>
                    )}

                    <Link
                      href="/book"
                      className={`cta-hover w-full py-3.5 rounded-xl text-center font-semibold transition-all flex items-center justify-center min-h-[44px] ${
                        pkg.featured
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-purple-500/25'
                          : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                      }`}
                    >
                      {pkg.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Standalone Services */}
      <section className="relative z-10 py-16">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Need just one thing? No problem.</h2>
              <p className="text-gray-400 text-lg">No package required. Pick exactly what you need.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {standaloneServices.map((service) => {
                const Icon = service.icon
                const colors = iconColorMap[service.color]
                return (
                  <div
                    key={service.name}
                    className="scroll-reveal bg-gray-900 border border-white/10 rounded-xl p-6 card-hover flex flex-col"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 card-icon ${colors}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-lg leading-tight">{service.name}</h3>
                    </div>
                    <div className="mb-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">${service.price}</span>
                        <span className="text-gray-400 text-sm">/mo</span>
                      </div>
                      <span className="text-xs text-gray-500">${service.setupFee} setup fee</span>
                    </div>
                    <p className="text-gray-400 text-sm flex-1 mb-4">{service.description}</p>
                    <Link
                      href="/book"
                      className="cta-hover bg-white/10 text-white hover:bg-white/20 border border-white/10 py-2.5 rounded-lg font-semibold transition-all text-center text-sm min-h-[44px] flex items-center justify-center"
                    >
                      Let&apos;s Talk
                    </Link>
                  </div>
                )
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Add-ons */}
      <section id="add-ons" className="relative z-10 py-16 border-t border-white/10">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Stack these on top of any package.</h2>
              <p className="text-gray-400 text-lg">Customize your setup with powerful add-ons.</p>
            </div>
          </ScrollReveal>
          <div className="max-w-4xl mx-auto space-y-3">
            {addOns.map((addon, i) => {
              const Icon = addon.icon
              return (
                <ScrollReveal key={addon.name} delay={i * 80}>
                  <div className="bg-gray-900 border border-white/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 card-hover">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0 card-icon">
                        <Icon className="h-5 w-5 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold">{addon.name}</h3>
                        <p className="text-gray-400 text-sm truncate sm:whitespace-normal">{addon.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:shrink-0">
                      <span className="font-bold text-blue-400 whitespace-nowrap">{addon.price}</span>
                      <Link
                        href={addon.link ?? '/book'}
                        className="cta-hover bg-white/10 text-white hover:bg-white/20 border border-white/10 px-4 py-2 rounded-lg font-medium transition-all text-sm whitespace-nowrap min-h-[44px] flex items-center"
                      >
                        Add it
                      </Link>
                    </div>
                  </div>
                </ScrollReveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section id="calculator" className="relative z-10 py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                The Math Speaks for Itself 📊
              </h2>
              <p className="text-gray-400 text-lg">
                See how fast this pays for itself. Adjust the sliders and watch.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-2xl"></div>
              <div className="relative">
                <ROICalculator hideHeading />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Bottom Notes */}
      <section className="relative z-10 py-12 border-t border-white/10">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <p className="text-gray-400">
              <span className="text-white font-semibold">Setup fees</span> vary slightly based on complexity &mdash; exact costs covered on your discovery call.
            </p>
            <p className="text-gray-400">
              All ad spend goes directly to Google and is{' '}
              <span className="text-white font-semibold">separate from these fees</span>.
            </p>
            <p className="text-gray-500 font-medium">
              No contracts &middot; Cancel anytime &middot; 30-day money-back guarantee
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 sm:p-12 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Ready to Stop Leaving Money on the Table?
                </h2>
                <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                  Pick a package or build your own. No contracts, cancel anytime. Let&apos;s figure out what your business actually needs.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/book"
                    className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition inline-flex items-center justify-center min-h-[44px]"
                  >
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Let&apos;s Talk
                  </Link>
                  <Link
                    href="/book"
                    className="cta-hover bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition inline-flex items-center justify-center min-h-[44px]"
                  >
                    Show Me the Demo
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <Logo size="xs" />
              <span className="font-bold">Align and Acquire</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 md:mb-0">
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-500 hover:text-white transition">Websites</Link>
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
