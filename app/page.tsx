import Link from 'next/link'
import Image from 'next/image'
import { Phone, MessageSquare, Globe, ArrowRight, Code, Sparkles } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <Image src="/images/logo.png" alt="Align & Acquire" width={40} height={40} className="h-10 w-auto" />
              <span className="text-xl font-bold">Align & Acquire</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/missedcall-ai" className="text-gray-400 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-400 hover:text-white transition">Websites</Link>
            </div>
            <Link href="#contact" className="bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-200 transition font-medium">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 container mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-8 border border-white/20">
              <Sparkles className="h-4 w-4 mr-2 text-yellow-400" />
              Helping small businesses grow
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Tools That Bring You
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                More Customers
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              AI-powered automation and custom websites built specifically for small businesses. Stop losing leads. Start growing.
            </p>
          </div>

          {/* Two Big Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* MissedCall AI Card */}
            <Link href="/missedcall-ai" className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-3xl p-8 h-full hover:border-blue-500/50 transition-all hover:-translate-y-2 duration-300">
                <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                  <MessageSquare className="h-8 w-8 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold mb-4">MissedCall AI</h2>
                <p className="text-gray-400 mb-6 text-lg">
                  Never lose a customer to voicemail again. Our AI texts back instantly, books appointments, and recovers missed revenue 24/7.
                </p>
                <div className="flex items-center text-blue-400 font-semibold text-lg">
                  Explore MissedCall AI
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Websites Card */}
            <Link href="/websites" className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-400 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-3xl p-8 h-full hover:border-purple-500/50 transition-all hover:-translate-y-2 duration-300">
                <div className="bg-purple-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                  <Globe className="h-8 w-8 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold mb-4">Custom Websites</h2>
                <p className="text-gray-400 mb-6 text-lg">
                  Professional websites that convert visitors into customers. Custom code, mobile-first, blazing fast. No templates.
                </p>
                <div className="flex items-center text-purple-400 font-semibold text-lg">
                  See Our Work
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-white/50 rounded-full animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative z-10 py-16 border-y border-white/10 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">4+</p>
              <p className="text-gray-500 mt-1">Projects Launched</p>
            </div>
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">100%</p>
              <p className="text-gray-500 mt-1">Client Satisfaction</p>
            </div>
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">24/7</p>
              <p className="text-gray-500 mt-1">AI Never Sleeps</p>
            </div>
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">$0</p>
              <p className="text-gray-500 mt-1">Missed Opportunities</p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="relative z-10 py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl font-bold mb-6">
                  Built by a Founder,
                  <br />
                  <span className="text-gray-500">Not an Agency</span>
                </h2>
                <p className="text-gray-400 text-lg mb-6">
                  I'm Jacob — I started Align & Acquire because small businesses deserve better tools. Not overpriced agencies. Not cookie-cutter templates.
                </p>
                <p className="text-gray-400 text-lg mb-8">
                  Every website and AI system is built by me, personally. When you work with Align & Acquire, you get direct access to the person who built these tools from scratch.
                </p>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xl font-bold">
                    J
                  </div>
                  <div>
                    <p className="font-semibold">Jacob Holtzer</p>
                    <p className="text-gray-500 text-sm">Founder, Align & Acquire</p>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-2xl"></div>
                <div className="relative bg-gray-900 border border-white/10 rounded-3xl p-8">
                  <Code className="h-12 w-12 text-blue-400 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">What You Get</h3>
                  <ul className="space-y-3 text-gray-400">
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-3"></span>
                      Direct communication — no middlemen
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-3"></span>
                      Custom solutions for your business
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-pink-400 rounded-full mr-3"></span>
                      Fast turnaround times
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                      Ongoing support included
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="relative z-10 py-24">
        <div className="container mx-auto px-6">
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 text-center">
              <h2 className="text-4xl font-bold mb-4">Ready to Grow Your Business?</h2>
              <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                Whether you need an AI to handle missed calls or a website that actually converts — let's talk.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/missedcall-ai#book-demo" className="bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition inline-flex items-center justify-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Demo MissedCall AI
                </Link>
                <Link href="/websites#contact" className="bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition inline-flex items-center justify-center">
                  <Globe className="mr-2 h-5 w-5" />
                  Get a Website Quote
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <Image src="/images/logo.png" alt="Align & Acquire" width={32} height={32} className="h-8 w-auto" />
              <span className="font-bold">Align & Acquire</span>
            </div>
            <div className="flex space-x-8 mb-4 md:mb-0">
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-500 hover:text-white transition">Websites</Link>
            </div>
            <p className="text-gray-500">© {new Date().getFullYear()} Align & Acquire</p>
          </div>
        </div>
      </footer>
    </div>
  )
}