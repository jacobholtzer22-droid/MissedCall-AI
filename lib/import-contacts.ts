import * as XLSX from 'xlsx'
import { normalizePhoneNumber } from './phone-utils'

const PHONE_COLUMN_NAMES = ['phone', 'mobile', 'cell', 'number', 'telephone', 'phone number', 'contact', 'phonenumber']
const NAME_COLUMN_NAMES = ['name', 'first name', 'firstname', 'full name', 'fullname', 'contact name', 'contactname']

function looksLikePhone(value: unknown): boolean {
  if (value == null) return false
  const s = String(value).replace(/\D/g, '')
  return s.length >= 10 && s.length <= 15
}

function findPhoneColumn(headers: string[], rows: unknown[][]): number {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const name of PHONE_COLUMN_NAMES) {
    const idx = lower.indexOf(name)
    if (idx >= 0) return idx
  }
  // Fallback: column where most values look like phones
  let best = -1
  let bestScore = 0
  for (let c = 0; c < headers.length; c++) {
    let phoneLike = 0
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      if (looksLikePhone(rows[r]?.[c])) phoneLike++
    }
    if (rows.length > 0 && phoneLike / Math.min(rows.length, 100) >= 0.5 && phoneLike > bestScore) {
      bestScore = phoneLike
      best = c
    }
  }
  return best
}

function findNameColumn(headers: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const name of NAME_COLUMN_NAMES) {
    const idx = lower.indexOf(name)
    if (idx >= 0) return idx
  }
  return -1
}

export interface ParsedContact {
  phoneNumber: string
  name: string | null
}

export interface ParseResult {
  contacts: ParsedContact[]
  totalRows: number
  invalidSkipped: number
}

export function parseContactFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('Could not read file'))
          return
        }
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        if (!sheet) {
          reject(new Error('No sheet found'))
          return
        }
        const json = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
        }) as unknown[][]
        if (json.length < 2) {
          resolve({ contacts: [], totalRows: json.length, invalidSkipped: 0 })
          return
        }
        const headers = (json[0] ?? []).map((h) => String(h ?? ''))
        const rows = json.slice(1) as unknown[][]

        const phoneCol = findPhoneColumn(headers, rows)
        const nameCol = findNameColumn(headers)

        if (phoneCol < 0) {
          reject(new Error('Could not find a phone number column. Look for columns named "phone", "mobile", "cell", "number", or similar.'))
          return
        }

        const seen = new Set<string>()
        const contacts: ParsedContact[] = []
        let invalidSkipped = 0

        for (const row of rows) {
          const rawPhone = String(row[phoneCol] ?? '').trim()
          if (!rawPhone) continue
          const phoneNumber = normalizePhoneNumber(rawPhone)
          if (phoneNumber.length < 10) {
            invalidSkipped++
            continue
          }
          if (seen.has(phoneNumber)) continue
          seen.add(phoneNumber)
          const name =
            nameCol >= 0 && row[nameCol] != null
              ? String(row[nameCol]).trim() || null
              : null
          contacts.push({ phoneNumber, name })
        }

        resolve({
          contacts,
          totalRows: rows.length,
          invalidSkipped,
        })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsBinaryString(file)
  })
}
