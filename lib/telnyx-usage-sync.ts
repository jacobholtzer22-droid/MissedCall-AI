// ===========================================
// TELNYX USAGE SYNC - MDR & CDR from Telnyx API
// ===========================================
// Fetches Messaging Detail Records (MDR) and Call Detail Records (CDR)
// from Telnyx Detail Record Search API, stores costs per business.

import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'

/** Normalize phone to E.164 for comparison - same format Telnyx returns */
function normalizePhoneNumber(phone: string | undefined | null): string {
  return normalizeToE164(phone ?? '')
}

function phonesMatchE164(a: string, b: string): boolean {
  const na = normalizePhoneNumber(a)
  const nb = normalizePhoneNumber(b)
  if (!na || !nb) return false
  return na === nb
}

interface TelnyxDetailRecord {
  record_type: string
  uuid?: string
  id?: string
  cost?: string
  created_at?: string
  completed_at?: string
  sent_at?: string
  started_at?: string
  finished_at?: string
  cli?: string
  cld?: string
  from?: string
  to?: string
  direction?: string
  call_sec?: number
  billed_sec?: number
  [key: string]: unknown
}

interface TelnyxDetailRecordsResponse {
  data: TelnyxDetailRecord[]
  meta?: {
    page_number: number
    page_size: number
    total_pages: number
    total_results: number
  }
}

async function fetchTelnyx<T>(path: string): Promise<T> {
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) throw new Error('TELNYX_API_KEY is not set')

  const url = `${TELNYX_API_BASE}${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Telnyx API error ${res.status}: ${errText}`)
  }
  return res.json()
}

/** Fetch all pages of detail records */
async function fetchAllDetailRecords(
  recordType: 'messaging' | 'call-control',
  dateRange: string
): Promise<TelnyxDetailRecord[]> {
  const all: TelnyxDetailRecord[] = []
  let page = 1
  let totalPages = 1

  do {
    const params = new URLSearchParams({
      'filter[record_type]': recordType,
      'filter[date_range]': dateRange,
      'page[number]': String(page),
      'page[size]': '50',
      sort: '-created_at',
    })
    const res = await fetchTelnyx<TelnyxDetailRecordsResponse>(
      `/detail_records?${params}`
    )
    if (res.data?.length) all.push(...res.data)
    totalPages = res.meta?.total_pages ?? 1
    page++
  } while (page <= totalPages)

  return all
}

/** Get business ID for a record by matching phone number.
 * Telnyx uses cli/cld for CDR (calls) and from/to for MDR (messaging).
 * Business number can be either sender or receiver, so check all four. */
async function getBusinessIdForRecord(
  record: TelnyxDetailRecord,
  _recordType: 'sms' | 'call'
): Promise<string | null> {
  const recordPhones = [
    record.cli,
    record.cld,
    record.from,
    record.to,
  ].filter((p): p is string => !!p && typeof p === 'string')

  const businesses = await db.business.findMany({
    where: { telnyxPhoneNumber: { not: null } },
    select: { id: true, telnyxPhoneNumber: true },
  })

  for (const b of businesses) {
    const tn = b.telnyxPhoneNumber
    if (!tn) continue
    for (const recordPhone of recordPhones) {
      if (phonesMatchE164(recordPhone, tn)) return b.id
    }
  }
  return null
}

/** Parse cost string to number */
function parseCost(cost: string | undefined): number {
  if (cost == null || cost === '') return 0
  const n = parseFloat(String(cost))
  return isNaN(n) ? 0 : n
}

/** Get occurred-at timestamp from record */
function getOccurredAt(record: TelnyxDetailRecord): Date {
  const raw =
    record.created_at ??
    record.completed_at ??
    record.sent_at ??
    record.started_at ??
    record.finished_at ??
    new Date().toISOString()
  return new Date(raw)
}

export interface SyncResult {
  mdrsProcessed: number
  cdrsProcessed: number
  messagesUpdated: number
  errors: string[]
}

/**
 * Sync MDR and CDR data from Telnyx into the database.
 * @param dateRange - Telnyx date_range filter: yesterday, last_7_days, last_30_days, last_90_days, etc.
 */
export async function syncTelnyxUsage(
  dateRange: string = 'last_90_days'
): Promise<SyncResult> {
  const result: SyncResult = {
    mdrsProcessed: 0,
    cdrsProcessed: 0,
    messagesUpdated: 0,
    errors: [],
  }

  try {
    const [mdrRecords, cdrRecords] = await Promise.all([
      fetchAllDetailRecords('messaging', dateRange),
      fetchAllDetailRecords('call-control', dateRange),
    ])

    for (const record of mdrRecords) {
      try {
        const businessId = await getBusinessIdForRecord(record, 'sms')
        if (!businessId) continue

        const recordId = record.uuid ?? record.id ?? `mdr-${record.created_at}-${record.cli}-${record.cld}`
        const cost = parseCost(record.cost)
        const occurredAt = getOccurredAt(record)

        await db.telnyxUsageRecord.upsert({
          where: { telnyxRecordId: recordId },
          create: {
            businessId,
            recordType: 'sms',
            telnyxRecordId: recordId,
            cost,
            occurredAt,
            metadata: {
              cli: record.cli,
              cld: record.cld,
              direction: record.direction,
              status: String(record.status ?? ''),
              parts: String(record.parts ?? ''),
            },
          },
          update: {
            cost,
            occurredAt,
            metadata: {
              cli: record.cli,
              cld: record.cld,
              direction: record.direction,
              status: String(record.status ?? ''),
              parts: String(record.parts ?? ''),
            },
          },
        })
        result.mdrsProcessed++

        if (record.uuid && cost > 0) {
          const updated = await db.message.updateMany({
            where: { telnyxSid: record.uuid },
            data: { cost },
          })
          result.messagesUpdated += updated.count
        }
      } catch (err) {
        result.errors.push(`MDR ${record.uuid ?? '?'}: ${String(err)}`)
      }
    }

    for (const record of cdrRecords) {
      try {
        const businessId = await getBusinessIdForRecord(record, 'call')
        if (!businessId) continue

        const recordId =
          record.id ?? record.uuid ?? `cdr-${record.started_at ?? record.created_at}-${record.cli}-${record.cld}`
        const cost = parseCost(record.cost)
        const occurredAt = getOccurredAt(record)

        await db.telnyxUsageRecord.upsert({
          where: { telnyxRecordId: recordId },
          create: {
            businessId,
            recordType: 'call',
            telnyxRecordId: recordId,
            cost,
            occurredAt,
            metadata: {
              cli: record.cli,
              cld: record.cld,
              direction: record.direction,
              call_sec: record.call_sec,
              billed_sec: record.billed_sec,
            },
          },
          update: { cost, occurredAt, metadata: { cli: record.cli, cld: record.cld, direction: record.direction, call_sec: record.call_sec, billed_sec: record.billed_sec } },
        })
        result.cdrsProcessed++
      } catch (err) {
        result.errors.push(`CDR ${record.id ?? '?'}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}
