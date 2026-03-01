// ===========================================
// TELNYX USAGE SYNC - MDR & CDR from Telnyx API
// ===========================================
// Fetches Messaging Detail Records (MDR) and Call Detail Records (CDR)
// from Telnyx Detail Record Search API, stores costs per business.

import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'

/** Map dateRange to filter[date_range] — same format as /api/admin/telnyx-test.
 * "yesterday" not supported by Telnyx filter[date_range], use last_7_days. */
function mapDateRangeToFilter(dateRange: string): string {
  switch (dateRange) {
    case 'yesterday':
      return 'last_7_days'
    case 'last_7_days':
      return 'last_7_days'
    case 'last_30_days':
      return 'last_30_days'
    case 'last_90_days':
      return 'last_90_days'
    default:
      return 'last_7_days'
  }
}

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

type VoiceRecordType = 'call' | 'call-control' | 'sip-trunking'

/** Fetch all pages of detail records.
 * Uses EXACT same API format as /api/admin/telnyx-test: filter[record_type], filter[date_range]. */
async function fetchAllDetailRecords(
  recordType: 'messaging' | VoiceRecordType,
  dateRangeFilter: string
): Promise<TelnyxDetailRecord[]> {
  const all: TelnyxDetailRecord[] = []
  let page = 1
  let totalPages = 1

  do {
    const params = new URLSearchParams({
      'filter[record_type]': recordType,
      'filter[date_range]': dateRangeFilter,
      'page[number]': String(page),
      'page[size]': '100',
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

/** Fetch with fallback: if last_90_days fails, try last_30_days, then last_7_days. */
async function fetchWithFallback(
  recordType: 'messaging' | VoiceRecordType,
  dateRangeFilter: string,
  debugLog: string[]
): Promise<TelnyxDetailRecord[]> {
  const fallbacks: string[] = []
  if (dateRangeFilter === 'last_90_days') {
    fallbacks.push('last_30_days', 'last_7_days')
  } else if (dateRangeFilter === 'last_30_days') {
    fallbacks.push('last_7_days')
  }

  let lastError: Error | null = null
  for (const filter of [dateRangeFilter, ...fallbacks]) {
    try {
      debugLog.push(`Telnyx API: fetching ${recordType} with filter[date_range]=${filter}`)
      const records = await fetchAllDetailRecords(recordType, filter)
      if (filter !== dateRangeFilter) {
        debugLog.push(`  (fallback from ${dateRangeFilter} succeeded with ${filter})`)
      }
      return records
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      debugLog.push(`  filter[date_range]=${filter} failed: ${lastError.message}`)
      if (fallbacks.length === 0 || filter === fallbacks[fallbacks.length - 1]) {
        throw lastError
      }
    }
  }
  throw lastError ?? new Error('Fetch failed')
}

/** Try multiple voice record types in order: call, call-control, sip-trunking. */
async function fetchVoiceRecordsWithFallback(
  dateRangeFilter: string,
  debugLog: string[]
): Promise<TelnyxDetailRecord[]> {
  const voiceTypes: VoiceRecordType[] = ['call', 'call-control', 'sip-trunking']
  let lastError: Error | null = null

  for (const recordType of voiceTypes) {
    try {
      debugLog.push(`Telnyx API: trying voice record_type=${recordType}`)
      const records = await fetchWithFallback(recordType, dateRangeFilter, debugLog)
      debugLog.push(`  ✓ Success with record_type=${recordType}, got ${records.length} records`)
      return records
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      debugLog.push(`  record_type=${recordType} failed: ${lastError.message}`)
    }
  }

  // Last resort: try Usage Reports API (returns aggregated data, cannot attribute per-business)
  try {
    debugLog.push('All CDR record types failed, trying Usage Reports API as fallback...')
    const usage = await fetchUsageReportsFallback(dateRangeFilter)
    if (usage) {
      debugLog.push(`Usage Reports: cost=$${usage.cost.toFixed(4)}, billed_sec=${usage.billedSec}`)
      debugLog.push('(Usage Reports data is account-level only, not stored per-business)')
    }
  } catch (err) {
    debugLog.push(`Usage Reports fallback also failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  throw lastError ?? new Error('All voice CDR record types failed')
}

/** Fallback: fetch sip-trunking usage from Usage Reports API (aggregated, no per-business attribution). */
async function fetchUsageReportsFallback(
  dateRangeFilter: string
): Promise<{ cost: number; billedSec: number } | null> {
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) return null

  const params = new URLSearchParams({
    product: 'sip-trunking',
    dimensions: 'direction',
    metrics: 'cost,billed_sec',
    date_range: dateRangeFilter,
  })
  const res = await fetch(`https://api.telnyx.com/v2/usage_reports?${params}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: Array<{ cost?: number; billed_sec?: number }> }
  const data = json.data ?? []
  let cost = 0
  let billedSec = 0
  for (const row of data) {
    cost += Number(row.cost ?? 0)
    billedSec += Number(row.billed_sec ?? 0)
  }
  return { cost, billedSec }
}

interface BusinessWithPhone {
  id: string
  telnyxPhoneNumber: string | null
  forwardingNumber: string | null
}

/** Get business ID for a record by matching phone number.
 * Telnyx uses cli/cld for CDR (calls) and from/to for MDR (messaging).
 * Business number can be either sender or receiver, so check all four. */
function getBusinessIdForRecord(
  record: TelnyxDetailRecord,
  recordType: 'sms' | 'call',
  businesses: BusinessWithPhone[],
  debugLog: string[]
): string | null {
  const recordPhones = [
    record.cli,
    record.cld,
    record.from,
    record.to,
  ].filter((p): p is string => !!p && typeof p === 'string')

  const fromVal = record.from ?? record.cli ?? '(none)'
  const toVal = record.to ?? record.cld ?? '(none)'

  for (const b of businesses) {
    const tn = b.telnyxPhoneNumber
    if (!tn) continue
    for (const recordPhone of recordPhones) {
      const bizNorm = normalizePhoneNumber(tn)
      const recNorm = normalizePhoneNumber(recordPhone)
      debugLog.push(`Comparing business number [${tn}] (normalized: ${bizNorm}) to record from [${fromVal}] to [${toVal}] (record phone: ${recordPhone}, normalized: ${recNorm})`)
      if (phonesMatchE164(recordPhone, tn)) {
        debugLog.push(`  ✓ MATCHED: record ${recordType} → business ${b.id} (${tn})`)
        return b.id
      }
    }
  }
  debugLog.push(`  ✗ NO MATCH: record ${recordType} from [${fromVal}] to [${toVal}] - no business number matched`)
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
  debugLog: string[]
}

/**
 * Sync MDR and CDR data from Telnyx into the database.
 * @param dateRange - Telnyx date_range filter: yesterday, last_7_days, last_30_days, last_90_days, etc.
 */
export async function syncTelnyxUsage(
  dateRange: string = 'last_90_days'
): Promise<SyncResult> {
  const debugLog: string[] = []
  const result: SyncResult = {
    mdrsProcessed: 0,
    cdrsProcessed: 0,
    messagesUpdated: 0,
    errors: [],
    debugLog,
  }

  try {
    const dateRangeFilter = mapDateRangeToFilter(dateRange)
    debugLog.push(`=== SYNC START (dateRange: ${dateRange}, filter[date_range]: ${dateRangeFilter}) ===`)

    const businesses = await db.business.findMany({
      where: { telnyxPhoneNumber: { not: null } },
      select: { id: true, telnyxPhoneNumber: true, forwardingNumber: true },
    })
    debugLog.push(`Businesses with telnyxPhoneNumber (exactly as stored in DB):`)
    if (businesses.length === 0) {
      debugLog.push('  (none - no businesses have telnyxPhoneNumber set)')
    } else {
      for (const b of businesses) {
        debugLog.push(`  - business ${b.id}: telnyxPhoneNumber = "${b.telnyxPhoneNumber}" (typeof: ${typeof b.telnyxPhoneNumber})`)
      }
    }

    // Run messaging first — MDR is required for SMS costs
    const mdrRecords = await fetchWithFallback('messaging', dateRangeFilter, debugLog)
    debugLog.push(`Fetched ${mdrRecords.length} MDR records from Telnyx API`)

    // Voice CDR fetch is non-blocking — tries call, call-control, sip-trunking, then Usage Reports
    let cdrRecords: TelnyxDetailRecord[] = []
    let voiceFetchFailed = false
    try {
      cdrRecords = await fetchVoiceRecordsWithFallback(dateRangeFilter, debugLog)
      debugLog.push(`Fetched ${cdrRecords.length} voice CDR records from Telnyx API`)
    } catch (err) {
      voiceFetchFailed = true
      const errMsg = err instanceof Error ? err.message : String(err)
      debugLog.push(`Voice CDR fetch failed (non-blocking): ${errMsg}`)
    }

    let mdrMatched = 0
    let mdrUnmatched = 0
    let cdrMatched = 0
    let cdrUnmatched = 0

    for (const record of mdrRecords) {
      const fromVal = record.from ?? '(none)'
      const toVal = record.to ?? '(none)'
      debugLog.push(`MDR record: from=[${fromVal}] to=[${toVal}] (uuid: ${record.uuid ?? '?'})`)
      try {
        const businessId = getBusinessIdForRecord(record, 'sms', businesses, debugLog)
        if (!businessId) {
          mdrUnmatched++
          continue
        }
        mdrMatched++

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
      const cliVal = record.cli ?? '(none)'
      const cldVal = record.cld ?? '(none)'
      debugLog.push(`CDR record: cli(from)=[${cliVal}] cld(to)=[${cldVal}] (id: ${record.id ?? '?'})`)
      try {
        const businessId = getBusinessIdForRecord(record, 'call', businesses, debugLog)
        if (!businessId) {
          cdrUnmatched++
          continue
        }
        cdrMatched++

        // If cld (called number) matches business forwarding number, this is a call-forwarding leg (B-leg)
        const business = businesses.find((b) => b.id === businessId)!
        const isCallForwarding =
          !!business.forwardingNumber &&
          !!record.cld &&
          phonesMatchE164(record.cld, business.forwardingNumber)
        const recordType: 'call' | 'call_forwarding' = isCallForwarding ? 'call_forwarding' : 'call'

        const recordId =
          record.id ?? record.uuid ?? `cdr-${record.started_at ?? record.created_at}-${record.cli}-${record.cld}`
        const cost = parseCost(record.cost)
        const occurredAt = getOccurredAt(record)

        await db.telnyxUsageRecord.upsert({
          where: { telnyxRecordId: recordId },
          create: {
            businessId,
            recordType,
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
          update: {
            cost,
            occurredAt,
            recordType,
            metadata: {
              cli: record.cli,
              cld: record.cld,
              direction: record.direction,
              call_sec: record.call_sec,
              billed_sec: record.billed_sec,
            },
          },
        })
        result.cdrsProcessed++
      } catch (err) {
        result.errors.push(`CDR ${record.id ?? '?'}: ${String(err)}`)
      }
    }

    debugLog.push(`=== SYNC COMPLETE ===`)
    debugLog.push(`Matched ${mdrMatched} MDR records, ${mdrUnmatched} MDR records unmatched`)
    debugLog.push(`Matched ${cdrMatched} CDR records, ${cdrUnmatched} CDR records unmatched`)
    if (voiceFetchFailed) {
      debugLog.push(`Saved ${result.mdrsProcessed} messaging records, voice CDR fetch failed (skipped)`)
    }
  } catch (err) {
    result.errors.push(String(err))
    debugLog.push(`SYNC ERROR: ${String(err)}`)
  }

  return result
}
