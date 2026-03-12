// ===========================================
// CLIENT DASHBOARD: EMAIL CAMPAIGNS — list & create/send
// ===========================================

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'

const BATCH_SIZE = 50

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  const campaigns = await db.emailCampaign.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      subject: true,
      body: true,
      status: true,
      recipientCount: true,
      sentAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      recipientCount: c.recipientCount,
      sentAt: c.sentAt,
      createdAt: c.createdAt,
    })),
  })
}

type RecipientSelection =
  | { type: 'all' }
  | { type: 'tags'; tagIds: string[] }
  | { type: 'status'; statuses: string[] }
  | { type: 'manual'; contactIds: string[] }

export async function POST(request: Request) {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  let body: {
    subject: string
    body: string
    recipientSelection: RecipientSelection
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const subject = body.subject?.trim()
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  const htmlBody = body.body?.trim() || '<p>No content.</p>'

  // Resolve contacts by selection
  const sel = body.recipientSelection as RecipientSelection | undefined
  if (!sel?.type) return NextResponse.json({ error: 'recipientSelection is required' }, { status: 400 })

  let contactIds: string[] = []
  if (sel.type === 'all') {
    const contacts = await db.contact.findMany({
      where: { businessId: business.id, email: { not: null } },
      select: { id: true },
    })
    contactIds = contacts.map((c) => c.id)
  } else if (sel.type === 'tags' && Array.isArray(sel.tagIds) && sel.tagIds.length > 0) {
    const contacts = await db.contact.findMany({
      where: {
        businessId: business.id,
        email: { not: null },
        contactTags: { some: { tagId: { in: sel.tagIds } } },
      },
      select: { id: true },
    })
    contactIds = contacts.map((c) => c.id)
  } else if (sel.type === 'status' && Array.isArray(sel.statuses) && sel.statuses.length > 0) {
    const contacts = await db.contact.findMany({
      where: {
        businessId: business.id,
        email: { not: null },
        status: { in: sel.statuses },
      },
      select: { id: true },
    })
    contactIds = contacts.map((c) => c.id)
  } else if (sel.type === 'manual' && Array.isArray(sel.contactIds) && sel.contactIds.length > 0) {
    const contacts = await db.contact.findMany({
      where: {
        id: { in: sel.contactIds },
        businessId: business.id,
        email: { not: null },
      },
      select: { id: true },
    })
    contactIds = contacts.map((c) => c.id)
  }

  const contactsWithEmail = await db.contact.findMany({
    where: { id: { in: contactIds }, email: { not: null } },
    select: { id: true, email: true },
  })
  const recipientCount = contactsWithEmail.length

  const campaign = await db.emailCampaign.create({
    data: {
      businessId: business.id,
      subject,
      body: htmlBody,
      status: 'sending',
      recipientCount,
    },
  })

  for (const c of contactsWithEmail) {
    await db.emailRecipient.create({
      data: {
        campaignId: campaign.id,
        contactId: c.id,
        email: c.email!,
        status: 'pending',
      },
    })
  }

  // Send in batches via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = 'MissedCall AI <notifications@alignandacquire.com>'
  const recipients = contactsWithEmail.map((r) => r.email!)
  let sent = 0
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    try {
      for (const to of batch) {
        await resend.emails.send({
          from,
          to,
          subject,
          html: htmlBody,
        })
        sent++
      }
    } catch (err) {
      console.error('Dashboard email campaign batch error:', err)
    }
  }

  await db.emailRecipient.updateMany({
    where: { campaignId: campaign.id },
    data: { status: 'sent', sentAt: new Date() },
  })
  await db.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: 'sent', sentAt: new Date() },
  })

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      subject: campaign.subject,
      status: 'sent',
      recipientCount: campaign.recipientCount,
      sentAt: new Date(),
    },
  })
}
