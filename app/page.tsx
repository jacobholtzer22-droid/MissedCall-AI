import Link from 'next/link'
import Image from 'next/image'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { Phone, MessageSquare, Calendar, ArrowRight, CheckCircle, Clock, DollarSign, Shield, Zap, ChevronDown, Play, Mail } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image src="/images/logo.png" alt="Align & Acquire" width={40} height={40} className="h-10 w-auto" />
              <div className="hidden sm:block">
                <span className="text-xl font-bold text-gray-900">MissedCall AI</span>
                <span className="text-xs text-gray-500 block -mt-1">by Align & Acquire</span>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition">How It Works</a>
              <a href="#demo" className="text-gray-600 hover:text-gray-900 transition">Demo</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900 transition">FAQ</a>
              <a href="#book-demo" className="text-gray-600 hover:text-gray-900 transition">Book a Demo</a>
            </div>
            <div className="flex items-center space-x-4">
              <SignedOut>
                <Link href="/sign-in" className="text-gray-600 hover:text-gray-900 transition hidden sm:block">Sign In</Link>
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

      {/* Hero with Phone Mockup */}
      <section className="py-20 bg-gradient-to-b from-blue-50 to-white overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-medium mb-6">
                Stop losing customers to voicemail
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Turn Missed Calls Into <span className="text-blue-600">Booked Appointments</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                When you cant answer the phone, our AI instantly texts the caller, understands what they need, and books appointments — 24/7, automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="#book-demo" className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
                  Book a Free Demo <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <a href="#demo" className="border border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center">
                  <Play className="mr-2 h-5 w-5" /> Watch It Work
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

      {/* Demo Video Section */}
      <section id="demo" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">See It In Action</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Watch how MissedCall AI turns a missed call into a booked appointment in under 2 minutes</p>
          </div>
          <div className="max-w-4xl mx-auto">
            {/* VIDEO PLACEHOLDER - Replace with your video embed */}
            <div className="aspect-video bg-gray-900 rounded-2xl flex items-center justify-center relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/20"></div>
              <div className="text-center z-10">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg cursor-pointer hover:scale-110 transition">
                  <Play className="h-8 w-8 text-blue-600 ml-1" />
                </div>
                <p className="text-white text-lg">Watch Demo Video</p>
                <p className="text-gray-300 text-sm mt-2">1:47 minutes</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
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

      {/* Guarantee */}
      <section className="py-20 bg-green-50">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Guarantee</h2>
            <p className="text-xl text-gray-700 mb-6">
              If MissedCall AI doesnt book at least one appointment in your first month, we will give you a full refund. No questions asked.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-gray-600">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span>Cancel anytime</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span>No long-term contracts</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span>30-day money back</span>
              </div>
            </div>
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

      {/* FAQ */}
      <section id="faq" className="py-20 bg-gray-50">
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
              answer="Plans start at $299/month and include unlimited AI conversations. The service typically pays for itself with just one recovered appointment. Book a demo and well find the right plan for your business."
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
      <section id="book-demo" className="py-20 bg-blue-600">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-4">Book a Free Demo</h2>
              <p className="text-blue-100 text-lg">See how MissedCall AI can work for your business. Well give you a personalized walkthrough.</p>
            </div>
            <form action="/api/book-demo" method="POST" className="bg-white rounded-2xl p-8 shadow-xl">
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                  <input type="text" name="name" required placeholder="John Smith" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                  <input type="text" name="business" required placeholder="Smith Dental" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input type="email" name="email" required placeholder="john@smithdental.com" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input type="tel" name="phone" required placeholder="(555) 123-4567" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
                <select name="businessType" required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select your industry...</option>
                  <option value="dental">Dental Office</option>
                  <option value="salon">Hair Salon / Barbershop</option>
                  <option value="medical">Medical Practice</option>
                  <option value="hvac">HVAC</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="auto">Auto Repair</option>
                  <option value="legal">Law Firm</option>
                  <option value="spa">Spa / Wellness</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center">
                <Mail className="mr-2 h-5 w-5" /> Request Demo
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">Well email you to schedule a Zoom call within 24 hours</p>
            </form>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Stop Losing Customers?</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">Join hundreds of businesses using MissedCall AI to capture every opportunity.</p>
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
              <Image src="/images/logo.png" alt="Align & Acquire" width={32} height={32} className="h-8 w-auto" />
              <div>
                <span className="text-white font-bold">MissedCall AI</span>
                <span className="text-xs text-gray-500 block">A product by Align & Acquire</span>
              </div>
            </div>
            <div className="flex space-x-8 mb-4 md:mb-0">
              <a href="#how-it-works" className="hover:text-white transition">How It Works</a>
              <a href="#faq" className="hover:text-white transition">FAQ</a>
              <a href="#book-demo" className="hover:text-white transition">Book Demo</a>
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