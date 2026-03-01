// ===========================================
// ADMIN USAGE EXPORT - CSV/Excel download
// ===========================================
// GET: ?dateRange=this_week|this_month|last_month|custom&startDate=&endDate=&format=csv|xlsx

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import {
  getUsageForExport,
  parseExportDateRange,
  type DateRangePreset,
} from '@/lib/usage-export'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'

const ADMIN_USER_ID = process.env.ADMIN_USER_ID

const HEADERS = [
  'Date',
  'Business Name',
  'Phone Number',
  'Inbound SMS',
  'Outbound SMS',
  'SMS Cost',
  'Inbound Calls',
  'Outbound Calls',
  'Call Minutes',
  'Voice Cost',
  'Total Cost',
] as const

function rowToArray(
  row: {
    date?: string
    businessName: string
    phoneNumber: string
    inboundSms: number
    outboundSms: number
    smsCost: number
    inboundCalls: number
    outboundCalls: number
    callMinutes: number
    voiceCost: number
    totalCost: number
  },
  dateOverride?: string
): (string | number)[] {
  return [
    dateOverride ?? row.date ?? '',
    row.businessName,
    row.phoneNumber,
    row.inboundSms,
    row.outboundSms,
    row.smsCost,
    row.inboundCalls,
    row.outboundCalls,
    row.callMinutes,
    row.voiceCost,
    row.totalCost,
  ]
}

function escapeCsv(val: string | number): string {
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n')
}

export async function GET(request: Request) {
  const { userId } = await auth()

  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url = new URL(request.url)
  const dateRange = (url.searchParams.get('dateRange') ?? 'this_month') as DateRangePreset
  const startDate = url.searchParams.get('startDate') ?? undefined
  const endDate = url.searchParams.get('endDate') ?? undefined
  const formatParam = url.searchParams.get('format') ?? 'csv'

  try {
    const range = parseExportDateRange(dateRange, startDate, endDate)
    const { dailyRows, businessSubtotals, grandTotal } = await getUsageForExport(range)

    const rangeLabel = `${format(range.start, 'yyyy-MM-dd')} to ${format(range.end, 'yyyy-MM-dd')}`

    const allRows: (string | number)[][] = [
      HEADERS.slice() as unknown as (string | number)[],
      ...dailyRows.map((r) => rowToArray(r, r.date)),
      [],
      ['Per business subtotals', '', '', '', '', '', '', '', '', '', ''],
      HEADERS.slice() as unknown as (string | number)[],
      ...businessSubtotals.map((b) => rowToArray(b, '')),
      [],
      rowToArray(grandTotal, ''),
    ]

    const filename = `usage-report-${rangeLabel.replace(/\s/g, '-')}`

    if (formatParam === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(allRows)
      XLSX.utils.book_append_sheet(wb, ws, 'Usage Report')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      return new NextResponse(buf, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
      })
    }

    const csv = toCsv(allRows)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  } catch (err) {
    console.error('Usage export failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
