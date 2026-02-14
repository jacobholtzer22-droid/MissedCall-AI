'use client'

import { useState, useRef, useEffect } from 'react'
import { Phone, Send, RotateCcw, Bot, User, Building } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const industries = [
  'Dental Office',
  'Hair Salon / Barbershop',
  'HVAC Company',
  'Plumbing Company',
  'Medical Practice',
  'Auto Repair Shop',
  'Law Firm',
  'Spa / Wellness Center',
  'Veterinary Clinic',
  'Real Estate Agency',
  'Accounting / Tax Services',
  'My Business (Use My Settings)',
]

const quickMessagesByIndustry: Record<string, string[]> = {
  'Dental Office': [
    'I need to schedule a cleaning',
    'I have a toothache',
    'Do you accept Delta Dental insurance?',
    'My name is Sarah Johnson',
    'Can I come in tomorrow at 2pm?',
  ],
  'Hair Salon / Barbershop': [
    'I need a haircut',
    'Do you do hair coloring?',
    'Is Jessica available this Saturday?',
    'How much is a mens cut?',
    'I need to look good for a wedding this weekend',
  ],
  'HVAC Company': [
    'My AC stopped working',
    'I need a furnace tune-up',
    'Its an emergency - no heat and its freezing',
    'Can someone come out today?',
    'My address is 123 Main Street',
  ],
  'Plumbing Company': [
    'I have a leak under my sink',
    'My toilet is clogged',
    'Water is flooding my basement!',
    'How much do you charge for a service call?',
    'Can you come to 456 Oak Avenue?',
  ],
  'Medical Practice': [
    'I need to schedule a physical',
    'Im a new patient',
    'I have been feeling sick for a few days',
    'Do you accept Blue Cross insurance?',
    'Can I get an appointment this week?',
  ],
  'Auto Repair Shop': [
    'My check engine light is on',
    'I need an oil change',
    'My car wont start',
    'Its a 2019 Honda Accord',
    'How much is a brake inspection?',
  ],
  'Law Firm': [
    'I need help with a contract',
    'I was in a car accident',
    'Do you offer free consultations?',
    'I have a court date next week',
    'What areas of law do you practice?',
  ],
  'Spa / Wellness Center': [
    'I want to book a massage',
    'Do you have availability this weekend?',
    'Its for my birthday',
    'What types of facials do you offer?',
    'I want to buy a gift certificate',
  ],
  'Veterinary Clinic': [
    'My dog needs his shots',
    'My cat hasnt been eating',
    'Im a new client with a puppy',
    'Is this an emergency? He ate chocolate',
    'Do you see exotic pets?',
  ],
  'Real Estate Agency': [
    'Im looking to buy a house',
    'I want to sell my condo',
    'What homes are available in the downtown area?',
    'My budget is around 400k',
    'Im hoping to move in 3 months',
  ],
  'Accounting / Tax Services': [
    'I need help with my taxes',
    'Do you handle small business accounting?',
    'The tax deadline is coming up',
    'I got a letter from the IRS',
    'How much do you charge for tax prep?',
  ],
  'My Business (Use My Settings)': [
    'I need to schedule an appointment',
    'What services do you offer?',
    'How much does it cost?',
    'Do you have availability tomorrow?',
    'My name is John Smith',
  ],
}

export default function TestModePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [industry, setIndustry] = useState('My Business (Use My Settings)')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const startConversation = async () => {
    setMessages([])
    setLoading(true)

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'start', 
          simulateIndustry: industry === 'My Business (Use My Settings)' ? null : industry 
        })
      })
      const data = await res.json()
      
      if (data.message) {
        setMessages([{
          id: Date.now().toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        }])
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
    
    setLoading(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'message', 
          message: userMessage.content,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          simulateIndustry: industry === 'My Business (Use My Settings)' ? null : industry
        })
      })
      const data = await res.json()
      
      if (data.message) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        }])
      }

      if (data.appointmentBooked) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: '✅ APPOINTMENT BOOKED!\n\nName: ' + data.appointmentBooked.name + '\nService: ' + data.appointmentBooked.service + '\nDate/Time: ' + data.appointmentBooked.datetime,
          timestamp: new Date()
        }])
      }

      if (data.flaggedForCallback) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: '🚨 FLAGGED FOR HUMAN CALLBACK\nReason: ' + data.flaggedForCallback,
          timestamp: new Date()
        }])
      }
    } catch (error) {
      console.error('Error sending message:', error)
    }
    
    setLoading(false)
  }

  const quickMessages = quickMessagesByIndustry[industry] || quickMessagesByIndustry['My Business (Use My Settings)']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test Mode</h1>
        <p className="text-gray-500 mt-1">Simulate customer conversations with your AI assistant</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 flex flex-col h-[600px]">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 p-2 rounded-full">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Test Conversation</p>
                <p className="text-sm text-gray-500">Simulating: {industry}</p>
              </div>
            </div>
            <button onClick={startConversation} className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition">
              <RotateCcw className="h-4 w-4" />
              <span>New Call</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Simulate a Missed Call</h3>
                <p className="text-gray-500 max-w-sm mx-auto mb-6">Select an industry, then click Start Test Call to see how the AI greets and helps customers.</p>
                <button onClick={startConversation} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">Start Test Call</button>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start space-x-2 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <div className={`p-2 rounded-full flex-shrink-0 ${message.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {message.role === 'user' ? <User className="h-4 w-4 text-blue-600" /> : <Bot className="h-4 w-4 text-gray-600" />}
                      </div>
                      <div className={`rounded-2xl px-4 py-2 ${message.role === 'user' ? 'bg-blue-600 text-white' : message.content.startsWith('✅') ? 'bg-green-100 text-green-900' : message.content.startsWith('🚨') ? 'bg-yellow-100 text-yellow-900' : 'bg-gray-100 text-gray-900'}`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl px-4 py-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex space-x-4">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type as the customer..." disabled={messages.length === 0 || loading} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500" />
              <button onClick={sendMessage} disabled={!input.trim() || loading || messages.length === 0} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed">
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Building className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Test Different Industries</h3>
            </div>
            <select value={industry} onChange={(e) => { setIndustry(e.target.value); setMessages([]) }} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              {industry === 'My Business (Use My Settings)' ? 'Uses your actual business settings' : 'Simulates a ' + industry.toLowerCase()}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Messages</h3>
            <div className="space-y-2">
              {quickMessages.map((msg) => (
                <button key={msg} onClick={() => setInput(msg)} disabled={messages.length === 0} className="w-full text-left p-2 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200">{msg}</button>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Testing Tips</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>Try booking with name + service + time</li>
              <li>Test urgent/emergency scenarios</li>
              <li>Ask questions the AI cannot answer</li>
              <li>Switch industries to compare responses</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}