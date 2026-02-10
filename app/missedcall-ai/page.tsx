import Link from 'next/link'
import Image from 'next/image'
import DemoForm from '../components/DemoForm'
import { Phone, MessageSquare, Calendar, ArrowRight, CheckCircle, Clock, DollarSign, Shield, Zap, ChevronDown } from 'lucide-react'
import ROICalculator from '../components/roi-calculator'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <Image src="/images/logo.png" alt="Align & Acquire" width={160} height={160} className="h-20 w-auto mix-blend-multiply" priority unoptimized />
              <div className="hidden sm:block">
                <span className="text-xl font-bold text-gray-900">MissedCall AI</span>
                <span className="text-xs text-gray-500 block -mt-1">by Align & Acquire</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition">Home</Link>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition">How It Works</a>
              <a href="#roi-calculator" className="text-gray-600 hover:text-gray-900 transition">ROI Calculator</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900 transition">FAQ</a>
              <Link href="/websites" className="text-gray-600 hover:text-gray-900 transition">Websites</Link>
            </div>
            <a href="#book-demo" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              Book a Demo
            </a>
          </div>
        </div>
      </nav>

      {/* Hero with Phone Mockup */}
      <section className="py-20 bg-gradient-to-b from-blue-50 to-white overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-medium mb-6">
                Missed revenue recovery
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Recover Revenue From <span className="text-blue-600">Every Missed Call</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                When you can't answer the phone, our AI instantly texts the caller, books appointments, and turns lost leads into revenue — 24/7, automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="#book-demo" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
                  Book a Free Demo <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
              <p className="text-sm text-gray-500 mt-4">No credit card required</p>
            </div>
            
            {/* Phone Mockup */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <div className="w-[300px] h-[600px] bg-gray-900 rounded-[3rem] p-3 shadow-2xl">
                  <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden flex flex-col">
                    <div className="bg-gray-100 px-6 py-4 flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <Phone className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Smith Dental</p>
                        <p className="text-xs text-gray-500">AI Assistant</p>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-4 space-y-3 bg-gray-50">
                      <div className="flex justify-start">
                        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                          <p className="text-sm text-gray-800">Hi! Sorry we missed your call at Smith Dental. How can I help you today?</p>
                          <p className="text-xs text-gray-400 mt-1">2:34 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <div className="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                          <p className="text-sm text-white">I need to schedule a cleaning</p>
                          <p className="text-xs text-blue-200 mt-1">2:35 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-start">
                        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                          <p className="text-sm text-gray-800">Id be happy to help! Whats your name?</p>
                          <p className="text-xs text-gray-400 mt-1">2:35 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <div className="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                          <p className="text-sm text-white">Sarah Johnson</p>
                          <p className="text-xs text-blue-200 mt-1">2:36 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-start">
                        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                          <p className="text-sm text-gray-800">Thanks Sarah! When works best for you?</p>
                          <p className="text-xs text-gray-400 mt-1">2:36 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <div className="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                          <p className="text-sm text-white">Thursday at 2pm?</p>
                          <p className="text-xs text-blue-200 mt-1">2:37 PM</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-start">
                        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                          <p className="text-sm text-gray-800">Perfect! Youre booked for Thursday at 2pm. See you then!</p>
                          <p className="text-xs text-gray-400 mt-1">2:37 PM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="absolute -right-4 top-20 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                  ✓ Appointment Booked!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section id="roi-calculator" className="py-16 md:py-20 scroll-mt-24">
        <div className="container mx-auto px-6">
          <ROICalculator />
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-gray-100">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-gray-900">62%</p>
              <p className="text-gray-600">of callers wont leave a voicemail</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-gray-900">85%</p>
              <p className="text-gray-600">of missed calls never call back</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-gray-900">$1,200</p>
              <p className="text-gray-600">average value of a lost customer <span className="text-gray-500 text-sm">(based on industry)</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 scroll-mt-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Three simple steps to recover revenue from every missed call</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-8 rounded-2xl bg-gray-50">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">1</div>
              <Phone className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Call Goes Unanswered</h3>
              <p className="text-gray-600">Customer calls while youre busy with another client, driving, or after hours.</p>
            </div>
            <div className="text-center p-8 rounded-2xl bg-gray-50">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">2</div>
              <MessageSquare className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">AI Texts Instantly</h3>
              <p className="text-gray-600">Within seconds, they get a text: Sorry we missed you! How can we help?</p>
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
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything You Need</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Missed revenue recovery that works while you sleep</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <FeatureCard icon={Zap} title="Instant Response" description="Texts go out within seconds of a missed call — no delay, no lost leads." />
            <FeatureCard icon={MessageSquare} title="Natural Conversations" description="Our AI sounds human, not robotic. Customers love the experience." />
            <FeatureCard icon={Calendar} title="Auto Booking" description="Appointments are created and added to your calendar automatically." />
            <FeatureCard icon={Clock} title="24/7 Coverage" description="Works nights, weekends, and holidays. Never miss another opportunity." />
            <FeatureCard icon={Shield} title="Smart Escalation" description="Complex issues get flagged for human follow-up. You stay in control." />
            <FeatureCard icon={DollarSign} title="ROI Dashboard" description="See exactly how much revenue you've recovered — calls captured and appointments booked." />
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Built For Service Businesses</h2>
            <p className="text-gray-600">Recover missed revenue — if you take appointments, we can help</p>
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

      {/* FAQ */}
      <section id="faq" className="py-20 bg-gray-50 scroll-mt-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            <FAQItem 
              question="How does it work with my existing phone number?" 
              answer="You keep your existing business number. You simply set up call forwarding so unanswered calls go to your MissedCall AI number. Your customers never see the difference — they just get a helpful text when you cant answer."
            />
            <FAQItem 
              question="What if the AI cant help a customer?" 
              answer="The AI is smart enough to know its limits. If a customer asks something complex or seems frustrated, it will flag the conversation for human follow-up and let them know someone will call them back."
            />
            <FAQItem 
              question="How much does it cost?" 
              answer="Startup fee starting at $500. Plans start at $250/month and include unlimited AI conversations. The service typically pays for itself with just one recovered appointment — that's missed revenue back in your pocket. Book a demo and we'll find the right plan for your business."
            />
            <FAQItem 
              question="Can I customize what the AI says?" 
              answer="Absolutely! You can customize the greeting message, the services offered, special instructions, and more. The AI adapts to your specific business."
            />
            <FAQItem 
              question="How long does setup take?" 
              answer="Most businesses are up and running in under 15 minutes. We walk you through connecting your phone number and customizing your AI assistant."
            />
            <FAQItem 
              question="What if I want to cancel?" 
              answer="No long-term contracts. Cancel anytime with no fees. We also offer a 30-day money-back guarantee if youre not satisfied."
            />
          </div>
        </div>
      </section>

      {/* Book a Demo Form */}
      <section id="book-demo" className="py-20 bg-blue-600 scroll-mt-24">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-4">Book a Free Demo</h2>
              <p className="text-blue-100 text-lg">See how MissedCall AI recovers missed revenue for your business. We'll give you a personalized walkthrough.</p>
            </div>
            <DemoForm />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Recover Your Missed Revenue?</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">Book your free demo today and see how much you're actually losing in a month.</p>
          <a href="#book-demo" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition inline-flex items-center">
            Book Your Free Demo <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <span className="inline-flex items-center justify-center rounded-xl bg-white p-2 shadow-sm">
              <Image src="/images/logo.png" alt="Align & Acquire" width={128} height={128} className="h-14 w-auto" unoptimized />
            </span>
              <div>
                <span className="text-white font-bold">MissedCall AI</span>
                <span className="text-xs text-gray-500 block">A product by Align & Acquire</span>
              </div>
            </div>
            <div className="flex space-x-8 mb-4 md:mb-0">
              <a href="#how-it-works" className="hover:text-white transition">How It Works</a>
              <a href="#roi-calculator" className="hover:text-white transition">ROI Calculator</a>
              <a href="#faq" className="hover:text-white transition">FAQ</a>
              <a href="#book-demo" className="hover:text-white transition">Make a Specialized Plan</a>
            </div>
            <p>© {new Date().getFullYear()} Align & Acquire. All rights reserved.</p>
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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group bg-white rounded-xl border border-gray-200 overflow-hidden">
      <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
        <span className="font-semibold text-gray-900">{question}</span>
        <ChevronDown className="h-5 w-5 text-gray-500 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="px-6 pb-6 text-gray-600">
        {answer}
      </div>
    </details>
  )
}