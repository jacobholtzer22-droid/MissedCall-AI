import Link from 'next/link'
import { MessageSquare, Globe, Megaphone, ArrowRight, Code } from 'lucide-react'
import { Logo } from './components/Logo'
import ContactForm from './components/ContactForm'
import Marquee from './components/Marquee'
import ScrollReveal from './components/ScrollReveal'
import CountUp from './components/CountUp'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden page-fade-in">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        {/* Animated Gradient Mesh Background */}
        <div className="absolute inset-0 gradient-mesh"></div>

        {/* Decorative Floating Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-20 right-[15%] w-3 h-3 bg-blue-400/30 rounded-full animate-float"></div>
          <div className="absolute top-[40%] left-[8%] w-2 h-2 bg-purple-400/40 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-[30%] right-[10%] w-4 h-4 bg-blue-400/20 rounded-full animate-float" style={{ animationDelay: '4s' }}></div>
          <div className="absolute top-[60%] left-[20%] w-2 h-2 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-[15%] left-[60%] w-5 h-5 border border-blue-400/10 rounded-full animate-float" style={{ animationDelay: '3s' }}></div>
          <div className="absolute bottom-[20%] left-[40%] w-6 h-6 border border-purple-400/10 rounded-full animate-float" style={{ animationDelay: '5s' }}></div>
        </div>

        <div className="relative z-10 container mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-7xl font-bold mb-3 leading-tight">
              Catalyzing Small Business Growth.
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-4">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Your competitors aren&apos;t waiting. Neither should you.
              </span>
            </p>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Automation that actually works. Websites that actually convert.
              <br className="hidden md:block" />
              A guy who actually picks up the phone.
            </p>
          </div>

          {/* Service Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* MissedCall AI Card */}
            <Link href="/missedcall-ai" className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-3xl p-8 h-full hover:border-blue-500/50 transition-all hover:-translate-y-2 duration-300 hover:shadow-[0_20px_40px_rgba(59,130,246,0.15)]">
                <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 card-icon">
                  <MessageSquare className="h-8 w-8 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold mb-4">📞 MissedCall AI</h2>
                <p className="text-gray-400 mb-6 text-lg">
                  Stop losing money to voicemail. Our AI texts back instantly, books appointments, and recovers missed revenue — 24/7, even at 3am.
                </p>
                <div className="flex items-center text-blue-400 font-semibold text-lg">
                  Show me how it works
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Websites Card */}
            <Link href="/websites" className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-400 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-3xl p-8 h-full hover:border-purple-500/50 transition-all hover:-translate-y-2 duration-300 hover:shadow-[0_20px_40px_rgba(139,92,246,0.15)]">
                <div className="bg-purple-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 card-icon">
                  <Globe className="h-8 w-8 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold mb-4">🌐 Custom Websites</h2>
                <p className="text-gray-400 mb-6 text-lg">
                  No templates. No WordPress. Just clean, custom code that loads fast, looks incredible, and actually turns visitors into customers.
                </p>
                <div className="flex items-center text-purple-400 font-semibold text-lg">
                  See the portfolio
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Campaigns Card */}
            <Link href="/campaigns" className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-orange-400 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-3xl p-8 h-full hover:border-amber-500/50 transition-all hover:-translate-y-2 duration-300 hover:shadow-[0_20px_40px_rgba(245,158,11,0.15)]">
                <div className="bg-amber-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 card-icon">
                  <Megaphone className="h-8 w-8 text-amber-400" />
                </div>
                <h2 className="text-3xl font-bold mb-4">📣 Mass Campaigns</h2>
                <p className="text-gray-400 mb-6 text-lg">
                  Blast emails and texts to your entire client list in one click. Past customers, new leads, everyone. Stay top of mind and bring old customers back.
                </p>
                <div className="flex items-center text-amber-400 font-semibold text-lg">
                  Learn more
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Scrolling Marquee - Problem Awareness */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'Missed Calls → Money Lost',
            'Bad Website → No Trust',
            'No Ads → Invisible',
            'Slow Response → Lost Lead',
            'No Automation → Burnout',
          ]}
          separator="✦"
          speed="normal"
          className="text-gray-500 text-sm font-medium tracking-wide uppercase"
        />
      </div>

      {/* Book a Call - Calendar CTA */}
      <section className="relative z-10 py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <h2 className="text-4xl font-bold mb-3">Let&apos;s Talk 🚀</h2>
                <p className="text-gray-400 text-lg">
                  Pick a time that works. 15 minutes, no pitch, no pressure.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-2xl"></div>
                <div className="relative bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-2xl p-8 md:p-10 text-center">
                  <p className="text-gray-300 mb-6">
                    Book a free 15-minute call. We&apos;ll talk about what your business needs — no strings attached.
                  </p>
                  <Link
                    href="/book"
                    className="cta-hover inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all"
                  >
                    Pick a time →
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative z-10 py-16 border-y border-white/10 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <p className="text-center text-sm text-gray-500 uppercase tracking-widest mb-8 font-medium">The numbers don&apos;t lie</p>
          </ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-center">
            <div>
              <CountUp
                end={150}
                suffix="+"
                className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              />
              <p className="text-gray-500 mt-1">Businesses Growing</p>
            </div>
            <div>
              <CountUp
                end={98.3}
                suffix="%"
                decimals={1}
                className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              />
              <p className="text-gray-500 mt-1">Client Retention</p>
            </div>
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">24/7</p>
              <p className="text-gray-500 mt-1">AI That Never Sleeps</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Marquee */}
      <div className="bg-gray-900/30 py-3 border-b border-white/5">
        <Marquee
          items={[
            '150+ Businesses Growing',
            '98.3% Client Retention',
            '24/7 AI That Never Sleeps',
            'Websites Built in Days, Not Months',
            'No Contracts, Cancel Anytime',
          ]}
          separator="★"
          speed="slow"
          reverse
          className="text-blue-400/60 text-xs font-semibold tracking-wider uppercase"
        />
      </div>

      {/* About Section */}
      <section className="relative z-10 py-24 grid-pattern">
        {/* Sparkle decorations */}
        <div className="absolute inset-0 pointer-events-none sparkle-container">
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
          <div className="sparkle"></div>
        </div>

        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <ScrollReveal>
                <div>
                  <h2 className="text-4xl font-bold mb-6">
                    Built by a Founder,
                    <br />
                    <span className="text-gray-500">Not an Agency</span>
                  </h2>
                  <p className="text-gray-400 text-lg mb-6">
                    I&apos;m Jacob. I don&apos;t have a team of 50 people. I don&apos;t have a fancy office. What I do have is a system that works and a phone that I actually answer.
                  </p>
                  <p className="text-gray-400 text-lg mb-4">
                    Every website, every AI system, every line of code — that&apos;s me. When you call, I pick up. When something breaks, I fix it. No account managers. No ticket systems. No &ldquo;we&apos;ll circle back next quarter.&rdquo;
                  </p>
                  <p className="text-gray-300 text-lg mb-8 font-medium italic">
                    &ldquo;You deserve tools that actually work, from someone who actually cares.&rdquo;
                  </p>
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xl font-bold">
                      J
                    </div>
                    <div>
                      <p className="font-semibold">Jacob Holtzer</p>
                      <p className="text-gray-500 text-sm">Founder & the only person you&apos;ll ever talk to</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-2xl"></div>
                  <div className="relative bg-gray-900 border border-white/10 rounded-3xl p-8 card-hover">
                    <Code className="h-12 w-12 text-blue-400 mb-4 card-icon" />
                    <h3 className="text-xl font-semibold mb-3">Here&apos;s What You Get</h3>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 shrink-0"></span>
                        Direct access to the person who built it
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 shrink-0"></span>
                        Custom solutions, not cookie-cutter crap
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-pink-400 rounded-full mr-3 shrink-0"></span>
                        Turnaround measured in days, not months
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-3 shrink-0"></span>
                        Ongoing support that doesn&apos;t cost extra
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-amber-400 rounded-full mr-3 shrink-0"></span>
                        CRM dashboard and mass campaigns when you need them
                      </li>
                    </ul>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form - secondary option below the fold */}
      <section id="contact" className="relative z-10 py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-10">
                <h2 className="text-4xl font-bold mb-3">Prefer to just send a message?</h2>
                <p className="text-gray-400 text-lg">
                  No pitch deck. No 47-step funnel. Just tell me what you need.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-2xl"></div>
                <div className="relative">
                  <ContactForm />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-24">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 text-center">
                <h2 className="text-4xl font-bold mb-4">Stop Losing Leads. Seriously.</h2>
                <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                  Whether you need an AI that never misses a call or a website that actually converts — let&apos;s make it happen.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/book" className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition inline-flex items-center justify-center">
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Show Me the Demo
                  </Link>
                  <Link href="/book" className="cta-hover bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition inline-flex items-center justify-center">
                    <Globe className="mr-2 h-5 w-5" />
                    I Need a Website
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
