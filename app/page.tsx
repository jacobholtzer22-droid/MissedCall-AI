import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { Phone, MessageSquare, Calendar, ArrowRight, CheckCircle, Clock, DollarSign, Shield, Zap } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Phone className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">MissedCall AI</span>
            </div>
            <div className="flex items-center space-x-4">
              <SignedOut>
                <Link href="/sign-in" className="text-gray-600 hover:text-gray-900 transition">Sign In</Link>
                <Link href="/sign-up" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">Start Free Trial</Link>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center">
                  Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-6 text-center">
          <div className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-medium mb-6">
            Stop losing customers to voicemail
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Turn Missed Calls Into<br /><span className="text-blue-600">Booked Appointments</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            When you can't answer the phone, our AI instantly texts the caller, 
            understands what they need, and books appointments — 24/7, automatically.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <SignedOut>
              <Link href="/sign-up" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
                Start Free 14-Day Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link href="#how-it-works" className="border border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition">
                See How It Works
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
                Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </SignedIn>
          </div>
          <p className="text-sm text-gray-500 mt-4">No credit card required • Setup in 5 minutes</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-gray-100">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-gray-900">62%</p>
              <p className="text-gray-600">of callers won't leave a voicemail</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-gray-900">85%</p>
              <p className="text-gray-600">of missed calls never call back</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-gray-900">$1,200</p>
              <p className="text-gray-600">average value of a lost customer</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Three simple steps to never lose a customer to a missed call again</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-8 rounded-2xl bg-gray-50">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">1</div>
              <Phone className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Call Goes Unanswered</h3>
              <p className="text-gray-600">Customer calls while you're busy with another client, driving, or after hours.</p>
            </div>
            <div className="text-center p-8 rounded-2xl bg-gray-50">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">2</div>
              <MessageSquare className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">AI Texts Instantly</h3>
              <p className="text-gray-600">Within seconds, they get a text: "Sorry we missed you! How can we help?"</p>
            </div>
            <div className="text-center p-8 rounded-2xl bg-gray-50">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">3</div>
              <Calendar className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Appointment Booked</h3>
              <p className="text-gray-600">The AI gathers their info, books the appointment, and adds it to your calendar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything You Need</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Powerful features that work while you sleep</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <FeatureCard icon={Zap} title="Instant Response" description="Texts go out within seconds of a missed call — no delay, no lost leads." />
            <FeatureCard icon={MessageSquare} title="Natural Conversations" description="Our AI sounds human, not robotic. Customers love the experience." />
            <FeatureCard icon={Calendar} title="Auto Booking" description="Appointments are created and added to your calendar automatically." />
            <FeatureCard icon={Clock} title="24/7 Coverage" description="Works nights, weekends, and holidays. Never miss another opportunity." />
            <FeatureCard icon={Shield} title="Smart Escalation" description="Complex issues get flagged for human follow-up. You stay in control." />
            <FeatureCard icon={DollarSign} title="ROI Dashboard" description="See exactly how many calls were captured and appointments booked." />
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Built For Service Businesses</h2>
            <p className="text-gray-600">If you take appointments, we can help</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {['Dental Offices', 'Hair Salons', 'Medical Practices', 'HVAC Companies', 'Plumbers', 'Auto Shops', 'Law Firms', 'Spas & Wellness'].map((industry) => (
              <div key={industry} className="flex items-center space-x-2 bg-white border border-gray-200 p-4 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-gray-700">{industry}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing hint */}
      <section className="py-20 bg-blue-600">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">One Missed Call Could Cost You $1,200+</h2>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto text-lg">
            Our service pays for itself with just one recovered appointment per month.
          </p>
          <SignedOut>
            <Link href="/sign-up" className="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition inline-flex items-center">
              Start Your Free Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition inline-flex items-center">
              Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Phone className="h-6 w-6 text-blue-500" />
              <span className="text-white font-bold">MissedCall AI</span>
            </div>
            <p>&copy; {new Date().getFullYear()} MissedCall AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200">
      <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}