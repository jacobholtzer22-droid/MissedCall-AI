// ===========================================
// GOOGLE SHEETS USAGE SYNC
// ===========================================
// Pushes Telnyx usage data to a Google Sheet for accounting.
// Uses service account auth; share the sheet with the service account email.

import 'server-only'
import { google } from 'googleapis'
import { db } from '@/lib/db'
import { format, subDays } from 'date-fns'

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export interface SheetsSyncResult {
  ok: boolean
  rowsAppended: number
  sheetName: string
  error?: string
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  const sheetId = process.env.GOOGLE_SHEET_ID

  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be set')
  }
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID must be set')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key.replace(/\\n/g, '\n'),
    },
    scopes: [SCOPE],
  })

  return { auth, sheetId }
}

/** Get or create the monthly tab (e.g. "March 2026") */
async function ensureMonthlyTab(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: string,
  date: Date
): Promise<string> {
  const tabName = format(date, 'MMMM yyyy')
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const exists = data.sheets?.some(
    (s) => s.properties?.title === tabName
  )
  if (exists) return tabName

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: tabName },
          },
        },
      ],
    },
  })
  return tabName
}

/** Compute per-business usage for a given date from TelnyxUsageRecord */
async function getUsageForDate(date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const businesses = await db.business.findMany({
    where: { telnyxPhoneNumber: { not: null } },
    select: { id: true, name: true, telnyxPhoneNumber: true },
  })

  const records = await db.telnyxUsageRecord.findMany({
    where: { occurredAt: { gte: dayStart, lte: dayEnd } },
  })

  const byBusiness = new Map<
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

  for (const b of businesses) {
    byBusiness.set(b.id, {
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

  for (const r of records) {
    const row = byBusiness.get(r.businessId)
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
      row.callForwardingCost += r.cost
      row.callMinutes += !isNaN(sec) ? sec / 60 : 0
    }
  }

  return businesses.map((b) => {
    const row = byBusiness.get(b.id) ?? {
      inboundSms: 0,
      outboundSms: 0,
      smsCost: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      callMinutes: 0,
      voiceCost: 0,
      callForwardingCost: 0,
    }
    const total =
      row.smsCost + row.voiceCost + row.callForwardingCost
    return {
      businessName: b.name,
      phoneNumber: b.telnyxPhoneNumber ?? '',
      ...row,
      totalCost: total,
    }
  })
}

/**
 * Sync usage data to Google Sheet.
 * Appends one row per business for the given date to the monthly tab.
 */
export async function syncUsageToGoogleSheets(
  date: Date = subDays(new Date(), 1)
): Promise<SheetsSyncResult> {
  const { auth, sheetId } = getSheetsClient()
  const sheets = google.sheets({ version: 'v4', auth })

  const tabName = await ensureMonthlyTab(sheets, sheetId, date)
  const usage = await getUsageForDate(date)
  const dateStr = format(date, 'yyyy-MM-dd')

  const headers = [
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
    'Call Forwarding Cost',
    'Total Cost',
  ]

  const rows: (string | number)[][] = usage.map((u) => [
    dateStr,
    u.businessName,
    u.phoneNumber,
    u.inboundSms,
    u.outboundSms,
    Math.round(u.smsCost * 10000) / 10000,
    u.inboundCalls,
    u.outboundCalls,
    Math.round(u.callMinutes * 10) / 10,
    Math.round(u.voiceCost * 10000) / 10000,
    Math.round(u.callForwardingCost * 10000) / 10000,
    Math.round(u.totalCost * 10000) / 10000,
  ])

  const totals = usage.reduce(
    (acc, u) => ({
      inboundSms: acc.inboundSms + u.inboundSms,
      outboundSms: acc.outboundSms + u.outboundSms,
      smsCost: acc.smsCost + u.smsCost,
      inboundCalls: acc.inboundCalls + u.inboundCalls,
      outboundCalls: acc.outboundCalls + u.outboundCalls,
      callMinutes: acc.callMinutes + u.callMinutes,
      voiceCost: acc.voiceCost + u.voiceCost,
      callForwardingCost: acc.callForwardingCost + u.callForwardingCost,
      totalCost: acc.totalCost + u.totalCost,
    }),
    {
      inboundSms: 0,
      outboundSms: 0,
      smsCost: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      callMinutes: 0,
      voiceCost: 0,
      callForwardingCost: 0,
      totalCost: 0,
    }
  )

  const summaryRow: (string | number)[] = [
    dateStr,
    'TOTAL',
    '',
    totals.inboundSms,
    totals.outboundSms,
    Math.round(totals.smsCost * 10000) / 10000,
    totals.inboundCalls,
    totals.outboundCalls,
    Math.round(totals.callMinutes * 10) / 10,
    Math.round(totals.voiceCost * 10000) / 10000,
    Math.round(totals.callForwardingCost * 10000) / 10000,
    Math.round(totals.totalCost * 10000) / 10000,
  ]

  let hasHeaders = false
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1`,
    })
    hasHeaders = data.values?.[0]?.[0] === 'Date'
  } catch {
    // Sheet may be new/empty
  }

  const valuesToWrite: (string | number)[][] = hasHeaders
    ? [...rows, summaryRow]
    : [headers, ...rows, summaryRow]

  if (hasHeaders) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A:L`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: valuesToWrite },
    })
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1:L${valuesToWrite.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: valuesToWrite },
    })
  }

  return {
    ok: true,
    rowsAppended: valuesToWrite.length,
    sheetName: tabName,
  }
}
