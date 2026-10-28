// ===========================================
// /admin/ops: dates Jacob says, read on his clock
// ===========================================
// Pure. Follow-ups the chief records come in as "2026-11-03" or
// "2026-11-03T14:00". Both mean Detroit time (OPS_TIMEZONE); a date alone means
// 9:00 that morning. A string with Z or an offset is taken as given.
// new Date("2026-11-03") would be midnight UTC, 8pm the evening before in Detroit.

import { TZDate } from '@date-fns/tz'

export const DEFAULT_FOLLOW_UP_HOUR = 9

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/

/** Parse a follow-up date in `zone`. null when the string is not a date. */
export function parseLocalDateTime(raw: string, zone = 'America/Detroit'): Date | null {
  const s = raw.trim()
  const m = LOCAL.exec(s)
  if (m) {
    const [, y, mo, d, h, mi, sec] = m
    const hour = h === undefined ? DEFAULT_FOLLOW_UP_HOUR : Number(h)
    const date = new TZDate(Number(y), Number(mo) - 1, Number(d), hour, Number(mi ?? 0), Number(sec ?? 0), zone)
    const out = new Date(date.getTime())
    return Number.isNaN(out.getTime()) ? null : out
  }
  // Z or an explicit offset: an exact instant already.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const out = new Date(s)
    return Number.isNaN(out.getTime()) ? null : out
  }
  return null
}
