import Link from 'next/link'
import Image from 'next/image'
import { Phone, MessageSquare, Globe, ArrowRight, Code, Smartphone, Zap } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <Image src="/images/logo.png" alt="Align & Acquire" width={40} height={40} className="h-10 w-auto" />
              <span className="text-xl font-bold text-gray-900">Align & Acquire</span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/missedcall-ai" className="text-gray-600 hover:text-gray-900 transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-600 hover:text-gray-900 transition">Websites</Link>
              <a href="#contact" className="text-gray-600 hover:text-gray-900 transition">Contact</a>
            </div>
            <Link href="#contact" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              Book a Call
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            We Help Small Businesses <span className="text-blue-600">Grow</span>
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            AI-powered tools and custom websites that bring in more customers. Built by a founder who understands what small businesses actually need.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/missedcall-ai" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
              Explore MissedCall AI <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link href="/websites" className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center">
              See Our Work <Globe className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What We Do</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Two ways we help small businesses capture more customers and look professional online.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* MissedCall AI Card */}
            <Link href="/missedcall-ai" className="group">
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-500 hover:shadow-xl transition-all h-full">
                <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                  <MessageSquare className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">MissedCall AI</h3>
                <p className="text-gray-600 mb-6">
                  When you miss a call, our AI instantly texts the customer, finds out what they need, and books the appointment. Works 24/7 so you never lose a lead.
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center text-gray-600">
                    <Zap className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0" />
                    Instant text response to missed calls
                  </li>
                  <li className="flex items-center text-gray-600">
                    <Zap className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0" />
                    AI books appointments automatically
                  </li>
                  <li className="flex items-center text-gray-600">
                    <Zap className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0" />
                    Dashboard to track every conversation
                  </li>
                </ul>
                <div className="flex items-center text-blue-600 font-semibold group-hover:translate-x-2 transition-transform">
                  Learn More <ArrowRight className="ml-2 h-5 w-5" />
                </div>
              </div>
            </Link>

            {/* Websites Card */}
            <Link href="/websites" className="group">
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-500 hover:shadow-xl transition-all h-full">
                <div className="bg-green-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                  <Globe className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Custom Websites</h3>
                <p className="text-gray-600 mb-6">
                  Professional websites that make your business look great and convert visitors into customers. From landing pages to full e-commerce.
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center text-gray-600">
                    <Code className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    Custom design, not templates
                  </li>
                  <li className="flex items-center text-gray-600">
                    <Smartphone className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    Mobile-friendly & fast
                  </li>
                  <li className="flex items-center text-gray-600">
                    <Zap className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    Booking & payment integration
                  </li>
                </ul>
                <div className="flex items-center text-green-600 font-semibold group-hover:translate-x-2 transition-transform">
                  See Our Work <ArrowRight className="ml-2 h-5 w-5" />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-blue-400">4+</p>
              <p className="text-gray-400">Projects Launched</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-blue-400">100%</p>
              <p className="text-gray-400">Client Satisfaction</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-blue-400">24/7</p>
              <p className="text-gray-400">AI Never Sleeps</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-blue-400">1</p>
              <p className="text-gray-400">Founder Who Cares</p>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Built by a Founder, Not an Agency</h2>
            <p className="text-lg text-gray-600 mb-8">
              I'm Jacob — I started Align & Acquire because I saw small businesses struggling with two things: losing customers to missed calls and having websites that don't convert.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              I personally build every website and set up every AI system. When you work with me, you're not getting passed off to a junior developer. You're getting direct access to the person who built these tools from scratch.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 bg-blue-600">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Grow Your Business?</h2>
            <p className="text-blue-100 text-lg mb-8">
              Book a free call and I'll show you exactly how we can help.
            </p>
            <div className="bg-white rounded-2xl p-8">
              <form action="/api/book-demo" method="POST" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Your Name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    name="business"
                    required
                    placeholder="Business Name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="Email"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="tel"
                    name="phone"
                    required
                    placeholder="Phone"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  name="service"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">What are you interested in?</option>
                  <option value="missedcall-ai">MissedCall AI</option>
                  <option value="website">Custom Website</option>
                  <option value="both">Both</option>
                </select>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
                >
                  Book a Free Call
                </button>
              </form>
              <p className="text-sm text-gray-500 mt-4">I'll reach out within 24 hours to schedule a time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <Image src="/images/logo.png" alt="Align & Acquire" width={32} height={32} className="h-8 w-auto" />
              <span className="text-white font-bold">Align & Acquire</span>
            </div>
            <div className="flex space-x-8 mb-4 md:mb-0">
              <Link href="/missedcall-ai" className="hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="hover:text-white transition">Websites</Link>
              <a href="#contact" className="hover:text-white transition">Contact</a>
            </div>
            <p>© {new Date().getFullYear()} Align & Acquire. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}