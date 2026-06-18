// scripts/export-conversations.ts
//
// Pulls all SMS conversations from the last 60 days, anonymizes names/phones/
// emails/addresses inside both metadata AND message content, and writes JSONL.
//
// One line per message. Conversation-level outcome flags are repeated on each
// message line so the file is self-contained for downstream analysis.
//
// Run:
//   npx tsx scripts/export-conversations.ts
//
// Output:
//   ./conversations-export-<YYYY-MM-DD>.jsonl

import { PrismaClient } from '@prisma/client'
import { createWriteStream } from 'fs'

const prisma = new PrismaClient()

const DAYS_BACK = 60

// ---------- Anonymization registries (stable within a single run) ----------

const phoneMap = new Map<string, string>()
const nameMap = new Map<string, string>()
const convIdMap = new Map<string, string>()
let phoneCounter = 0
let nameCounter = 0
let convCounter = 0

function anonPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length < 10) return '[PHONE_REDACTED]'
  if (!phoneMap.has(digits)) {
    phoneCounter++
    phoneMap.set(digits, `CALLER_${String(phoneCounter).padStart(4, '0')}`)
  }
  return phoneMap.get(digits)!
}

function anonName(name: string | null | undefined): string | null {
  if (!name) return null
  const key = name.trim().toLowerCase()
  if (!key) return null
  if (!nameMap.has(key)) {
    nameCounter++
    nameMap.set(key, `NAME_${String(nameCounter).padStart(4, '0')}`)
  }
  return nameMap.get(key)!
}

function anonConvId(id: string): string {
  if (!convIdMap.has(id)) {
    convCounter++
    convIdMap.set(id, `CONV_${String(convCounter).padStart(5, '0')}`)
  }
  return convIdMap.get(id)!
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------- Content scrubber: strip PII from raw message text ----------

function scrubContent(
  content: string,
  knownName?: string | null,
  knownPhone?: string | null,
  knownEmail?: string | null,
  knownAddress?: string | null,
): string {
  let out = content

  // 1. Replace the conversation's known caller name (and first-name only)
  if (knownName && knownName.trim().length > 1) {
    const anon = anonName(knownName)!
    out = out.replace(new RegExp(escapeRegex(knownName.trim()), 'gi'), anon)
    const first = knownName.trim().split(/\s+/)[0]
    if (first && first.length > 1) {
      out = out.replace(new RegExp(`\\b${escapeRegex(first)}\\b`, 'gi'), anon)
    }
  }

  // 2. Replace the conversation's known caller phone (any format)
  if (knownPhone) {
    const d = knownPhone.replace(/\D/g, '').slice(-10)
    if (d.length === 10) {
      const anon = anonPhone(knownPhone)!
      const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6)
      const pattern = new RegExp(
        `\\+?1?[\\s\\-.]?\\(?${a}\\)?[\\s\\-.]?${b}[\\s\\-.]?${c}`,
        'g',
      )
      out = out.replace(pattern, anon)
    }
  }

  // 3. Generic phone numbers (catches any other phones mentioned in the body)
  out = out.replace(
    /\+?1?[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g,
    (m) => anonPhone(m) ?? '[PHONE_REDACTED]',
  )

  // 4. Known email (whole-string match) and generic email pattern
  if (knownEmail) {
    out = out.replace(new RegExp(escapeRegex(knownEmail), 'gi'), '[EMAIL_REDACTED]')
  }
  out = out.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL_REDACTED]',
  )

  // 5. Known address (whole-string match) and generic street-address pattern
  if (knownAddress && knownAddress.trim().length > 5) {
    out = out.replace(new RegExp(escapeRegex(knownAddress.trim()), 'gi'), '[ADDRESS_REDACTED]')
  }
  out = out.replace(
    /\b\d{1,6}\s+[A-Za-z][A-Za-z0-9.'-]*(?:\s+[A-Za-z][A-Za-z0-9.'-]*){0,4}\s+(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Cir|Circle|Way|Pl|Place|Hwy|Highway|Pkwy|Parkway|Ter|Terrace|Trl|Trail)\b\.?/gi,
    '[ADDRESS_REDACTED]',
  )

  return out
}

// ---------- Main ----------

async function main() {
  const since = new Date()
  since.setDate(since.getDate() - DAYS_BACK)

  console.error(`Fetching conversations updated since ${since.toISOString()}...`)

  const conversations = await prisma.conversation.findMany({
    where: { updatedAt: { gte: since } },
    include: {
      business: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      appointment: { select: { scheduledAt: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.error(`Found ${conversations.length} conversations`)

  const today = new Date().toISOString().slice(0, 10)
  const outPath = `./conversations-export-${today}.jsonl`
  const stream = createWriteStream(outPath, { encoding: 'utf-8' })

  let totalMessages = 0
  let convsWithNoMessages = 0

  for (const conv of conversations) {
    // Pre-register anon IDs so they're stable across all this conv's messages
    const callerId = anonPhone(conv.callerPhone)
    const callerName = anonName(conv.callerName)
    const convId = anonConvId(conv.id)

    if (conv.messages.length === 0) {
      convsWithNoMessages++
      continue
    }

    const outcome = {
      status: conv.status,
      intent: conv.intent ?? null,
      service_requested: conv.serviceRequested ?? null,
      call_connected: conv.callConnected,
      manual_mode: conv.manualMode,
      dial_call_status: conv.dialCallStatus ?? null,
      answered_by: conv.answeredBy ?? null,
      duration_seconds: conv.durationSeconds ?? null,
      customer_timeframe: conv.customerTimeframe ?? null,
      booking_flow_step:
        (conv.bookingFlowState as { step?: string } | null)?.step ?? null,
      had_appointment: !!conv.appointment,
      appointment_status: conv.appointment?.status ?? null,
      caller_id: callerId,
      caller_name: callerName,
      message_count: conv.messages.length,
    }

    for (const msg of conv.messages) {
      const record = {
        conversation_id: convId,
        business_name: conv.business.name,
        direction: msg.direction,
        content: scrubContent(
          msg.content,
          conv.callerName,
          conv.callerPhone,
          conv.customerEmail,
          conv.customerAddress,
        ),
        timestamp: msg.createdAt.toISOString(),
        outcome,
      }
      stream.write(JSON.stringify(record) + '\n')
      totalMessages++
    }
  }

  stream.end()
  await new Promise<void>((resolve) => stream.on('finish', () => resolve()))

  console.error('---')
  console.error(`Wrote ${totalMessages} messages from ${conversations.length} conversations`)
  console.error(`Skipped ${convsWithNoMessages} conversations with zero messages`)
  console.error(`Unique anonymized callers: ${phoneCounter}`)
  console.error(`Unique anonymized names:   ${nameCounter}`)
  console.error(`Output: ${outPath}`)
}

main()
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
