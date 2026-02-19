import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { sendLeadCapturedEmail, sendAppointmentBookedEmail } from '@/lib/email'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// SAFEGUARD SETTINGS
const MAX_MESSAGES_PER_CONVERSATION = 20
const CONVERSATION_TIMEOUT_HOURS = 72
const SPAM_WINDOW_SECONDS = 30

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const messageSid = formData.get('MessageSid') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const body = formData.get('Body') as string
    
    console.log('💬 Incoming SMS:', { messageSid, from, to, body })

    // Find business
    const business = await db.business.findFirst({
      where: { twilioPhoneNumber: to },
    })

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      return new NextResponse('OK', { status: 200 })
    }

    // Check for STOP/unsubscribe
    const stopWords = ['stop', 'unsubscribe', 'cancel', 'quit']
    if (stopWords.includes(body.toLowerCase().trim())) {
      console.log('🛑 User requested STOP')
      await sendSMS(business, from, "You've been unsubscribed. Reply START to resubscribe.")
      return new NextResponse('OK', { status: 200 })
    }

    // Find or create conversation
    let conversation = await db.conversation.findFirst({
      where: {
        businessId: business.id,
        callerPhone: from,
        status: 'active',
        createdAt: { gte: new Date(Date.now() - CONVERSATION_TIMEOUT_HOURS * 60 * 60 * 1000) }
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 }
      }
    })

    // Create new conversation if none exists
    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          businessId: business.id,
          callerPhone: from,
          status: 'active',
        },
        include: { messages: true }
      })
    }

    // SAFEGUARD: Check for spam (same message within 30 seconds)
    const recentMessage = conversation.messages.find(m => 
      m.direction === 'inbound' && 
      m.content === body &&
      new Date(m.createdAt).getTime() > Date.now() - SPAM_WINDOW_SECONDS * 1000
    )
    if (recentMessage) {
      console.log('🚫 Spam detected, ignoring duplicate message')
      return new NextResponse('OK', { status: 200 })
    }

    // SAFEGUARD: Check message limit
    const messageCount = conversation.messages.length
    if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      console.log('⚠️ Conversation hit message limit')
      await db.conversation.update({
        where: { id: conversation.id },
        data: { status: 'completed', summary: 'Conversation ended - message limit reached' }
      })
      await sendSMS(business, from, `Thanks for chatting! For further assistance, please call us directly at ${business.twilioPhoneNumber}. A team member will be happy to help!`)
      return new NextResponse('OK', { status: 200 })
    }

    // Save incoming message
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        content: body,
        twilioSid: messageSid,
      }
    })

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    })

    // Refresh conversation with new message
    conversation = await db.conversation.findUnique({
      where: { id: conversation.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })

    if (!conversation) {
      return new NextResponse('OK', { status: 200 })
    }

    // Generate AI response
    const aiResponse = await generateAIResponse(business, conversation, body)

    // Check if appointment was booked
    const appointmentMatch = aiResponse.match(/\[APPOINTMENT_BOOKED: name="([^"]+)", service="([^"]+)", datetime="([^"]+)"(?:, notes="([^"]*)")?\]/)
    
    if (appointmentMatch) {
      const [, name, service, datetime, notes] = appointmentMatch

      // Create appointment
      await db.appointment.create({
        data: {
          businessId: business.id,
          conversationId: conversation.id,
          customerName: name,
          customerPhone: from,
          serviceType: service,
          scheduledAt: new Date(datetime),
          notes: notes || null,
          status: 'confirmed'
        }
      })

      // Update conversation
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'appointment_booked',
          callerName: name,
          intent: 'book_appointment',
          serviceRequested: service
        }
      })

      console.log('📅 Appointment booked:', { name, service, datetime })

      // Email owner
      const ownerUser = await db.user.findFirst({
        where: { businessId: business.id, role: 'owner' },
        select: { email: true },
      })
      if (ownerUser?.email) {
        await sendAppointmentBookedEmail({
          ownerEmail: ownerUser.email,
          businessName: business.name,
          customerName: name,
          customerPhone: from,
          service,
          datetime,
          notes,
        })
      }
    }

    // Check if caller gave their name for the first time
    const nameCapMatch = aiResponse.match(/\[NAME_CAPTURED: name="([^"]+)"\]/)
    if (nameCapMatch && !conversation.callerName) {
      const capturedName = nameCapMatch[1]
      await db.conversation.update({
        where: { id: conversation.id },
        data: { callerName: capturedName },
      })
      console.log('👤 Caller name captured:', capturedName)

      // Email owner with lead info
      const ownerUser = await db.user.findFirst({
        where: { businessId: business.id, role: 'owner' },
        select: { email: true },
      })
      if (ownerUser?.email) {
        await sendLeadCapturedEmail({
          ownerEmail: ownerUser.email,
          businessName: business.name,
          callerName: capturedName,
          callerPhone: from,
        })
      }
    }

    // Clean AI response (remove any tags)
    const cleanResponse = aiResponse
      .replace(/\[APPOINTMENT_BOOKED:.*?\]/g, '')
      .replace(/\[NAME_CAPTURED:.*?\]/g, '')
      .replace(/\[HUMAN_NEEDED\]/g, '')
      .trim()

    // Check if human needed
    if (aiResponse.includes('[HUMAN_NEEDED]')) {
      await db.conversation.update({
        where: { id: conversation.id },
        data: { status: 'needs_review', intent: 'human_needed' }
      })
      console.log('🚨 Flagged for human review')
    }

    // Send response
    await sendSMSAndLog(business, conversation.id, from, cleanResponse)

    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )

  } catch (error) {
    console.error('❌ Error handling SMS webhook:', error)
    return new NextResponse('Error', { status: 500 })
  }
}

async function generateAIResponse(
  business: any,
  conversation: any,
  latestMessage: string
): Promise<string> {
  
  const conversationHistory = conversation.messages.map((msg: any) => ({
    role: msg.direction === 'inbound' ? 'user' : 'assistant' as const,
    content: msg.content
  }))

  const systemPrompt = `You are a friendly SMS assistant for ${business.name}. You're helping someone who tried to call.

GOALS:
1. Be helpful, friendly, and brief (SMS should be under 160 chars when possible)
2. Understand what they need
3. If they want an appointment: get their name, service needed, and preferred date/time
4. Answer questions about the business
5. If you can't help or they're upset, flag for human follow-up

BUSINESS INFO:
- Name: ${business.name}
- Services: ${JSON.stringify(business.servicesOffered) || 'General services'}
${business.aiContext ? `- About: ${business.aiContext}` : ''}
${business.aiInstructions ? `- Instructions: ${business.aiInstructions}` : ''}

RULES:
- Keep responses SHORT (1-2 sentences ideal)
- Be warm and natural, not robotic
- Don't make up information
- If someone seems upset or you can't help, add [HUMAN_NEEDED] at the end

WHEN YOU LEARN THE CALLER'S NAME FOR THE FIRST TIME:
Add this EXACT tag at the end of your message (only the very first time they give their name, never again after that):
[NAME_CAPTURED: name="John Smith"]

WHEN BOOKING IS CONFIRMED (you have name + service + date/time):
Add this EXACT tag at the end of your message:
[APPOINTMENT_BOOKED: name="John Smith", service="Teeth Cleaning", datetime="2024-01-15 14:00", notes="First time patient"]

Example conversation:
User: "Hi I need to schedule a cleaning"
Assistant: "Hi! I'd be happy to help schedule a cleaning. What's your name?"
User: "Sarah Johnson" 
Assistant: "Thanks Sarah! When works best for you? We have openings this week."
User: "Thursday at 2pm"
Assistant: "Perfect! I've got you down for a teeth cleaning on Thursday at 2pm. See you then! [APPOINTMENT_BOOKED: name="Sarah Johnson", service="Teeth Cleaning", datetime="2024-01-18 14:00", notes=""]"`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: systemPrompt,
      messages: conversationHistory,
    })

    const textContent = response.content.find(block => block.type === 'text')
    return textContent?.text || "I'm having trouble right now. Someone will call you back shortly!"

  } catch (error) {
    console.error('❌ Error generating AI response:', error)
    return "I'm having trouble right now. Someone from our team will get back to you shortly!"
  }
}

async function sendSMS(business: any, to: string, message: string) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  await twilioClient.messages.create({
    body: message,
    from: business.twilioPhoneNumber!,
    to: to,
  })
}

async function sendSMSAndLog(business: any, conversationId: string, to: string, message: string) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  
  try {
    const smsMessage = await twilioClient.messages.create({
      body: message,
      from: business.twilioPhoneNumber!,
      to: to,
    })

    await db.message.create({
      data: {
        conversationId: conversationId,
        direction: 'outbound',
        content: message,
        twilioSid: smsMessage.sid,
        twilioStatus: smsMessage.status,
      }
    })

    console.log('📤 Sent AI response:', smsMessage.sid)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}