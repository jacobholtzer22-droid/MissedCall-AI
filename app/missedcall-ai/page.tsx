import Link from 'next/link'
import Image from 'next/image'
import DemoForm from '../components/DemoForm'
import { Logo } from '@/app/components/Logo'
import { Phone, MessageSquare, Calendar, ArrowRight, CheckCircle, Clock, DollarSign, Shield, Zap, ChevronDown } from 'lucide-react'
import ROICalculator from '../components/roi-calculator'
import ScrollReveal from '../components/ScrollReveal'
import CountUp from '../components/CountUp'
import Marquee from '../components/Marquee'
import ScrollToBookDemoLink from '../components/ScrollToBookDemoLink'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero with Phone Mockup */}
      <section className="relative pt-36 pb-20 overflow-hidden">
        {/* Animated Gradient Mesh */}
        <div className="absolute inset-0 gradient-mesh"></div>

        {/* Floating dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-[15%] w-3 h-3 bg-blue-400/30 rounded-full animate-float"></div>
          <div className="absolute top-[40%] left-[5%] w-2 h-2 bg-purple-400/40 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-[20%] right-[8%] w-4 h-4 bg-blue-400/20 rounded-full animate-float" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-blue-500/20 text-blue-400 px-4 py-1 rounded-full text-sm font-medium mb-6 border border-blue-500/30">
                📞 Your phone&apos;s ringing. You can&apos;t answer. Now what?
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
                Every Missed Call is <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Money Walking Away</span>
              </h1>
              <p className="text-xl text-gray-400 mb-8">
                You&apos;re busy. We get it. So we built an AI that texts back instantly, books the appointment, and saves the sale — while you focus on the job in front of you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <ScrollToBookDemoLink className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition flex items-center justify-center">
                  I Want In <ArrowRight className="ml-2 h-5 w-5" />
                </ScrollToBookDemoLink>
              </div>
              <p className="text-sm text-gray-500 mt-4">Free demo. No credit card. No pitch deck.</p>
            </div>
            
            {/* Phone Mockup */}
            <div className="flex justify-center lg:justify-end">
              <ScrollReveal delay={300}>
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
                  
                  <div className="absolute -right-4 top-20 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-float">
                    ✓ Appointment Booked!
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee - Pain Points */}
      <div className="border-y border-white/5 bg-gray-900/30 py-4">
        <Marquee
          items={[
            '62% of callers won\'t leave a voicemail',
            '85% of missed calls never call back',
            'Average lost customer = $1,200',
            'Your competitors answer on the first ring',
            'Every missed call is a missed paycheck',
          ]}
          separator="✦"
          speed="normal"
          className="text-red-400/60 text-sm font-medium tracking-wide"
        />
      </div>

      {/* ROI Calculator */}
      <section id="roi-calculator" className="py-16 md:py-20 scroll-mt-24 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <ROICalculator />
          </ScrollReveal>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-white/10">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-gray-500 uppercase tracking-widest mb-8 font-medium">The math doesn&apos;t lie</p>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <CountUp
                end={62}
                suffix="%"
                className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              />
              <p className="text-gray-400 mt-1">of callers won&apos;t leave a voicemail</p>
            </div>
            <div>
              <CountUp
                end={85}
                suffix="%"
                className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              />
              <p className="text-gray-400 mt-1">of missed calls never call back</p>
            </div>
            <div>
              <CountUp
                end={1200}
                prefix="$"
                className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              />
              <p className="text-gray-400 mt-1">average value of a lost customer</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 scroll-mt-24 grid-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Here&apos;s the Deal 🤝</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Three steps. That&apos;s it. You miss a call, we save the sale.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="scroll-reveal text-center p-8 rounded-2xl bg-gray-900 border border-white/10 card-hover">
                <div className="bg-blue-500/20 text-blue-400 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold card-icon">1</div>
                <Phone className="h-10 w-10 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">You Miss a Call</h3>
                <p className="text-gray-400">You&apos;re on a ladder, in the chair, under the hood — life happens.</p>
              </div>
              <div className="scroll-reveal text-center p-8 rounded-2xl bg-gray-900 border border-white/10 card-hover">
                <div className="bg-blue-500/20 text-blue-400 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold card-icon">2</div>
                <MessageSquare className="h-10 w-10 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">AI Texts Instantly</h3>
                <p className="text-gray-400">Within seconds: &ldquo;Sorry we missed you! How can we help?&rdquo; Feels human. Works like magic.</p>
              </div>
              <div className="scroll-reveal text-center p-8 rounded-2xl bg-gray-900 border border-white/10 card-hover">
                <div className="bg-blue-500/20 text-blue-400 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold card-icon">3</div>
                <Calendar className="h-10 w-10 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">Appointment Booked</h3>
                <p className="text-gray-400">Name, info, appointment — done. It shows up on your calendar. You show up and get paid.</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 dot-pattern">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Everything Under the Hood 🔧</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Revenue recovery that works while you sleep</p>
            </div>
          </ScrollReveal>
          <ScrollReveal stagger>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <FeatureCard icon={Zap} title="Instant Response" description="Texts go out within seconds. No delay, no lost leads. Faster than any human." />
              <FeatureCard icon={MessageSquare} title="Natural Conversations" description="Our AI sounds human, not robotic. Customers have no idea they're talking to a bot." />
              <FeatureCard icon={Calendar} title="Auto Booking" description="Appointments created and added to your calendar. No back-and-forth needed." />
              <FeatureCard icon={Clock} title="24/7 Coverage" description="Nights, weekends, holidays. Your AI never calls in sick." />
              <FeatureCard icon={Shield} title="Smart Escalation" description="Complex stuff gets flagged for you. You stay in control of the hard calls." />
              <FeatureCard icon={DollarSign} title="ROI Dashboard" description="See exactly how much revenue you've recovered. Real numbers, not guesses." />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Industries */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Built for People Who Work With Their Hands 🛠️</h2>
              <p className="text-gray-400">If you take appointments and miss calls, this is for you.</p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {['Landscaping & Lawn Care', 'Car Detailing', 'HVAC', 'Other Service Businesses'].map((industry) => (
                <div key={industry} className="flex items-center space-x-2 bg-gray-900 border border-white/10 p-4 rounded-lg card-hover">
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                  <span className="text-gray-300">{industry}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 bg-gray-900/50 scroll-mt-24">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">You&apos;ve Got Questions. We&apos;ve Got Answers. 💬</h2>
            </div>
          </ScrollReveal>
          <div className="max-w-3xl mx-auto space-y-4">
            <ScrollReveal>
              <FAQItem 
                question="How does it work with my existing phone number?" 
                answer="You keep your number. Set up call forwarding so unanswered calls go to your MissedCall AI number. Your customers never see the difference — they just get a helpful text when you can't answer."
              />
            </ScrollReveal>
            <ScrollReveal delay={50}>
              <FAQItem 
                question="What if the AI can't help a customer?" 
                answer="It knows its limits. Complex or frustrated customers get flagged for human follow-up. You get notified, and they get a real person calling back."
              />
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <FAQItem 
                question="How much does it cost?" 
                answer="Startup fee starting at $500. Plans start at $250/month with unlimited AI conversations. It typically pays for itself with one recovered appointment. Book a demo and we'll find the right plan."
              />
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <FAQItem 
                question="Can I customize what the AI says?" 
                answer="100%. Greeting, services, special instructions, business hours — you control all of it. The AI adapts to your specific business."
              />
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <FAQItem 
                question="How long does setup take?" 
                answer="Most businesses are live in under 15 minutes. We walk you through everything."
              />
            </ScrollReveal>
            <ScrollReveal delay={250}>
              <FAQItem 
                question="What if I want to cancel?" 
                answer="No contracts. Cancel anytime. 30-day money-back guarantee. We're confident you won't want to, though."
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Book a Demo Form */}
      <section id="book-demo" className="py-20 scroll-mt-24">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="relative max-w-2xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 md:p-12">
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-bold text-white mb-4">See It in Action 🚀</h2>
                  <p className="text-blue-100 text-lg">15 minutes. No pressure. We&apos;ll show you exactly how many calls you&apos;re losing and how to get them back.</p>
                </div>
                <DemoForm />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <ScrollReveal>
            <h2 className="text-3xl font-bold mb-4">Still On The Fence?</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">Every day you wait is another day of missed calls turning into your competitor&apos;s revenue. Just saying.</p>
            <Link href="/book" className="cta-hover bg-white text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-200 transition inline-flex items-center">
              Stop Losing Leads <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
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
              <a href="#how-it-works" className="text-gray-500 hover:text-white transition">How It Works</a>
              <a href="#roi-calculator" className="text-gray-500 hover:text-white transition">ROI Calculator</a>
              <a href="#faq" className="text-gray-500 hover:text-white transition">FAQ</a>
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

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="scroll-reveal bg-gray-900 p-6 rounded-xl border border-white/10 card-hover">
      <div className="bg-blue-500/20 w-12 h-12 rounded-lg flex items-center justify-center mb-4 card-icon">
        <Icon className="h-6 w-6 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group bg-gray-900 rounded-xl border border-white/10 overflow-hidden">
      <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
        <span className="font-semibold">{question}</span>
        <ChevronDown className="h-5 w-5 text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="px-6 pb-6 text-gray-400">
        {answer}
      </div>
    </details>
  )
}
