/**
 * Fill PhoneVerification.deliveryStatus from Telnyx.
 *
 *   npx tsx --env-file=.env.local scripts/sync-otp-delivery.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/sync-otp-delivery.ts --apply
 *
 * Why a script and not the send path: a delivery receipt arrives seconds to
 * minutes after the send returns, so the only thing the send can honestly
 * record is "handed to Telnyx". Why not the SMS webhook: that route resolves
 * message.finalized against the Message table, and OTP codes are not Message
 * rows — they belong to no conversation and must not appear in a client inbox.
 *
 * Rows sent before providerMessageId existed are matched on phone plus a ten
 * minute window instead. That is looser than an id and can in principle pick a
 * neighbouring message to the same number; it is only used when there is no id,
 * and the id is stored on every send from now on.
 */

import { db } from '@/lib/db'
import { normalizePhoneNumber } from '@/lib/phone-utils'

const API = 'https://api.telnyx.com/v2'
const APPLY = process.argv.includes('--apply')
const MATCH_WINDOW_MS = 10 * 60 * 1000

type Mdr = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

async function fetchMdrs(dateRange = 'last_7_days'): Promise<Mdr[]> {
  const key = process.env.TELNYX_API_KEY
  if (!key) throw new Error('TELNYX_API_KEY is not set')
  const all: Mdr[] = []
  let page = 1
  let totalPages = 1
  do {
    const params = new URLSearchParams({
      'filter[record_type]': 'messaging',
      'filter[date_range]': dateRange,
      'page[number]': String(page),
      'page[size]': '100',
      sort: '-created_at',
    })
    const res = await fetch(`${API}/detail_records?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Telnyx ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as { data?: Mdr[]; meta?: { total_pages?: number } }
    if (json.data?.length) all.push(...json.data)
    totalPages = json.meta?.total_pages ?? 1
    page++
  } while (page <= totalPages)
  return all
}

async function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const rows = await db.phoneVerification.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true, createdAt: true, providerMessageId: true, deliveryStatus: true },
  })
  const mdrs = await fetchMdrs()
  const byId = new Map<string, Mdr>()
  for (const m of mdrs) {
    const id = str(m.id) || str(m.uuid)
    if (id) byId.set(id, m)
  }

  let matchedById = 0
  let matchedByPhone = 0
  let unmatched = 0
  let written = 0
  const counts = new Map<string, number>()

  for (const row of rows) {
    let mdr = row.providerMessageId ? byId.get(row.providerMessageId) : undefined
    if (mdr) matchedById++
    if (!mdr) {
      const target = normalizePhoneNumber(row.phone)
      const t = row.createdAt.getTime()
      mdr = mdrs.find((m) => {
        if (normalizePhoneNumber(str(m.cld) || str(m.to)) !== target) return false
        const at = new Date(str(m.created_at) || str(m.sent_at) || 0).getTime()
        return Number.isFinite(at) && Math.abs(at - t) < MATCH_WINDOW_MS
      })
      if (mdr) matchedByPhone++
    }
    if (!mdr) {
      unmatched++
      continue
    }

    const status = str(mdr.status) || 'unknown'
    const errors = Array.isArray(mdr.errors) ? (mdr.errors as unknown[]).map(str).filter(Boolean) : []
    const error = errors.join(',') || null
    counts.set(status, (counts.get(status) ?? 0) + 1)

    if (row.deliveryStatus === status) continue
    console.log(
      `${APPLY ? 'WRITE' : 'PLAN '} ${row.createdAt.toISOString().slice(0, 16)} ${row.phone.padEnd(13)} ` +
        `${status}${error ? ` (${error})` : ''}`
    )
    if (APPLY) {
      await db.phoneVerification.update({
        where: { id: row.id },
        data: { deliveryStatus: status, deliveryError: error },
      })
    }
    written++
  }

  console.log(
    '\n' +
      JSON.stringify(
        {
          mode: APPLY ? 'APPLIED' : 'DRY RUN',
          otpRows: rows.length,
          mdrsPulled: mdrs.length,
          matchedById,
          matchedByPhoneAndTime: matchedByPhone,
          unmatched,
          updated: written,
          statuses: Object.fromEntries(counts),
        },
        null,
        1
      )
  )
}

main().finally(() => db.$disconnect())
