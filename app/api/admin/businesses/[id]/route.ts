import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const allowedFields = [
      'name',
      'calendarEnabled',
      'telnyxPhoneNumber',
      'notificationSenderNumber',
      'forwardingNumber',
      'timezone',
      'businessHours',
      'servicesOffered',
      'aiGreeting',
      'aiInstructions',
      'aiContext',
      'subscriptionStatus',
      'spamFilterEnabled',
      'adminNotes',
      'setupFee',
      'monthlyFee',
      'callScreenerEnabled',
      'callScreenerMessage',
      'missedCallVoiceMessage',
      'missedCallAiEnabled',
      'knownContactVoicemailEnabled',
      'noReplyAlertEnabled',
      'noReplyAlertMinutes',
      'slotDurationMinutes',
      'bufferMinutes',
      'smsBookingEnabled',
      'cooldownBypassNumbers',
      'bookingPageTitle',
      'bookingPageServiceLabel',
      'bookingPageConfirmation',
      'bookingPageHeaderTagline',
      'bookingPageSubtitle',
      'bookingPageDateLabel',
      'bookingPageNotesLabel',
      'bookingPageNotesPlaceholder',
      'bookingHideAddress',
      'bookingConfirmationSmsText',
      'bookingRequiresAddress',
      'businessType',
      'maxMessagesPerConversation',
      'ownerEmail',
      'ownerPhone',
      'googleAdsEnabled',
      'googleAdsCustomerId',
      'googleAdsTabLabel',
      'smsCooldownDays',
      'massMessagingEnabled',
      'ownerGroupId',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field]
    }

    // noReplyAlertMinutes: coerce to a sane integer (min 5 minutes, default 60)
    if (data.noReplyAlertMinutes !== undefined) {
      const parsed = parseInt(String(data.noReplyAlertMinutes), 10)
      data.noReplyAlertMinutes = Number.isFinite(parsed) && parsed >= 5 ? parsed : 60
    }

    // ownerGroupId: trim whitespace; empty/blank clears the group (saves as null)
    if (data.ownerGroupId !== undefined) {
      const raw = data.ownerGroupId
      data.ownerGroupId = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    }

    // Normalize telnyxPhoneNumber to E.164 (+1XXXXXXXXXX) for Telnyx API matching
    if (data.telnyxPhoneNumber !== undefined) {
      const raw = data.telnyxPhoneNumber
      data.telnyxPhoneNumber = raw && typeof raw === 'string' && raw.trim()
        ? normalizeToE164(raw.trim()) || null
        : null
    }

    // Normalize notificationSenderNumber to E.164 (shared fallback FROM for owner alerts)
    if (data.notificationSenderNumber !== undefined) {
      const raw = data.notificationSenderNumber
      data.notificationSenderNumber = raw && typeof raw === 'string' && raw.trim()
        ? normalizeToE164(raw.trim()) || null
        : null
    }

    // A notification sender must never be a client's own Telnyx number: the owner's
    // STOP/reply would land in that client's inbound SMS webhook and be handled as a
    // lead conversation. Sharing one dedicated number across businesses is fine and
    // expected, so only the collision with telnyxPhoneNumber is rejected.
    if (typeof data.notificationSenderNumber === 'string' && data.notificationSenderNumber) {
      const clash = await db.business.findFirst({
        where: { telnyxPhoneNumber: data.notificationSenderNumber },
        select: { name: true },
      })
      if (clash) {
        return NextResponse.json(
          {
            error: `That number is a client Telnyx number (${clash.name}). Owner replies would route into their AI flow. Pick a dedicated number.`,
          },
          { status: 400 }
        )
      }
    }

    // Parse cooldownBypassNumbers: comma-separated string → JSON array of E.164 numbers
    if (data.cooldownBypassNumbers !== undefined) {
      const raw = data.cooldownBypassNumbers
      if (Array.isArray(raw)) {
        data.cooldownBypassNumbers = raw
          .map((v) => (typeof v === 'string' ? normalizeToE164(v.trim()) : ''))
          .filter(Boolean)
      } else if (typeof raw === 'string' && raw.trim()) {
        data.cooldownBypassNumbers = raw
          .split(/[,;\s]+/)
          .map((s) => normalizeToE164(s.trim()))
          .filter(Boolean)
      } else {
        data.cooldownBypassNumbers = []
      }
    }

    const business = await db.business.update({
      where: { id },
      data,
    })

    return NextResponse.json({ business })
  } catch (error) {
    console.error('Admin: Failed to update business:', error)
    return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
  }
}