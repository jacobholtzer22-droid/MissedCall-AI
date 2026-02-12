import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ExternalLink, Globe, Code, Smartphone, Palette, ShoppingCart, Calendar } from 'lucide-react'

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
    title: 'Learning Logs',
    category: 'SaaS Application',
    description: 'Educational platform that helps users turn passive content into durable memory. Full authentication system with user accounts.',
    image1: '/images/portfolio/learning-logs-1.png',
    image2: '/images/portfolio/learning-logs-2.png',
    url: 'https://learning-log-app-kimu.vercel.app/',
    features: ['User Authentication', 'Dashboard', 'Progress Tracking', 'Responsive Design'],
    imagesSeparate: true,
    imageCompact: true,
  },
  {
    title: 'Apex Detail Studio',
    category: 'Business Website',
    description: 'Premium auto detailing website for a car detailing company. Features service packages, gallery, testimonials, and booking integration.',
    image1: '/images/portfolio/detailing-1.png',
    image2: '/images/portfolio/detailing-2.png',
    url: 'https://detailing-site-seven.vercel.app/',
    features: ['Service Packages', 'Image Gallery', 'Testimonials', 'Contact Forms'],
  },
  {
    title: 'Breeze Tees',
    category: 'E-Commerce',
    description: 'Modern t-shirt brand with a clean, stylish design. Built for showcasing products and driving conversions.',
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
      <section className="pt-24 pb-20">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Websites That <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Convert</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
            Custom built websites for small businesses. No templates, no page builders. Just clean code that loads fast and looks great on every device.
          </p>
          <a href="#contact" className="bg-white text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition inline-flex items-center">
            Start Your Project <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </div>
      </section>

      {/* What We Build */}
      <section className="py-20 border-b border-white/10">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">What We Build</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">From simple landing pages to full web applications</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="bg-gray-900 border border-white/10 p-6 rounded-xl text-center">
              <Globe className="h-10 w-10 text-blue-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Business Websites</h3>
              <p className="text-sm text-gray-400">Professional sites that showcase your services</p>
            </div>
            <div className="bg-gray-900 border border-white/10 p-6 rounded-xl text-center">
              <ShoppingCart className="h-10 w-10 text-blue-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">E-Commerce</h3>
              <p className="text-sm text-gray-400">Online stores with cart and checkout</p>
            </div>
            <div className="bg-gray-900 border border-white/10 p-6 rounded-xl text-center">
              <Calendar className="h-10 w-10 text-blue-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Booking Systems</h3>
              <p className="text-sm text-gray-400">Let customers schedule appointments online</p>
            </div>
            <div className="bg-gray-900 border border-white/10 p-6 rounded-xl text-center">
              <Code className="h-10 w-10 text-blue-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Web Applications</h3>
              <p className="text-sm text-gray-400">Custom software for your business</p>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section id="portfolio" className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Align and Acquires portfolio
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Recent projects we have built and launched</p>
          </div>

          <div className="space-y-20 max-w-4xl mx-auto">
            {projects.map((project) => (
              <div key={project.title} className="space-y-10">
                {/* Info - project name and details above picture */}
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

                {/* Images - bigger, below the name */}
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
            ))}
          </div>
        </div>
      </section>

      {/* Why Work With Us */}
      <section className="py-20 border-y border-white/10 bg-gray-900/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Why Work With Us</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">What you get when you choose Align & Acquire</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Code className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Custom Code</h3>
              <p className="text-gray-400">No WordPress, no Wix. Real code that loads fast and ranks better.</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Mobile First</h3>
              <p className="text-gray-400">Every site looks perfect on phones, tablets, and desktops.</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Palette className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Your Vision</h3>
              <p className="text-gray-400">We build what you need, not a cookie cutter template.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact" className="py-20">
        <div className="container mx-auto px-6">
          <div className="relative max-w-2xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 md:p-12">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-4">Start Your Project</h2>
                <p className="text-blue-100 text-lg">Tell us about your business and we'll put together a custom quote.</p>
              </div>
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <form action="/api/book-demo" method="POST" className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder="John Smith"
                        className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Business Name</label>
                      <input
                        type="text"
                        name="business"
                        required
                        placeholder="Smith's Auto Shop"
                        className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="john@email.com"
                        className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        required
                        placeholder="(555) 123-4567"
                        className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">What do you need?</label>
                    <select
                      name="businessType"
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tell us more (optional)</label>
                    <textarea
                      name="message"
                      rows={3}
                      placeholder="Describe your project..."
                      className="w-full px-4 py-3 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-white text-gray-900 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition"
                  >
                    Get a Free Quote
                  </button>
                </form>
                <p className="text-center text-sm text-gray-400 mt-4">We'll respond within 24 hours with a custom quote.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <Image src="/images/logo.png" alt="Align & Acquire" width={64} height={64} sizes="32px" className="h-8 w-auto" />
              <span className="font-bold">Align & Acquire</span>
            </div>
            <div className="flex space-x-8 mb-4 md:mb-0">
              <Link href="/" className="text-gray-500 hover:text-white transition">Home</Link>
              <Link href="/missedcall-ai" className="text-gray-500 hover:text-white transition">MissedCall AI</Link>
              <Link href="/websites" className="text-gray-500 hover:text-white transition">Websites</Link>
            </div>
            <p className="text-gray-500">© {new Date().getFullYear()} Align & Acquire. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}