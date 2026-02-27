import Link from 'next/link'
import { Logo } from '../components/Logo'
import {
  MessageSquare,
  Phone,
  Search,
  Globe,
  ShieldCheck,
  Check,
  X,
  ArrowRight,
  TrendingUp,
  DollarSign,
} from 'lucide-react'

const services = [
  {
    name: 'MissedCall AI',
    price: 200,
    icon: MessageSquare,
    color: 'blue',
    description:
      'Never lose a customer to a missed call again. Our AI instantly texts back, captures lead info, understands what they need, and books appointments. 24/7, even after hours.',
  },
  {
    name: 'Spam Call Screening',
    price: 50,
    icon: ShieldCheck,
    color: 'green',
    description:
      '"Press 1 to connect" IVR system blocks robocalls and spam before they ever reach you. Only real customers get through.',
  },
  {
    name: 'Ads Management',
    price: 100,
    icon: TrendingUp,
    color: 'orange',
    description:
      'We set up, optimize, and manage your Google and/or Meta ad campaigns so you show up when customers search for your services. Includes monthly reporting.',
  },
  {
    name: 'Website Design & Upkeep',
    price: 50,
    icon: Globe,
    color: 'purple',
    description:
      'Professional website with hosting, security updates, content changes, and performance monitoring. We handle everything.',
  },
  {
    name: 'SEO Optimization',
    price: 50,
    icon: Search,
    color: 'pink',
    description:
      'On-page SEO, keyword targeting, and Google Business optimization to help you rank higher and get found organically.',
  },
]

const packages = [
  {
    name: 'Growth',
    price: 260,
    retailPrice: 300,
    tag: 'Most Popular',
    featured: false,
    includes: {
      'MissedCall AI': true,
      'Spam Call Screening': true,
      'Ads Management': false,
      'Website Upkeep': true,
      SEO: false,
    },
  },
  {
    name: 'Pro',
    price: 335,
    retailPrice: 400,
    tag: 'Full Funnel',
    featured: false,
    includes: {
      'MissedCall AI': true,
      'Spam Call Screening': true,
      'Ads Management': true,
      'Website Upkeep': true,
      SEO: false,
    },
  },
  {
    name: 'All In',
    price: 375,
    retailPrice: 450,
    tag: 'Maximum Growth',
    featured: false,
    includes: {
      'MissedCall AI': true,
      'Spam Call Screening': true,
      'Ads Management': true,
      'Website Upkeep': true,
      SEO: true,
    },
  },
]

const iconColorMap: Record<string, string> = {
  blue: 'text-blue-400 bg-blue-500/20',
  green: 'text-green-400 bg-green-500/20',
  orange: 'text-orange-400 bg-orange-500/20',
  purple: 'text-purple-400 bg-purple-500/20',
  pink: 'text-pink-400 bg-pink-500/20',
}

export default function PricingPage() {

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block bg-blue-500/20 text-blue-400 px-4 py-1 rounded-full text-sm font-medium mb-6 border border-blue-500/30">
              Simple, transparent pricing
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Stop Losing Customers.{' '}
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Start Growing.
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Every missed call is lost revenue. Every day without a website is a day your competitors win. Pick the package that fits and start recovering what you&apos;re leaving on the table.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              One-time setup fees vary by service &mdash; we&apos;ll cover exact costs on your discovery call.
            </p>
          </div>
        </div>
      </section>

      {/* Package Cards */}
      <section className="relative z-10 py-12">
          <div className="container mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold">📦 Packages</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {packages.map((pkg) => {
                const savings = pkg.retailPrice - pkg.price
                const savingsPercent = Math.round(
                  (savings / pkg.retailPrice) * 100
                )

                return (
                  <div
                    key={pkg.name}
                    className={`relative rounded-2xl p-px ${
                      pkg.featured
                        ? 'bg-gradient-to-b from-blue-500 to-purple-500'
                        : 'bg-white/10'
                    }`}
                  >
                    {pkg.featured && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                        <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-purple-500/25 whitespace-nowrap">
                          ★ Best Value
                        </span>
                      </div>
                    )}

                    <div
                      className={`relative bg-gray-900 rounded-2xl p-6 h-full flex flex-col ${
                        pkg.featured ? 'ring-1 ring-purple-500/50' : ''
                      }`}
                    >
                      <div className="mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {pkg.tag}
                        </span>
                        <h3 className="text-2xl font-bold mt-1">{pkg.name}</h3>
                      </div>

                      <div className="mb-1">
                        <span className="text-sm text-gray-500 line-through">
                          ${pkg.retailPrice}/mo
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-4xl font-bold">${pkg.price}</span>
                        <span className="text-gray-400">/mo</span>
                      </div>
                      <div className="inline-flex items-center gap-1 bg-green-500/10 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full w-fit mb-6">
                        <DollarSign className="h-3 w-3" />
                        Save ${savings}/mo ({savingsPercent}% off)
                      </div>

                      <div className="space-y-3 mb-8 flex-1">
                        {Object.entries(pkg.includes).map(
                          ([service, included]) => (
                            <div
                              key={service}
                              className="flex items-center gap-3"
                            >
                              {included ? (
                                <Check className="h-5 w-5 text-green-400 shrink-0" />
                              ) : (
                                <X className="h-5 w-5 text-gray-600 shrink-0" />
                              )}
                              <span
                                className={
                                  included ? 'text-gray-300' : 'text-gray-600'
                                }
                              >
                                {service}
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      <Link
                        href="/#contact"
                        className={`w-full py-3 rounded-xl text-center font-semibold transition-all flex items-center justify-center ${
                          pkg.featured
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-purple-500/25'
                            : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                        }`}
                      >
                        Get Started
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

      {/* Standalone Services */}
      <section className="relative z-10 py-12">
        <div className="container mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Standalone Services</h2>
            <p className="text-gray-400">Need just one service? Pick exactly what you need.</p>
          </div>
          <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const Icon = service.icon
              const colors = iconColorMap[service.color]
              return (
                <div
                  key={service.name}
                  className="bg-gray-900 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold leading-tight">{service.name}</h3>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xl font-bold">${service.price}</span>
                        <span className="text-gray-400 text-sm">/mo</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm flex-1">{service.description}</p>
                  <Link
                    href="/#contact"
                    className="mt-4 bg-white/10 text-white hover:bg-white/20 border border-white/10 py-2 rounded-lg font-semibold transition-all text-center text-sm"
                  >
                    Get Started
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-6">
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-2xl"></div>
            <div className="relative bg-gray-900 border border-white/10 rounded-3xl p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  The Math Speaks for Itself
                </h2>
                <p className="text-gray-400 text-lg">
                  See how fast this pays for itself.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-10">
                <div className="text-center p-6 bg-gray-800/50 rounded-2xl border border-white/5">
                  <Phone className="h-8 w-8 text-red-400 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-red-400">10</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Missed calls per week
                  </p>
                </div>
                <div className="text-center p-6 bg-gray-800/50 rounded-2xl border border-white/5">
                  <DollarSign className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-yellow-400">$100</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Avg. job value
                  </p>
                </div>
                <div className="text-center p-6 bg-gray-800/50 rounded-2xl border border-white/5">
                  <TrendingUp className="h-8 w-8 text-green-400 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-green-400">$1,560</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Lost revenue per month
                  </p>
                </div>
              </div>

              <div className="text-center bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl p-6">
                <p className="text-lg text-gray-300">
                  If you miss just <span className="text-white font-bold">10 calls a week</span> at a{' '}
                  <span className="text-white font-bold">$100 average job value</span>, that&apos;s{' '}
                  <span className="text-green-400 font-bold text-2xl">$1,560/mo</span> in lost revenue.
                </p>
                <p className="text-blue-400 font-semibold mt-3">
                  Our service pays for itself many times over.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-6">
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 text-center">
              <h2 className="text-4xl font-bold mb-4">
                Ready to Stop Losing Customers?
              </h2>
              <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                Pick a package or build your own. No contracts, cancel anytime.
                Let&apos;s talk about what your business needs.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/#contact"
                  className="bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition inline-flex items-center justify-center"
                >
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Get Started Today
                </Link>
                <Link
                  href="/missedcall-ai#book-demo"
                  className="bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition inline-flex items-center justify-center"
                >
                  Book a Free Demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="relative z-10 py-12 border-t border-white/10">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <p className="text-gray-400">
              <span className="text-white font-semibold">One-time setup fees</span> vary by service and are covered during your discovery call
            </p>
            <p className="text-gray-500">
              No contracts &bull; Cancel anytime &bull; 30-day money-back guarantee
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <Logo size="xs" />
              <span className="font-bold">Align & Acquire</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 md:mb-0">
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-500 hover:text-white transition">Websites</Link>
              <Link href="/pricing" className="text-gray-500 hover:text-white transition">Pricing</Link>
              <Link href="/privacy" className="text-gray-500 hover:text-white transition">Privacy Policy</Link>
              <Link href="/terms" className="text-gray-500 hover:text-white transition">Terms & Conditions</Link>
            </div>
            <p className="text-gray-500">© {new Date().getFullYear()} Align & Acquire</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
