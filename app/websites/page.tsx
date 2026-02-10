import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ExternalLink, Globe, Code, Smartphone, Palette, ShoppingCart, Calendar } from 'lucide-react'

const projects = [
  {
    title: 'Apex Detail Studio',
    category: 'Business Website',
    description: 'Premium auto detailing website for a Nashville-based studio. Features service packages, gallery, testimonials, and booking integration.',
    image1: '/images/portfolio/detailing-1.png',
    image2: '/images/portfolio/detailing-2.png',
    url: 'https://detailing-site-seven.vercel.app/',
    features: ['Service Packages', 'Image Gallery', 'Testimonials', 'Contact Forms'],
  },
  {
    title: 'Learning Logs',
    category: 'SaaS Application',
    description: 'Educational platform that helps users turn passive content into durable memory. Full authentication system with user accounts.',
    image1: '/images/portfolio/learning-logs-1.png',
    image2: '/images/portfolio/learning-logs-2.png',
    url: 'https://learning-log-app-kimu.vercel.app/',
    features: ['User Authentication', 'Dashboard', 'Progress Tracking', 'Responsive Design'],
  },
  {
    title: 'Breeze Tees',
    category: 'E-Commerce',
    description: 'Modern t-shirt brand with a clean, stylish design. Built for showcasing products and driving conversions.',
    image1: '/images/portfolio/breeze-tees-1.png',
    image2: '/images/portfolio/breeze-tees-2.png',
    url: 'https://breeze-tees.vercel.app/',
    features: ['Product Showcase', 'Modern Design', 'Mobile Optimized', 'Brand Identity'],
  },
  {
    title: 'MissedCall AI Dashboard',
    category: 'SaaS Platform',
    description: 'Full-featured dashboard for managing AI-powered missed call responses. Real-time conversations, analytics, and settings.',
    image1: '/images/portfolio/dashboard.png',
    image2: '/images/portfolio/dashboard.png',
    url: 'https://alignandacquire.com/dashboard',
    features: ['Real-time Data', 'Conversation Management', 'Analytics', 'Multi-tenant'],
  },
]

export default function WebsitesPage() {
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
              <Link href="/websites" className="text-gray-900 font-semibold">Websites</Link>
              <a href="#contact" className="text-gray-600 hover:text-gray-900 transition">Contact</a>
            </div>
            <a href="#contact" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              Get a Quote
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Websites That <span className="text-blue-600">Convert</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Custom-built websites for small businesses. No templates, no page builders — just clean code that loads fast and looks great on every device.
          </p>
          <a href="#contact" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition inline-flex items-center">
            Start Your Project <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </div>
      </section>

      {/* What We Build */}
      <section className="py-20 border-b border-gray-100">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What We Build</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">From simple landing pages to full web applications</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="bg-gray-50 p-6 rounded-xl text-center">
              <Globe className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">Business Websites</h3>
              <p className="text-sm text-gray-600">Professional sites that showcase your services</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl text-center">
              <ShoppingCart className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">E-Commerce</h3>
              <p className="text-sm text-gray-600">Online stores with cart and checkout</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl text-center">
              <Calendar className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">Booking Systems</h3>
              <p className="text-sm text-gray-600">Let customers schedule appointments online</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl text-center">
              <Code className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">Web Applications</h3>
              <p className="text-sm text-gray-600">Custom software for your business</p>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Work</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Recent projects we have built and launched</p>
          </div>

          <div className="space-y-20">
            {projects.map((project, index) => (
              <div key={project.title} className={`grid lg:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                {/* Images */}
                <div className={`${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="relative">
                    <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-xl">
                      <Image 
                        src={project.image1} 
                        alt={project.title}
                        width={800}
                        height={500}
                        className="w-full h-auto"
                      />
                    </div>
                    {project.image1 !== project.image2 && (
                      <div className="absolute -bottom-6 -right-6 w-2/3 bg-gray-100 rounded-2xl overflow-hidden shadow-xl border-4 border-white">
                        <Image 
                          src={project.image2} 
                          alt={`${project.title} detail`}
                          width={500}
                          height={300}
                          className="w-full h-auto"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className={`${index % 2 === 1 ? 'lg:order-1' : ''}`}>
                  <span className="text-blue-600 font-medium">{project.category}</span>
                  <h3 className="text-3xl font-bold text-gray-900 mt-2 mb-4">{project.title}</h3>
                  <p className="text-gray-600 mb-6">{project.description}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    {project.features.map((feature) => (
                      <span key={feature} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                        {feature}
                      </span>
                    ))}
                  </div>

                  <a 
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 font-semibold hover:text-blue-700"
                  >
                    View Live Site <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Work With Us */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Why Work With Us</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">What you get when you choose Align & Acquire</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Code className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Custom Code</h3>
              <p className="text-gray-400">No WordPress, no Wix. Real code that loads fast and ranks better.</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Mobile First</h3>
              <p className="text-gray-400">Every site looks perfect on phones, tablets, and desktops.</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Palette className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Your Vision</h3>
              <p className="text-gray-400">We build what you need, not a cookie-cutter template.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact" className="py-20 bg-blue-600">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-4">Start Your Project</h2>
              <p className="text-blue-100 text-lg">Tell us about your business and well put together a custom quote.</p>
            </div>
            <div className="bg-white rounded-2xl p-8">
              <form action="/api/book-demo" method="POST" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      placeholder="John Smith"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      name="business"
                      required
                      placeholder="Smith's Auto Shop"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="john@email.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">What do you need?</label>
                  <select
                    name="businessType"
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="new-website">New Website</option>
                    <option value="redesign">Website Redesign</option>
                    <option value="ecommerce">E-Commerce Store</option>
                    <option value="booking">Booking System</option>
                    <option value="web-app">Web Application</option>
                    <option value="other">Something Else</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tell us more (optional)</label>
                  <textarea
                    name="message"
                    rows={3}
                    placeholder="Describe your project..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
                >
                  Get a Free Quote
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-4">Well respond within 24 hours with a custom quote.</p>
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
              <Link href="/" className="hover:text-white transition">Home</Link>
              <Link href="/missedcall-ai" className="hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="hover:text-white transition">Websites</Link>
            </div>
            <p>© {new Date().getFullYear()} Align & Acquire. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}