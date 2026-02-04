// ===========================================
// TWILIO VOICE WEBHOOK
// ===========================================
// This endpoint is called by Twilio when a call comes in
// We detect missed calls and trigger the SMS follow-up

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import twilio from 'twilio'

// Twilio sends POST requests to this endpoint
export async function POST(request: NextRequest) {
  try {
    // Parse the form data from Twilio
    const formData = await request.formData()
    
    // Extract call information
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string           // Caller's phone number
    const to = formData.get('To') as string               // Your Twilio number
    const direction = formData.get('Direction') as string
    
    console.log('📞 Incoming call webhook:', { callSid, callStatus, from, to, direction })

    // Find which business owns this phone number
    const business = await db.business.findFirst({
      where: { twilioPhoneNumber: to }
    })

    if (!business) {
      console.log('⚠️ No business found for phone number:', to)
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Sorry, this number is not configured. Please try again later.</Say>
        </Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    // Handle the call - send SMS on ringing, no-answer, or busy
    if (callStatus === 'ringing' || callStatus === 'no-answer' || callStatus === 'busy') {
      // Check if we already have a conversation with this caller recently
      const existingConversation = await db.conversation.findFirst({
        where: {
          businessId: business.id,
          callerPhone: from,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })

      if (!existingConversation) {
        // Create a new conversation
        const conversation = await db.conversation.create({
          data: {
            businessId: business.id,
            callerPhone: from,
            status: 'active',
          }
        })

        console.log('📝 Created conversation:', conversation.id)

        // Send the initial SMS
        await sendInitialSMS(business, conversation, from)
      } else {
        console.log('📱 Existing conversation found, skipping SMS')
      }
    }

    // Return TwiML response
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Sorry, we are unable to take your call right now. We will text you shortly to help with your request.</Say>
      </Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )

  } catch (error) {
    console.error('❌ Error handling voice webhook:', error)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>An error occurred. Please try again later.</Say>
      </Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
}

// Send the initial SMS when a call is missed
async function sendInitialSMS(
  business: { id: string; name: string; aiGreeting: string | null; twilioPhoneNumber: string | null },
  conversation: { id: string },
  callerPhone: string
) {
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  const greeting = business.aiGreeting || 
    `Hi! Sorry we missed your call at ${business.name}. I'm an automated assistant - how can I help you today?`

  try {
    const message = await twilioClient.messages.create({
      body: greeting,
      from: business.twilioPhoneNumber!,
      to: callerPhone,
    })

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: greeting,
        twilioSid: message.sid,
        twilioStatus: message.status,
      }
    })

    console.log('📤 Sent initial SMS:', message.sid)
  } catch (error) {
    console.error('❌ Error sending SMS:', error)
  }
}