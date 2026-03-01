import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { getIndustryDefaults } from '@/lib/industry-defaults'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { business: true }
    })

    if (!user?.business) {
      return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    const body = await request.json()
    const { action, message, history, simulateIndustry } = body

    // Get business info - either real or simulated
    let businessName: string
    let services: string[]
    let aiContext: string
    let aiInstructions: string
    let greeting: string
    let urgencyKeywords: string[]

    if (simulateIndustry) {
      // Use industry defaults for simulation
      const defaults = getIndustryDefaults(simulateIndustry)
      businessName = 'Demo ' + defaults.name
      services = defaults.services
      aiContext = 'Business Type: ' + defaults.name
      aiInstructions = defaults.specialInstructions + '\n\nIMPORTANT QUESTIONS TO ASK:\n' + defaults.questions.map((q, i) => (i + 1) + '. ' + q).join('\n')
      greeting = defaults.sampleGreeting.replace('[Business Name]', businessName)
      urgencyKeywords = defaults.urgencyKeywords
    } else {
      // Use real business settings
      const business = user.business
      businessName = business.name
      services = Array.isArray(business.servicesOffered) ? business.servicesOffered as string[] : []
      aiContext = business.aiContext || ''
      aiInstructions = business.aiInstructions || ''
      greeting = business.aiGreeting || 'Hi! Sorry we missed your call at ' + businessName + '. How can I help you today?'
      urgencyKeywords = ['emergency', 'urgent', 'asap']
    }

    // Start new conversation
    if (action === 'start') {
      return NextResponse.json({ message: greeting })
    }

    // Handle message
    if (action === 'message') {
      const conversationHistory = [
        ...(history || []).map((msg: { role: string; content: string }) => ({
          role: msg.role === 'user' ? 'user' : 'assistant' as const,
          content: msg.content
        })),
        { role: 'user' as const, content: message }
      ]

      // Check for urgency
      const isUrgent = urgencyKeywords.some(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
      )

      const systemPrompt = `You are a friendly SMS assistant for ${businessName}. You are helping someone who tried to call but could not get through.

YOUR GOALS:
1. Be helpful, friendly, and brief (SMS should be under 160 characters when possible)
2. Understand what the customer needs
3. If they want to schedule a quote: get their name, service needed, and preferred date/time for a free in-person quote visit
4. Answer questions about the business IF you have the information
5. If you cannot help or do not have the information, offer to have someone call them back

BUSINESS INFO:
- Name: ${businessName}
- Services offered: ${services.length > 0 ? services.join(', ') : 'General services'}
${aiContext ? '- Context: ' + aiContext : ''}

SPECIAL INSTRUCTIONS:
${aiInstructions || 'Be helpful and professional.'}

${isUrgent ? 'NOTE: This seems URGENT. Prioritize getting their contact info and flag for immediate callback.' : ''}

IMPORTANT RULES:
- Keep responses SHORT (1-2 sentences is ideal for SMS)
- Be warm and natural, not robotic
- NEVER make up information you do not have
- If asked about pricing, hours, or details you do not know, say: "I do not have that information handy, but I can have someone call you back with those details!"
- If someone seems upset or frustrated, acknowledge their feelings and offer human callback

WHEN YOU CANNOT HELP:
Say something like: "I do not have that information, but I will have someone from our team call you back shortly to help!"
Then add this tag at the end: [CALLBACK_NEEDED: reason="customer asked about pricing"]

WHEN QUOTE VISIT IS CONFIRMED (you have name + service + date/time):
Say something like: "You're all set! [Business name] will meet you on [Date] at [Time] to take a look and give you a quote for [service]."
Then add this EXACT tag at the end of your message:
[APPOINTMENT_BOOKED: name="John Smith", service="Teeth Cleaning", datetime="2024-01-15 14:00", notes=""]

WHEN URGENT/EMERGENCY:
Acknowledge the urgency, get their callback number if not already known, and add:
[CALLBACK_NEEDED: reason="URGENT - customer emergency"]`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: systemPrompt,
        messages: conversationHistory,
      })

      const textContent = response.content.find(block => block.type === 'text')
      let aiResponse = textContent?.text || 'I am having trouble right now. Someone will call you back shortly!'

      // Check for appointment booking
      const appointmentMatch = aiResponse.match(/\[APPOINTMENT_BOOKED: name="([^"]+)", service="([^"]+)", datetime="([^"]+)"(?:, notes="([^"]*)")?\]/)
      
      let appointmentBooked = null
      if (appointmentMatch) {
        appointmentBooked = {
          name: appointmentMatch[1],
          service: appointmentMatch[2],
          datetime: appointmentMatch[3],
          notes: appointmentMatch[4] || ''
        }
      }

      // Check for callback needed
      const callbackMatch = aiResponse.match(/\[CALLBACK_NEEDED: reason="([^"]+)"\]/)
      let flaggedForCallback = null
      if (callbackMatch) {
        flaggedForCallback = callbackMatch[1]
      }

      // Clean the response
      const cleanResponse = aiResponse
        .replace(/\[APPOINTMENT_BOOKED:.*?\]/g, '')
        .replace(/\[CALLBACK_NEEDED:.*?\]/g, '')
        .replace(/\[HUMAN_NEEDED\]/g, '')
        .trim()

      return NextResponse.json({ 
        message: cleanResponse,
        appointmentBooked,
        flaggedForCallback
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Test chat error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}