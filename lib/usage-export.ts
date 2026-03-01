// ===========================================
// USAGE EXPORT - Aggregate usage for date range
// ===========================================
// Used by admin export API to generate CSV/Excel reports

import { db } from '@/lib/db'
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  format,
  parseISO,
} from 'date-fns'

export type DateRangePreset = 'this_week' | 'this_month' | 'last_month' | 'custom'

export interface ExportDateRange {
  start: Date
  end: Date
}

export function parseExportDateRange(
  preset: DateRangePreset,
  startDate?: string,
  endDate?: string
): ExportDateRange {
  const now = new Date()

  switch (preset) {
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      }
    case 'this_month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
    case 'last_month': {
      const lastMonth = subMonths(now, 1)
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      }
    }
    case 'custom':
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate required for custom range')
      }
      return {
        start: startOfDay(parseISO(startDate)),
        end: endOfDay(parseISO(endDate)),
      }
    default:
      throw new Error(`Invalid date range preset: ${preset}`)
  }
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

export interface DailyUsageRow {
  date: string
  businessId: string
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
}

export interface BusinessSubtotal {
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
}

export interface ExportResult {
  dailyRows: DailyUsageRow[]
  businessSubtotals: BusinessSubtotal[]
  grandTotal: BusinessSubtotal
}

export async function getUsageForExport(range: ExportDateRange): Promise<ExportResult> {
  const dayStart = new Date(range.start)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(range.end)
  dayEnd.setHours(23, 59, 59, 999)

  const businesses = await db.business.findMany({
    where: { telnyxPhoneNumber: { not: null } },
    select: { id: true, name: true, telnyxPhoneNumber: true },
  })

  const records = await db.telnyxUsageRecord.findMany({
    where: { occurredAt: { gte: dayStart, lte: dayEnd } },
  })

  const days = eachDayOfInterval({ start: dayStart, end: dayEnd })
  const byDayAndBusiness = new Map<
    string,
    {
      inboundSms: number
      outboundSms: number
      smsCost: number
      inboundCalls: number
      outboundCalls: number
      callMinutes: number
      voiceCost: number
      callForwardingCost: number
    }
  >()

  function key(day: string, bizId: string) {
    return `${day}|${bizId}`
  }

  for (const d of days) {
    const dayStr = format(d, 'yyyy-MM-dd')
    for (const b of businesses) {
      byDayAndBusiness.set(key(dayStr, b.id), {
        inboundSms: 0,
        outboundSms: 0,
        smsCost: 0,
        inboundCalls: 0,
        outboundCalls: 0,
        callMinutes: 0,
        voiceCost: 0,
        callForwardingCost: 0,
      })
    }
  }

  for (const r of records) {
    const occurredDate = format(r.occurredAt, 'yyyy-MM-dd')
    const k = key(occurredDate, r.businessId)
    const row = byDayAndBusiness.get(k)
    if (!row) continue

    const meta = (r.metadata ?? {}) as Record<string, unknown>
    const direction = String(meta.direction ?? '').toLowerCase()
    const sec = Number(meta.billed_sec ?? meta.call_sec ?? 0)

    if (r.recordType === 'sms') {
      if (direction === 'inbound') row.inboundSms++
      else row.outboundSms++
      row.smsCost += r.cost
    } else if (r.recordType === 'call') {
      if (direction === 'inbound') row.inboundCalls++
      else row.outboundCalls++
      row.callMinutes += !isNaN(sec) ? sec / 60 : 0
      row.voiceCost += r.cost
    } else if (r.recordType === 'call_forwarding') {
      row.callMinutes += !isNaN(sec) ? sec / 60 : 0
      row.voiceCost += r.cost
    }
  }

  const dailyRows: DailyUsageRow[] = []
  const businessTotals = new Map<
    string,
    {
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
    }
  >()

  for (const b of businesses) {
    businessTotals.set(b.id, {
      businessName: b.name,
      phoneNumber: b.telnyxPhoneNumber ?? '',
      inboundSms: 0,
      outboundSms: 0,
      smsCost: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      callMinutes: 0,
      voiceCost: 0,
      totalCost: 0,
    })
  }

  for (const d of days) {
    const dayStr = format(d, 'yyyy-MM-dd')
    for (const b of businesses) {
      const row = byDayAndBusiness.get(key(dayStr, b.id)) ?? {
        inboundSms: 0,
        outboundSms: 0,
        smsCost: 0,
        inboundCalls: 0,
        outboundCalls: 0,
        callMinutes: 0,
        voiceCost: 0,
        callForwardingCost: 0,
      }
      const totalCost = row.smsCost + row.voiceCost + row.callForwardingCost

      dailyRows.push({
        date: dayStr,
        businessId: b.id,
        businessName: b.name,
        phoneNumber: b.telnyxPhoneNumber ?? '',
        inboundSms: row.inboundSms,
        outboundSms: row.outboundSms,
        smsCost: Math.round(row.smsCost * 10000) / 10000,
        inboundCalls: row.inboundCalls,
        outboundCalls: row.outboundCalls,
        callMinutes: Math.round(row.callMinutes * 10) / 10,
        voiceCost: Math.round((row.voiceCost + row.callForwardingCost) * 10000) / 10000,
        totalCost: Math.round(totalCost * 10000) / 10000,
      })

      const bt = businessTotals.get(b.id)!
      bt.inboundSms += row.inboundSms
      bt.outboundSms += row.outboundSms
      bt.smsCost += row.smsCost
      bt.inboundCalls += row.inboundCalls
      bt.outboundCalls += row.outboundCalls
      bt.callMinutes += row.callMinutes
      bt.voiceCost += row.voiceCost + row.callForwardingCost
      bt.totalCost += totalCost
    }
  }

  const businessSubtotals: BusinessSubtotal[] = businesses.map((b) => {
    const bt = businessTotals.get(b.id)!
    return {
      businessName: bt.businessName,
      phoneNumber: bt.phoneNumber,
      inboundSms: bt.inboundSms,
      outboundSms: bt.outboundSms,
      smsCost: Math.round(bt.smsCost * 10000) / 10000,
      inboundCalls: bt.inboundCalls,
      outboundCalls: bt.outboundCalls,
      callMinutes: Math.round(bt.callMinutes * 10) / 10,
      voiceCost: Math.round(bt.voiceCost * 10000) / 10000,
      totalCost: Math.round(bt.totalCost * 10000) / 10000,
    }
  })
  const grandTotal: BusinessSubtotal = businessSubtotals.reduce(
    (acc, b) => ({
      businessName: 'TOTAL',
      phoneNumber: '',
      inboundSms: acc.inboundSms + b.inboundSms,
      outboundSms: acc.outboundSms + b.outboundSms,
      smsCost: acc.smsCost + b.smsCost,
      inboundCalls: acc.inboundCalls + b.inboundCalls,
      outboundCalls: acc.outboundCalls + b.outboundCalls,
      callMinutes: acc.callMinutes + b.callMinutes,
      voiceCost: acc.voiceCost + b.voiceCost,
      totalCost: acc.totalCost + b.totalCost,
    }),
    {
      businessName: 'TOTAL',
      phoneNumber: '',
      inboundSms: 0,
      outboundSms: 0,
      smsCost: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      callMinutes: 0,
      voiceCost: 0,
      totalCost: 0,
    }
  )

  grandTotal.smsCost = Math.round(grandTotal.smsCost * 10000) / 10000
  grandTotal.voiceCost = Math.round(grandTotal.voiceCost * 10000) / 10000
  grandTotal.totalCost = Math.round(grandTotal.totalCost * 10000) / 10000
  grandTotal.callMinutes = Math.round(grandTotal.callMinutes * 10) / 10

  return {
    dailyRows,
    businessSubtotals,
    grandTotal,
  }
}
