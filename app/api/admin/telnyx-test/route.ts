// ADMIN DEBUG - Test Telnyx Detail Records API directly
// Calls GET /v2/detail_records with messaging filter, last 7 days.
// Returns raw response for debugging cost/phone number mismatches.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'
const ADMIN_USER_ID = process.env.ADMIN_USER_ID

interface TelnyxDetailRecord {
  record_type?: string
  uuid?: string
  id?: string
  cost?: string
  created_at?: string
  completed_at?: string
  sent_at?: string
  cli?: string
  cld?: string
  from?: string
  to?: string
  direction?: string
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

export async function GET() {
  const { userId } = await auth()
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TELNYX_API_KEY is not set' }, { status: 500 })
  }

  try {
    const params = new URLSearchParams({
      'filter[record_type]': 'messaging',
      'filter[date_range]': 'last_7_days',
      'page[number]': '1',
      'page[size]': '100',
      sort: '-created_at',
    })
    const url = `${TELNYX_API_BASE}/detail_records?${params}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    const raw = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Telnyx API error ${res.status}`,
          raw,
        },
        { status: res.status >= 500 ? 502 : 400 }
      )
    }

    const data = (raw as TelnyxDetailRecordsResponse).data ?? []
    const totalCount = (raw as TelnyxDetailRecordsResponse).meta?.total_results ?? data.length

    const records = data.map((r: TelnyxDetailRecord) => ({
      from: r.cli ?? r.from ?? '—',
      to: r.cld ?? r.to ?? '—',
      direction: r.direction ?? '—',
      cost: r.cost ?? '0',
      created_at: r.created_at ?? r.completed_at ?? r.sent_at ?? '—',
      uuid: r.uuid ?? r.id,
    }))

    return NextResponse.json({
      totalCount,
      meta: (raw as TelnyxDetailRecordsResponse).meta,
      records,
      raw,
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err), raw: null },
      { status: 500 }
    )
  }
}
