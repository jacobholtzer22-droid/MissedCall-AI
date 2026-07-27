// ===========================================
// CLIENT DASHBOARD: EMAIL CAMPAIGNS — list & create/send
// ===========================================

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { requireDashboardBusiness } from '@/lib/dashboard-auth'
import { hasPersonalizationTokens, personalizeText, plainTextToEmailHtml } from '@/lib/email-format'

const BATCH_SIZE = 50

export async function GET() {
  const authResult = await requireDashboardBusiness()
  if (authResult instanceof NextResponse) return authResult
  const { business } = authResult

  if (!business.massMessagingEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

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
    senderName?: string
    subject: string
    body: string
    bodyIsHtml?: boolean
    images?: { url: string; filename: string; order: number }[]
    recipientSelection: RecipientSelection
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const senderName = body.senderName?.trim() || 'Align and Acquire'
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
    select: { id: true, email: true, name: true },
  })
  const recipientCount = contactsWithEmail.length

  const sortedImages = Array.isArray(body.images)
    ? [...body.images].sort((a, b) => a.order - b.order)
    : []

  const campaign = await db.emailCampaign.create({
    data: {
      businessId: business.id,
      senderName,
      subject,
      body: htmlBody,
      images: sortedImages.length > 0 ? sortedImages : undefined,
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

  // Build final HTML for a contact — if the user sent a full HTML template, use it as-is
  // (with personalization tokens swapped in); otherwise wrap plain text so newlines/spaces
  // survive in email clients. Tokens like [first name] resolve per recipient.
  const plainSource = body.body?.trim() ?? ''
  const imagesHtml = sortedImages.length > 0
    ? sortedImages
        .map(
          (img: { url: string; filename: string }) =>
            `<div style="text-align:center;margin-bottom:16px;"><img src="${img.url}" alt="${img.filename}" style="max-width:600px;width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;" /></div>`
        )
        .join('')
    : ''
  function renderForContact(contact: { name: string | null }): { subject: string; html: string } {
    const personalizedSubject = personalizeText(subject!, contact)
    let html: string
    if (body.bodyIsHtml) {
      html = personalizeText(htmlBody, contact, { html: true })
    } else {
      const personalizedSource = personalizeText(plainSource, contact)
      const renderedBody = personalizedSource ? plainTextToEmailHtml(personalizedSource) : '<p>No content.</p>'
      html = imagesHtml ? `${imagesHtml}${renderedBody}` : renderedBody
    }
    return { subject: personalizedSubject, html }
  }
  // No tokens anywhere → render once and reuse for every recipient
  const isPersonalized = hasPersonalizationTokens(subject) || hasPersonalizationTokens(htmlBody)
  const sharedRender = isPersonalized ? null : renderForContact({ name: null })

  // Send in batches via Resend — per-recipient try/catch so one failure doesn't kill the batch
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = `${campaign.senderName} <notifications@alignandacquire.com>`
  let sent = 0
  const failedContactIds: string[] = []
  for (let i = 0; i < contactsWithEmail.length; i += BATCH_SIZE) {
    const batch = contactsWithEmail.slice(i, i + BATCH_SIZE)
    for (const contact of batch) {
      const rendered = sharedRender ?? renderForContact(contact)
      try {
        const result = await resend.emails.send({
          from,
          to: contact.email!,
          subject: rendered.subject,
          html: rendered.html,
        })
        if (result.error) throw new Error(result.error.message)
        sent++
      } catch (err) {
        failedContactIds.push(contact.id)
        console.error('Dashboard email campaign send error:', contact.email, err)
      }
    }
  }

  await db.emailRecipient.updateMany({
    where: { campaignId: campaign.id, contactId: { notIn: failedContactIds } },
    data: { status: 'sent', sentAt: new Date() },
  })
  if (failedContactIds.length > 0) {
    await db.emailRecipient.updateMany({
      where: { campaignId: campaign.id, contactId: { in: failedContactIds } },
      data: { status: 'failed' },
    })
  }
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
