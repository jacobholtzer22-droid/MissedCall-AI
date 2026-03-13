import Link from 'next/link'
import {
  ArrowRight,
  Check,
  BarChart3,
  Search as SearchIcon,
  Rocket,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'

const features = [
  'Google Ads account setup and configuration',
  'Keyword research — finding what your customers actually search for',
  'Campaign creation — ad copy, targeting, bid strategy',
  'Negative keyword management — so you don\'t waste money on junk clicks',
  'Monthly optimization — pausing what doesn\'t work, scaling what does',
  'A/B testing — testing different ads to find what gets the most clicks',
  'Monthly performance reports — you\'ll always know where your money is going',
  'Ad extensions — sitelinks, callouts, call buttons to make your ads stand out',
]

const steps = [
  {
    title: 'We research your market',
    description: 'Keyword research, competitor analysis, audience targeting.',
    icon: SearchIcon,
  },
  {
    title: 'We build and launch your campaigns',
    description: 'Live within 3–5 days of signing up.',
    icon: Rocket,
  },
  {
    title: 'We optimize every month',
    description: 'Cutting waste, scaling winners, reporting results.',
    icon: RefreshCw,
  },
]

export default function AdsManagementPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white page-fade-in">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh"></div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl"></div>
          <div className="absolute top-20 right-[20%] w-3 h-3 bg-amber-400/30 rounded-full animate-float"></div>
          <div className="absolute bottom-[30%] left-[10%] w-2 h-2 bg-orange-400/40 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-[50%] left-[15%] w-4 h-4 bg-amber-400/15 rounded-full animate-float" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="inline-block bg-amber-500/20 text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-amber-500/30">
            📊 Google Ads — we run it, you get the leads
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Show Up When It{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Matters Most
            </span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
            Your customers are searching for exactly what you offer. Google Ads puts you at the top of the results. We set it up, run it, and make it better every month.
          </p>
          <Link
            href="/book"
            className="cta-hover inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-200 transition"
          >
            Book a Free Call
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'Keyword Research',
            'Campaign Setup',
            'Monthly Optimization',
            'Performance Reports',
            'Negative Keywords',
            'A/B Testing',
          ]}
          separator="✦"
          speed="normal"
          className="text-amber-400/60 text-sm font-medium tracking-wide uppercase"
        />
      </div>

      {/* The problem */}
      <section className="relative z-10 py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Right now, your competitors are paying to show up above you on Google.
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed">
                Every search you&apos;re not showing up for is a customer walking into someone else&apos;s door.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* What's included */}
      <section className="relative z-10 py-20 border-t border-white/10">
        <div className="absolute inset-0 pointer-events-none sparkle-container">
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">What&apos;s Included ✨</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Everything you need to show up, convert, and not waste a dime.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="max-w-2xl mx-auto space-y-4">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="scroll-reveal flex items-start gap-4 bg-gray-900/50 border border-white/10 rounded-xl p-5 card-hover"
                >
                  <Check className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 py-20 border-t border-white/10 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works 🔧</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Three steps from sign-up to scaling.</p>
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

      {/* Important note */}
      <section className="relative z-10 py-16 border-t border-white/10 bg-gray-900/30">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start gap-4 bg-gray-900 border border-amber-500/20 rounded-2xl p-8">
                <div className="bg-amber-500/20 w-12 h-12 rounded-xl flex items-center justify-center shrink-0 card-icon">
                  <Shield className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-amber-400/90">Important note</h3>
                  <p className="text-gray-300 leading-relaxed">
                    Your ad budget goes directly to Google — it never touches our hands. Our fee covers the strategy, setup, and ongoing management. You control how much you spend on ads.
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 py-20 border-t border-white/10">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Pricing 💰</h2>
                <p className="text-gray-400">Simple. No surprises. You own your ad spend.</p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 to-orange-600/20 rounded-3xl blur-2xl"></div>
                <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-500">One-time setup</p>
                      <p className="text-3xl font-bold text-amber-400">$250</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Monthly management</p>
                      <p className="text-3xl font-bold">$125<span className="text-gray-400 text-lg font-normal">/mo</span></p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm border-t border-white/10 pt-6 mb-8">
                    Ad spend goes directly to Google — you choose the budget.
                  </p>
                  <Link
                    href="/book"
                    className="cta-hover w-full sm:w-auto inline-flex justify-center items-center bg-amber-500 text-gray-900 px-8 py-4 rounded-xl font-semibold hover:bg-amber-400 transition"
                  >
                    Book a Free Call
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Social proof placeholder */}
      <section className="relative z-10 py-20 border-t border-white/10 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-gray-900/50 border border-white/10 border-dashed rounded-2xl p-12">
                <BarChart3 className="h-12 w-12 text-amber-400/40 mx-auto mb-4" />
                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">
                  Social proof
                </p>
                <p className="text-gray-500">
                  Testimonial or stat about ad results — drop it in when you have one.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl p-8 sm:p-12 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Show Up on Google?</h2>
                <p className="text-amber-100 text-lg mb-8 max-w-2xl mx-auto">
                  Book a free call. We&apos;ll talk about your market, your goals, and whether Google Ads is the right move. No pressure.
                </p>
                <Link
                  href="/book"
                  className="cta-hover inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition"
                >
                  Book a Free Call
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
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
              <Link href="/ads-management" className="text-gray-500 hover:text-white transition">Google Ads</Link>
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
