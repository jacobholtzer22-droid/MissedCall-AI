import Link from 'next/link'
import {
  Phone,
  PhoneOff,
  CheckCircle,
  ArrowRight,
  Shield,
  MessageSquare,
  Hash,
} from 'lucide-react'
import { Logo } from '@/app/components/Logo'
import ScrollReveal from '@/app/components/ScrollReveal'
import Marquee from '@/app/components/Marquee'

const steps = [
  {
    step: 1,
    title: 'Customer calls your number',
    description: 'Phone rings as normal. No change for your real customers.',
    icon: Phone,
  },
  {
    step: 2,
    title: 'They hear: Press 1 to connect',
    description: 'A simple automated prompt plays. One tap and they’re in.',
    icon: Hash,
  },
  {
    step: 3,
    title: 'Real customers press 1 and get through',
    description: 'Connected to you in seconds. Zero friction.',
    icon: CheckCircle,
  },
  {
    step: 4,
    title: 'Spam callers and robots hang up',
    description: "They can't press buttons. They never reach you.",
    icon: PhoneOff,
  },
]

const benefits = [
  'Zero spam calls reaching your phone',
  'No missed real customers — legitimate callers press 1 without thinking twice',
  'Works with your existing phone number — no need to change anything',
  'Set up in under 24 hours',
  'Pairs perfectly with MissedCall AI — if a real customer doesn’t get through, the AI texts them back',
]

export default function SpamScreeningPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white page-fade-in">
      {/* Hero */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-[15%] w-3 h-3 bg-green-400/30 rounded-full animate-float" />
          <div className="absolute top-[40%] left-[5%] w-2 h-2 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-[20%] right-[8%] w-4 h-4 bg-green-400/20 rounded-full animate-float" style={{ animationDelay: '4s' }} />
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="inline-block bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-green-500/30">
            🛡️ Click 1 to Connect
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Stop Wasting Time on <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">Spam Calls</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
            Our Click 1 to Connect system makes every caller press 1 before they reach you. Robots can&apos;t do that. Only real customers get through.
          </p>
          <Link
            href="/book"
            className="cta-hover inline-flex items-center justify-center bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:from-green-500 hover:to-emerald-500 transition-all"
          >
            Book a Free Call <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            'Robocalls can\'t press 1',
            'Real customers get through',
            'Your number stays the same',
            'Set up in 24 hours',
            'No more warranty spam',
          ]}
          separator="✦"
          speed="normal"
          className="text-green-400/60 text-sm font-medium tracking-wide uppercase"
        />
      </div>

      {/* The Problem */}
      <section className="py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold mb-6 text-center">You Know the Drill 😤</h2>
              <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-8 md:p-10 card-hover">
                <p className="text-lg text-gray-300 leading-relaxed">
                  Your phone rings. You stop what you&apos;re doing. You answer. It&apos;s a robocall about your car&apos;s extended warranty. That&apos;s 30 seconds of your life you&apos;ll never get back — and it happens 10+ times a day.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* How It Works - Horizontal flow */}
      <section className="py-20 grid-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works 🔢</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Four steps. One simple filter. Spam stays out. Real callers get through.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="max-w-6xl mx-auto">
              {/* Desktop: horizontal flow with arrows */}
              <div className="hidden md:flex md:items-stretch md:justify-center md:gap-2 overflow-x-auto pb-4 scrollbar-thin">
                {steps.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div key={item.step} className="flex items-center gap-2">
                      <div className="scroll-reveal flex flex-col items-center text-center p-6 rounded-2xl bg-gray-900 border border-white/10 card-hover min-w-[200px] max-w-[240px]">
                        <div className="bg-green-500/20 text-green-400 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 card-icon">
                          <Icon className="h-7 w-7" />
                        </div>
                        <span className="text-sm font-semibold text-green-400 mb-2">Step {item.step}</span>
                        <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                        <p className="text-gray-400 text-sm">{item.description}</p>
                      </div>
                      {i < steps.length - 1 && (
                        <div className="flex-shrink-0 text-green-500/50">
                          <ArrowRight className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Mobile: vertical stack */}
              <div className="md:hidden space-y-4">
                {steps.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.step} className="scroll-reveal flex items-start gap-4 p-6 rounded-2xl bg-gray-900 border border-white/10 card-hover">
                      <div className="bg-green-500/20 text-green-400 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 card-icon">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-green-400">Step {item.step}</span>
                        <h3 className="text-lg font-semibold mt-0.5 mb-1">{item.title}</h3>
                        <p className="text-gray-400 text-sm">{item.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">What You Get ✅</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Less noise. More real conversations.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="max-w-2xl mx-auto space-y-4">
              {benefits.map((benefit, i) => (
                <div key={i} className="scroll-reveal flex items-start gap-4 bg-gray-900 border border-white/10 p-5 rounded-xl card-hover">
                  <CheckCircle className="h-6 w-6 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-300">{benefit}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Upsell: Pair with MissedCall AI */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-3xl blur-2xl" />
              <div className="relative bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-3xl p-8 md:p-12 text-center">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border border-blue-500/30">
                  <MessageSquare className="h-4 w-4" /> The ultimate combo
                </div>
                <h2 className="text-3xl font-bold mb-4">Pair It With MissedCall AI 🚀</h2>
                <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                  Spam gets blocked. Real customers get through. And if you miss one? The AI handles it. Text back instantly, book the appointment, recover the sale — 24/7.
                </p>
                <Link
                  href="/missedcall-ai"
                  className="cta-hover inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all"
                >
                  See MissedCall AI <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 border-t border-white/10 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Simple Pricing 💰</h2>
              <p className="text-gray-400">Installed on your existing number. No new lines, no hassle.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <div className="max-w-md mx-auto">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-green-600/30 to-emerald-600/30 rounded-3xl blur-xl" />
                <div className="relative bg-gray-900 border border-white/10 rounded-3xl p-8 md:p-10">
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <Shield className="h-8 w-8 text-green-400" />
                    <span className="text-xl font-semibold">Spam Call Screening</span>
                  </div>
                  <div className="text-center mb-6">
                    <p className="text-gray-400 text-sm mb-1">$150 one-time setup</p>
                    <p className="text-4xl font-bold">
                      $100<span className="text-lg font-normal text-gray-400">/mo</span>
                    </p>
                    <p className="text-gray-500 text-sm mt-2">Installed on your existing number</p>
                  </div>
                  <Link
                    href="/book"
                    className="cta-hover w-full inline-flex items-center justify-center bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-xl text-lg font-semibold hover:from-green-500 hover:to-emerald-500 transition-all"
                  >
                    Book a Free Call <ArrowRight className="ml-2 h-5 w-5" />
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
              <div>
                <span className="font-bold">MissedCall AI</span>
                <span className="text-xs text-gray-500 block">A product by Align and Acquire</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 md:mb-0">
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/pricing" className="text-gray-500 hover:text-white transition">Pricing</Link>
              <Link href="/book" className="text-gray-500 hover:text-white transition">Book a Demo</Link>
              <Link href="/privacy" className="text-gray-500 hover:text-white transition">Privacy Policy</Link>
              <Link href="/terms" className="text-gray-500 hover:text-white transition">Terms & Conditions</Link>
            </div>
            <p className="text-gray-500">© {new Date().getFullYear()} Align and Acquire. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
